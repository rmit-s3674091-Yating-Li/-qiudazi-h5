create table if not exists public.event_photo_archive(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  original_url text not null,
  watermarked_url text not null,
  uploaded_at timestamptz not null,
  source_version integer not null,
  archived_at timestamptz not null default now(),
  archived_by_user_id uuid
);
alter table public.event_photo_archive enable row level security;
revoke all on table public.event_photo_archive from public,anon,authenticated;

drop function if exists public.list_my_past_event_albums();
drop function if exists public.list_partner_visible_event_albums(uuid);

create or replace function public.remove_event_photo_from_event(p_event_id uuid,p_version integer)
returns public.event_photos
language plpgsql security definer set search_path=''
as $$
declare e public.events; p public.event_photos; deleted public.event_photos;begin
 select * into e from public.events where id=p_event_id for update;
 if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then raise exception 'FORBIDDEN'; end if;
 select * into p from public.event_photos where event_id=p_event_id;
 if p.id is null then return null; end if;
 if p.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 insert into public.event_photo_archive(event_id,original_url,watermarked_url,uploaded_at,source_version,archived_by_user_id)
 values(p.event_id,p.original_url,p.watermarked_url,p.uploaded_at,p.version,public.current_profile_id());
 delete from public.event_photos where id=p.id and version=p_version returning * into deleted;
 if deleted.id is null then raise exception 'VERSION_CONFLICT'; end if;
 return deleted;
end $$;
revoke all on function public.remove_event_photo_from_event(uuid,integer) from public,anon;
grant execute on function public.remove_event_photo_from_event(uuid,integer) to authenticated,service_role;

create function public.list_my_past_event_albums()
returns table(asset_id uuid,event_id uuid,event_name text,event_date date,watermarked_url text,original_url text,uploaded_at timestamptz,is_current_event_photo boolean,visibility text)
language sql stable security definer set search_path=''
as $$
 with me as(select public.current_profile_id() id), participated as(
   select distinct en.event_id from me join public.players p on p.linked_user_id=me.id join public.entry_players ep on ep.player_id=p.id and ep.active join public.entries en on en.id=ep.entry_id where en.status<>'withdrawn'
 ), assets as(
   select ph.id asset_id,ph.event_id,ph.watermarked_url,ph.original_url,ph.uploaded_at,true is_current_event_photo from public.event_photos ph
   union all
   select a.id,a.event_id,a.watermarked_url,a.original_url,a.uploaded_at,false from public.event_photo_archive a
 )
 select a.asset_id,e.id,e.name,e.event_date,a.watermarked_url,a.original_url,a.uploaded_at,a.is_current_event_photo,coalesce(pref.visibility,'private')
 from participated x join public.events e on e.id=x.event_id join assets a on a.event_id=e.id
 left join me on true left join public.event_album_preferences pref on pref.profile_id=me.id and pref.event_id=e.id
 order by e.event_date desc nulls last,a.uploaded_at desc;
$$;
revoke all on function public.list_my_past_event_albums() from public,anon;
grant execute on function public.list_my_past_event_albums() to authenticated,service_role;

create function public.list_partner_visible_event_albums(p_profile_id uuid)
returns table(asset_id uuid,event_id uuid,event_name text,event_date date,watermarked_url text,uploaded_at timestamptz)
language sql stable security definer set search_path=''
as $$
 with me as(select public.current_profile_id() id), allowed as(
   select me.id viewer_id from me where me.id is not null and exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me.id and c.addressee_user_id=p_profile_id) or (c.addressee_user_id=me.id and c.requester_user_id=p_profile_id)))
 ), participated as(
   select distinct en.event_id from public.players p join public.entry_players ep on ep.player_id=p.id and ep.active join public.entries en on en.id=ep.entry_id where p.linked_user_id=p_profile_id and en.status<>'withdrawn'
 ), assets as(
   select ph.id asset_id,ph.event_id,ph.watermarked_url,ph.uploaded_at from public.event_photos ph
   union all
   select a.id,a.event_id,a.watermarked_url,a.uploaded_at from public.event_photo_archive a
 )
 select a.asset_id,e.id,e.name,e.event_date,a.watermarked_url,a.uploaded_at
 from allowed ok cross join participated x join public.events e on e.id=x.event_id join assets a on a.event_id=e.id join public.event_album_preferences pref on pref.profile_id=p_profile_id and pref.event_id=e.id and pref.visibility='partners'
 order by e.event_date desc nulls last,a.uploaded_at desc;
$$;
revoke all on function public.list_partner_visible_event_albums(uuid) from public,anon;
grant execute on function public.list_partner_visible_event_albums(uuid) to authenticated,service_role;