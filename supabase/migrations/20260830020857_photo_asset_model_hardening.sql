-- AUD-20260829-017 final photo model hardening.
-- Source event photos and participant-owned album assets have independent lifecycles.
-- Retire legacy single-photo / auto-history RPCs so stale clients cannot bypass the
-- active multi-photo + explicit-import model.
drop function if exists public.save_event_photo(uuid,text,text,integer);
drop function if exists public.remove_event_photo_from_event(uuid,integer);
drop function if exists public.set_my_event_album_visibility(uuid,text);
drop function if exists public.list_my_event_photos();

-- Source deletion is serialized on the same event row lock used by add_event_photo.
-- A stale delete must never report success: missing metadata before or after the
-- lock is treated as a retryable VERSION_CONFLICT.
create or replace function public.delete_event_photo_metadata(p_photo_id uuid,p_version integer)
returns public.event_photos
language plpgsql
security definer
set search_path=''
as $$
declare
  existing public.event_photos;
  e public.events;
  deleted public.event_photos;
begin
  select ph.* into existing
  from public.event_photos ph
  where ph.id=p_photo_id;

  if existing.id is null then
    raise exception 'VERSION_CONFLICT';
  end if;

  select * into e
  from public.events
  where id=existing.event_id
  for update;

  if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then
    raise exception 'FORBIDDEN';
  end if;

  select ph.* into existing
  from public.event_photos ph
  where ph.id=p_photo_id;

  if existing.id is null or existing.version is distinct from p_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  delete from public.event_photos
  where id=p_photo_id and version=p_version
  returning * into deleted;

  if deleted.id is null then
    raise exception 'VERSION_CONFLICT';
  end if;

  return deleted;
end
$$;

revoke all on function public.delete_event_photo_metadata(uuid,integer) from public,anon;
grant execute on function public.delete_event_photo_metadata(uuid,integer) to authenticated,service_role;
