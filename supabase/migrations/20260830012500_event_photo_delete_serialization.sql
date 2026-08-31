-- AUD-20260829-017: serialize event-photo delete with save_event_photo via the same event row lock.
create or replace function public.delete_event_photo_metadata(
  p_event_id uuid,
  p_version integer
)
returns public.event_photos
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.events;
  existing public.event_photos;
  deleted public.event_photos;
begin
  select * into e
  from public.events
  where id=p_event_id
  for update;

  if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then
    raise exception 'FORBIDDEN';
  end if;

  select * into existing
  from public.event_photos
  where event_id=p_event_id;

  if existing.id is null then
    if coalesce(p_version,0)=0 then
      return null;
    end if;
    raise exception 'VERSION_CONFLICT';
  end if;

  if existing.version is distinct from p_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  delete from public.event_photos
  where id=existing.id and version=p_version
  returning * into deleted;

  if deleted.id is null then
    raise exception 'VERSION_CONFLICT';
  end if;

  return deleted;
end;
$$;

revoke all on function public.delete_event_photo_metadata(uuid,integer) from public, anon;
grant execute on function public.delete_event_photo_metadata(uuid,integer) to authenticated, service_role;
