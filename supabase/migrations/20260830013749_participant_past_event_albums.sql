alter table public.event_photos add column if not exists event_visible boolean not null default true;
alter table public.event_photos add column if not exists removed_from_event_at timestamptz;
alter table public.event_photos add column if not exists removed_by_user_id uuid;

create table if not exists public.event_album_preferences(
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('private','partners')),
  updated_at timestamptz not null default now(),
  primary key(profile_id,event_id)
);
alter table public.event_album_preferences enable row level security;
revoke all on table public.event_album_preferences from public, anon, authenticated;

create or replace function public.remove_event_photo_from_event(p_event_id uuid,p_version integer)
returns public.event_photos
language plpgsql security definer set search_path=''
as $$
declare e public.events; p public.event_photos;begin
 select * into e from public.events where id=p_event_id for update;
 if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then raise exception 'FORBIDDEN'; end if;
 select * into p from public.event_photos where event_id=p_event_id;
 if p.id is null then return null; end if;
 if p.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 update public.event_photos set event_visible=false,removed_from_event_at=now(),removed_by_user_id=public.current_profile_id() where id=p.id and version=p_version returning * into p;
 if p.id is null then raise exception 'VERSION_CONFLICT'; end if;
 return p;
end $$;
revoke all on function public.remove_event_photo_from_event(uuid,integer) from public,anon;
grant execute on function public.remove_event_photo_from_event(uuid,integer) to authenticated,service_role;

create or replace function public.set_my_event_album_visibility(p_event_id uuid,p_visibility text)
returns text
language plpgsql security definer set search_path=''
as $$
declare me uuid:=public.current_profile_id();begin
 if p_visibility not in ('private','partners') then raise exception 'INVALID_VISIBILITY'; end if;
 if me is null or not exists(
   select 1 from public.entries en join public.entry_players ep on ep.entry_id=en.id and ep.active join public.players p on p.id=ep.player_id
   where en.event_id=p_event_id and en.status<>'withdrawn' and p.linked_user_id=me
 ) then raise exception 'FORBIDDEN'; end if;
 insert into public.event_album_preferences(profile_id,event_id,visibility,updated_at) values(me,p_event_id,p_visibility,now())
 on conflict(profile_id,event_id) do update set visibility=excluded.visibility,updated_at=now();
 return p_visibility;
end $$;
revoke all on function public.set_my_event_album_visibility(uuid,text) from public,anon;
grant execute on function public.set_my_event_album_visibility(uuid,text) to authenticated,service_role;

create or replace function public.list_my_past_event_albums()
returns table(event_id uuid,event_name text,event_date date,watermarked_url text,original_url text,uploaded_at timestamptz,event_visible boolean,visibility text)
language sql stable security definer set search_path=''
as $$
 with me as(select public.current_profile_id() id), participated as(
   select distinct en.event_id from me join public.players p on p.linked_user_id=me.id join public.entry_players ep on ep.player_id=p.id and ep.active join public.entries en on en.id=ep.entry_id where en.status<>'withdrawn'
 )
 select e.id,e.name,e.event_date,ph.watermarked_url,ph.original_url,ph.uploaded_at,ph.event_visible,coalesce(pref.visibility,'private')
 from participated x join public.events e on e.id=x.event_id join public.event_photos ph on ph.event_id=e.id
 left join me on true left join public.event_album_preferences pref on pref.profile_id=me.id and pref.event_id=e.id
 order by e.event_date desc nulls last,ph.uploaded_at desc;
$$;
revoke all on function public.list_my_past_event_albums() from public,anon;
grant execute on function public.list_my_past_event_albums() to authenticated,service_role;

create or replace function public.list_partner_visible_event_albums(p_profile_id uuid)
returns table(event_id uuid,event_name text,event_date date,watermarked_url text,uploaded_at timestamptz)
language sql stable security definer set search_path=''
as $$
 with me as(select public.current_profile_id() id), allowed as(
   select me.id viewer_id from me where me.id is not null and exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me.id and c.addressee_user_id=p_profile_id) or (c.addressee_user_id=me.id and c.requester_user_id=p_profile_id)))
 ), participated as(
   select distinct en.event_id from public.players p join public.entry_players ep on ep.player_id=p.id and ep.active join public.entries en on en.id=ep.entry_id where p.linked_user_id=p_profile_id and en.status<>'withdrawn'
 )
 select e.id,e.name,e.event_date,ph.watermarked_url,ph.uploaded_at
 from allowed a cross join participated x join public.events e on e.id=x.event_id join public.event_photos ph on ph.event_id=e.id join public.event_album_preferences pref on pref.profile_id=p_profile_id and pref.event_id=e.id and pref.visibility='partners'
 order by e.event_date desc nulls last,ph.uploaded_at desc;
$$;
revoke all on function public.list_partner_visible_event_albums(uuid) from public,anon;
grant execute on function public.list_partner_visible_event_albums(uuid) to authenticated,service_role;

create or replace function public.save_event_photo(p_event_id uuid,p_original text,p_watermarked text,p_version integer default 0)
returns public.event_photos
language plpgsql security definer set search_path=''
as $$
declare e public.events; result public.event_photos;begin
 select * into e from public.events where id=p_event_id for update;
 if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then raise exception 'FORBIDDEN'; end if;
 if e.status!='finished' then raise exception 'EVENT_NOT_FINISHED'; end if;
 if not public.can_upload_photo(p_original) or not public.can_upload_photo(p_watermarked) or split_part(p_original,'/',2)!=p_event_id::text or split_part(p_watermarked,'/',2)!=p_event_id::text then raise exception 'INVALID_PHOTO'; end if;
 if not exists(select 1 from storage.objects where bucket_id='event-photos' and name=p_original) or not exists(select 1 from storage.objects where bucket_id='event-photos' and name=p_watermarked) then raise exception 'INVALID_PHOTO'; end if;
 select * into result from public.event_photos where event_id=p_event_id;
 if coalesce(result.version,0) is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 insert into public.event_photos(event_id,original_url,watermarked_url,event_visible,removed_from_event_at,removed_by_user_id) values(p_event_id,p_original,p_watermarked,true,null,null)
 on conflict(event_id) do update set original_url=excluded.original_url,watermarked_url=excluded.watermarked_url,uploaded_at=now(),version=event_photos.version+1,event_visible=true,removed_from_event_at=null,removed_by_user_id=null returning * into result;
 return result;
end $$;