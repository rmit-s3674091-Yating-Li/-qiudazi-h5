-- AUD-20260829-017: event photos are private user content independent of event visibility.
update storage.buckets
set public=false
where id='event-photos';

create or replace function public.can_view_event_photo(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.events e
    where e.id=p_event_id
      and (
        e.owner_user_id=public.current_profile_id()
        or exists(
          select 1
          from public.entries en
          join public.entry_players ep on ep.entry_id=en.id and ep.active
          join public.players p on p.id=ep.player_id
          where en.event_id=e.id
            and en.status<>'withdrawn'
            and p.linked_user_id=public.current_profile_id()
        )
      )
  );
$$;
revoke all on function public.can_view_event_photo(uuid) from public, anon;
grant execute on function public.can_view_event_photo(uuid) to authenticated, service_role;

-- Owner-only direct upload; paths are scoped to auth uid/event id.
drop policy if exists qiudazi_photo_insert on storage.objects;
create policy qiudazi_photo_insert on storage.objects for insert to authenticated
with check (bucket_id='event-photos' and public.can_upload_photo(name));

-- Reading a private object is allowed only to organizer or an actual linked participant.
drop policy if exists qiudazi_photo_read_own on storage.objects;
drop policy if exists qiudazi_photo_read_event_member on storage.objects;
create policy qiudazi_photo_read_event_member on storage.objects for select to authenticated
using (
  bucket_id='event-photos'
  and array_length(storage.foldername(name),1)>=2
  and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
  and public.can_view_event_photo(((storage.foldername(name))[2])::uuid)
);

-- Direct client deletion is limited to the owner namespace and only for unreferenced
-- upload leftovers. Referenced photos are deleted by the photo-management Edge Function.
drop policy if exists qiudazi_photo_delete_own on storage.objects;
create policy qiudazi_photo_delete_own on storage.objects for delete to authenticated
using (
  bucket_id='event-photos'
  and public.can_upload_photo(name)
  and not exists (
    select 1 from public.event_photos ep
    where ep.original_url=storage.objects.name or ep.watermarked_url=storage.objects.name
  )
);

-- Snapshot must not disclose photo object paths to ordinary viewers or invite-only users.
create or replace function public.get_event_snapshot(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare e public.events; me uuid:=public.current_profile_id(); result jsonb; viewer_role text;
begin
  select * into e from public.events where id=p_event_id;
  if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  viewer_role := case
    when me is not null and e.owner_user_id=me then 'owner'
    when me is not null and exists(
      select 1 from public.entries en join public.entry_players ep on ep.entry_id=en.id and ep.active join public.players p on p.id=ep.player_id
      where en.event_id=e.id and en.status<>'withdrawn' and p.linked_user_id=me
    ) then 'participant'
    when me is not null and exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in('pending','accepted')) then 'invited'
    else 'viewer' end;
  if e.visibility<>'public' and viewer_role='viewer' then raise exception 'EVENT_NOT_FOUND'; end if;
  select jsonb_build_object(
    'viewer_role',viewer_role,'event',to_jsonb(e),
    'entries',coalesce((select jsonb_agg(to_jsonb(en)||jsonb_build_object('players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'avatar_url',p.avatar_url,'slot',ep.slot,'linked_user_id',p.linked_user_id,'player_type',p.player_type) order by ep.slot) from public.entry_players ep join public.players p on p.id=ep.player_id where ep.entry_id=en.id),'[]'::jsonb)) order by en.joined_at,en.id) from public.entries en where en.event_id=p_event_id),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.stage,m.group_no,m.round_no,m.bracket_position,m.id) from public.matches m where m.event_id=p_event_id),'[]'::jsonb),
    'set_scores',coalesce((select jsonb_agg(to_jsonb(s) order by s.set_no) from public.set_scores s join public.matches m on m.id=s.match_id where m.event_id=p_event_id),'[]'::jsonb),
    'point_logs',coalesce((select jsonb_agg(to_jsonb(l) order by l.point_no) from public.point_logs l join public.matches m on m.id=l.match_id where m.event_id=p_event_id),'[]'::jsonb),
    'photo',case when viewer_role in ('owner','participant') then (select to_jsonb(p) from public.event_photos p where p.event_id=p_event_id) else null end
  ) into result;
  return result;
end $$;

create or replace function public.list_my_event_photos()
returns table(event_id uuid,event_name text,watermarked_url text,uploaded_at timestamptz,version integer)
language sql stable security definer set search_path=''
as $$
  select e.id,e.name,p.watermarked_url,p.uploaded_at,p.version
  from public.events e join public.event_photos p on p.event_id=e.id
  where e.owner_user_id=public.current_profile_id()
  order by p.uploaded_at desc;
$$;
revoke all on function public.list_my_event_photos() from public, anon;
grant execute on function public.list_my_event_photos() to authenticated, service_role;
