drop function if exists public.list_partner_visible_event_albums(uuid);
create function public.list_partner_visible_event_albums(p_profile_id uuid)
returns table(asset_id uuid,event_id uuid,event_name text,event_date date,uploaded_at timestamptz)
language sql stable security definer set search_path=''
as $$
 with me as(select public.current_profile_id() id), allowed as(
   select me.id viewer_id from me where me.id is not null and exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me.id and c.addressee_user_id=p_profile_id) or (c.addressee_user_id=me.id and c.requester_user_id=p_profile_id)))
 ), participated as(
   select distinct en.event_id from public.players p join public.entry_players ep on ep.player_id=p.id and ep.active join public.entries en on en.id=ep.entry_id where p.linked_user_id=p_profile_id and en.status<>'withdrawn'
 ), assets as(
   select ph.id asset_id,ph.event_id,ph.uploaded_at from public.event_photos ph
   union all
   select a.id,a.event_id,a.uploaded_at from public.event_photo_archive a
 )
 select a.asset_id,e.id,e.name,e.event_date,a.uploaded_at
 from allowed ok cross join participated x join public.events e on e.id=x.event_id join assets a on a.event_id=e.id join public.event_album_preferences pref on pref.profile_id=p_profile_id and pref.event_id=e.id and pref.visibility='partners'
 order by e.event_date desc nulls last,a.uploaded_at desc;
$$;
revoke all on function public.list_partner_visible_event_albums(uuid) from public,anon;
grant execute on function public.list_partner_visible_event_albums(uuid) to authenticated,service_role;
