drop function if exists public.delete_event_photo_metadata(uuid,integer);
drop function if exists public.list_my_past_event_albums();
drop function if exists public.list_partner_visible_event_albums(uuid);

alter table public.event_photos drop constraint if exists event_photos_event_id_key;

alter table public.profile_preferences
  add column if not exists participant_album_visibility text not null default 'private'
  check (participant_album_visibility in ('private','partners'));

create table if not exists public.participant_album_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_event_photo_id uuid null references public.event_photos(id) on delete set null,
  source_event_id uuid not null references public.events(id),
  event_name_snapshot text not null,
  event_date_snapshot date null,
  original_url text not null,
  watermarked_url text not null,
  imported_at timestamptz not null default now()
);
create unique index if not exists participant_album_photos_profile_source_uq
  on public.participant_album_photos(profile_id, source_event_photo_id)
  where source_event_photo_id is not null;
create index if not exists participant_album_photos_profile_idx
  on public.participant_album_photos(profile_id, imported_at desc);
alter table public.participant_album_photos enable row level security;
revoke all on public.participant_album_photos from anon, authenticated;

create or replace function public.is_actual_event_participant(p_event_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select p_profile_id is not null and exists(select 1 from public.entries en join public.entry_players ep on ep.entry_id=en.id and ep.active=true join public.players pl on pl.id=ep.player_id where en.event_id=p_event_id and en.status<>'withdrawn' and pl.linked_user_id=p_profile_id) $$;

create or replace function public.list_event_photos(p_event_id uuid)
returns table(id uuid,event_id uuid,original_url text,watermarked_url text,uploaded_at timestamptz,version integer,saved_to_my_album boolean)
language plpgsql stable security definer set search_path=''
as $$ declare me uuid:=public.current_profile_id(); e public.events; begin select * into e from public.events where id=p_event_id; if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if; if me is null or (e.owner_user_id is distinct from me and not public.is_actual_event_participant(p_event_id,me)) then raise exception 'FORBIDDEN'; end if; return query select ph.id,ph.event_id,ph.original_url,ph.watermarked_url,ph.uploaded_at,ph.version,exists(select 1 from public.participant_album_photos pap where pap.profile_id=me and pap.source_event_photo_id=ph.id) from public.event_photos ph where ph.event_id=p_event_id order by ph.uploaded_at desc,ph.id; end $$;

create or replace function public.add_event_photo(p_event_id uuid,p_original text,p_watermarked text)
returns public.event_photos language plpgsql security definer set search_path=''
as $$ declare e public.events; result public.event_photos; begin select * into e from public.events where id=p_event_id for update; if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then raise exception 'FORBIDDEN'; end if; if e.status<>'finished' then raise exception 'EVENT_NOT_FINISHED'; end if; if not public.can_upload_photo(p_original) or not public.can_upload_photo(p_watermarked) or split_part(p_original,'/',2)<>p_event_id::text or split_part(p_watermarked,'/',2)<>p_event_id::text then raise exception 'INVALID_PHOTO'; end if; if not exists(select 1 from storage.objects where bucket_id='event-photos' and name=p_original) or not exists(select 1 from storage.objects where bucket_id='event-photos' and name=p_watermarked) then raise exception 'INVALID_PHOTO'; end if; insert into public.event_photos(event_id,original_url,watermarked_url,event_visible,removed_from_event_at,removed_by_user_id) values(p_event_id,p_original,p_watermarked,true,null,null) returning * into result; return result; end $$;

create function public.delete_event_photo_metadata(p_photo_id uuid,p_version integer)
returns public.event_photos language plpgsql security definer set search_path=''
as $$ declare existing public.event_photos; e public.events; deleted public.event_photos; begin select ph.* into existing from public.event_photos ph where ph.id=p_photo_id; if existing.id is null then return null; end if; select * into e from public.events where id=existing.event_id for update; if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then raise exception 'FORBIDDEN'; end if; select ph.* into existing from public.event_photos ph where ph.id=p_photo_id; if existing.id is null then return null; end if; if existing.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if; delete from public.event_photos where id=p_photo_id and version=p_version returning * into deleted; if deleted.id is null then raise exception 'VERSION_CONFLICT'; end if; return deleted; end $$;

create or replace function public.prepare_personal_album_import(p_photo_id uuid)
returns table(photo_id uuid,event_id uuid,event_name text,event_date date,original_url text,watermarked_url text)
language plpgsql stable security definer set search_path=''
as $$ declare me uuid:=public.current_profile_id(); ph public.event_photos; e public.events; begin if me is null then raise exception 'PROFILE_REQUIRED'; end if; select * into ph from public.event_photos where id=p_photo_id; if ph.id is null then raise exception 'PHOTO_NOT_FOUND'; end if; if not public.is_actual_event_participant(ph.event_id,me) then raise exception 'FORBIDDEN'; end if; if exists(select 1 from public.participant_album_photos pap where pap.profile_id=me and pap.source_event_photo_id=p_photo_id) then raise exception 'ALREADY_SAVED'; end if; select * into e from public.events where id=ph.event_id; return query select ph.id,ph.event_id,e.name,e.event_date,ph.original_url,ph.watermarked_url; end $$;

create or replace function public.finalize_personal_album_import(p_photo_id uuid,p_original text,p_watermarked text)
returns public.participant_album_photos language plpgsql security definer set search_path=''
as $$ declare me uuid:=public.current_profile_id(); ph public.event_photos; e public.events; result public.participant_album_photos; expected text; begin if me is null then raise exception 'PROFILE_REQUIRED'; end if; select * into ph from public.event_photos where id=p_photo_id; if ph.id is null then raise exception 'PHOTO_NOT_FOUND'; end if; if not public.is_actual_event_participant(ph.event_id,me) then raise exception 'FORBIDDEN'; end if; expected:='personal/'||me::text||'/'; if p_original not like expected||'%' or p_watermarked not like expected||'%' or p_original=p_watermarked then raise exception 'INVALID_PHOTO'; end if; if not exists(select 1 from storage.objects where bucket_id='event-photos' and name=p_original) or not exists(select 1 from storage.objects where bucket_id='event-photos' and name=p_watermarked) then raise exception 'INVALID_PHOTO'; end if; select * into e from public.events where id=ph.event_id; insert into public.participant_album_photos(profile_id,source_event_photo_id,source_event_id,event_name_snapshot,event_date_snapshot,original_url,watermarked_url) values(me,ph.id,ph.event_id,e.name,e.event_date,p_original,p_watermarked) on conflict(profile_id,source_event_photo_id) where source_event_photo_id is not null do update set source_event_photo_id=excluded.source_event_photo_id returning * into result; return result; end $$;

create function public.list_my_past_event_albums()
returns table(asset_id uuid,event_id uuid,event_name text,event_date date,uploaded_at timestamptz)
language sql stable security definer set search_path=''
as $$ with me as(select public.current_profile_id() id) select pap.id,pap.source_event_id,pap.event_name_snapshot,pap.event_date_snapshot,pap.imported_at from me join public.participant_album_photos pap on pap.profile_id=me.id order by pap.event_date_snapshot desc nulls last,pap.imported_at desc $$;

create or replace function public.get_personal_album_asset(p_asset_id uuid,p_target_profile_id uuid default null)
returns table(asset_id uuid,owner_profile_id uuid,original_url text,watermarked_url text,can_view_original boolean)
language plpgsql stable security definer set search_path=''
as $$ declare me uuid:=public.current_profile_id(); target uuid; vis text; begin if me is null then raise exception 'PROFILE_REQUIRED'; end if; select pap.profile_id into target from public.participant_album_photos pap where pap.id=p_asset_id; if target is null then raise exception 'PHOTO_NOT_FOUND'; end if; if p_target_profile_id is not null and target is distinct from p_target_profile_id then raise exception 'FORBIDDEN'; end if; if target=me then return query select pap.id,pap.profile_id,pap.original_url,pap.watermarked_url,true from public.participant_album_photos pap where pap.id=p_asset_id; return; end if; select pp.participant_album_visibility into vis from public.profile_preferences pp where pp.profile_id=target; if coalesce(vis,'private')<>'partners' or not exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me and c.addressee_user_id=target) or (c.addressee_user_id=me and c.requester_user_id=target))) then raise exception 'FORBIDDEN'; end if; return query select pap.id,pap.profile_id,null::text,pap.watermarked_url,false from public.participant_album_photos pap where pap.id=p_asset_id; end $$;

create function public.list_partner_visible_event_albums(p_profile_id uuid)
returns table(asset_id uuid,event_id uuid,event_name text,event_date date,uploaded_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$ declare me uuid:=public.current_profile_id(); vis text; begin if me is null or me=p_profile_id then raise exception 'FORBIDDEN'; end if; if not exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me and c.addressee_user_id=p_profile_id) or (c.addressee_user_id=me and c.requester_user_id=p_profile_id))) then raise exception 'FORBIDDEN'; end if; select pp.participant_album_visibility into vis from public.profile_preferences pp where pp.profile_id=p_profile_id; if coalesce(vis,'private')<>'partners' then return; end if; return query select pap.id,pap.source_event_id,pap.event_name_snapshot,pap.event_date_snapshot,pap.imported_at from public.participant_album_photos pap where pap.profile_id=p_profile_id order by pap.event_date_snapshot desc nulls last,pap.imported_at desc; end $$;

create or replace function public.delete_my_personal_album_metadata(p_asset_id uuid)
returns public.participant_album_photos language plpgsql security definer set search_path=''
as $$ declare me uuid:=public.current_profile_id(); deleted public.participant_album_photos; begin if me is null then raise exception 'PROFILE_REQUIRED'; end if; delete from public.participant_album_photos where id=p_asset_id and profile_id=me returning * into deleted; if deleted.id is null then raise exception 'FORBIDDEN'; end if; return deleted; end $$;

create or replace function public.save_my_preferences(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare me uuid:=public.current_profile_id(); p public.profile_preferences; allowed text[]:=array['avatar_visible','level_visible','city_visible','play_times_visible','play_preference_visible','allow_event_invites','allow_doubles_invites','participant_album_visibility']; v text; begin if me is null then raise exception 'PROFILE_REQUIRED'; end if; if p_settings-allowed!='{}'::jsonb then raise exception 'INVALID_FIELDS'; end if; v:=p_settings->>'participant_album_visibility'; if v is not null and v not in ('private','partners') then raise exception 'INVALID_VISIBILITY'; end if; insert into public.profile_preferences(profile_id) values(me) on conflict(profile_id) do nothing; update public.profile_preferences set avatar_visible=coalesce((p_settings->>'avatar_visible')::boolean,avatar_visible),level_visible=coalesce((p_settings->>'level_visible')::boolean,level_visible),city_visible=coalesce((p_settings->>'city_visible')::boolean,city_visible),play_times_visible=coalesce((p_settings->>'play_times_visible')::boolean,play_times_visible),play_preference_visible=coalesce((p_settings->>'play_preference_visible')::boolean,play_preference_visible),allow_event_invites=coalesce((p_settings->>'allow_event_invites')::boolean,allow_event_invites),allow_doubles_invites=coalesce((p_settings->>'allow_doubles_invites')::boolean,allow_doubles_invites),participant_album_visibility=coalesce(v,participant_album_visibility),updated_at=now() where profile_id=me returning * into p; return to_jsonb(p); end $$;

revoke all on function public.is_actual_event_participant(uuid,uuid),public.list_event_photos(uuid),public.add_event_photo(uuid,text,text),public.delete_event_photo_metadata(uuid,integer),public.prepare_personal_album_import(uuid),public.finalize_personal_album_import(uuid,text,text),public.list_my_past_event_albums(),public.get_personal_album_asset(uuid,uuid),public.list_partner_visible_event_albums(uuid),public.delete_my_personal_album_metadata(uuid) from public,anon;
grant execute on function public.is_actual_event_participant(uuid,uuid),public.list_event_photos(uuid),public.add_event_photo(uuid,text,text),public.delete_event_photo_metadata(uuid,integer),public.prepare_personal_album_import(uuid),public.finalize_personal_album_import(uuid,text,text),public.list_my_past_event_albums(),public.get_personal_album_asset(uuid,uuid),public.list_partner_visible_event_albums(uuid),public.delete_my_personal_album_metadata(uuid) to authenticated;
