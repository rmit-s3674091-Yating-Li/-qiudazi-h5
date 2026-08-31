create or replace function public.list_event_photos(p_event_id uuid)
returns table(id uuid, event_id uuid, original_url text, watermarked_url text, uploaded_at timestamptz, version integer, saved_to_my_album boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  me uuid := public.current_profile_id();
  e public.events;
begin
  select ev.* into e
  from public.events ev
  where ev.id = p_event_id;

  if e.id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if me is null or (
    e.owner_user_id is distinct from me
    and not public.is_actual_event_participant(p_event_id, me)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    ph.id,
    ph.event_id,
    ph.original_url,
    ph.watermarked_url,
    ph.uploaded_at,
    ph.version,
    exists(
      select 1
      from public.participant_album_photos pap
      where pap.profile_id = me
        and pap.source_event_photo_id = ph.id
    )
  from public.event_photos ph
  where ph.event_id = p_event_id
  order by ph.uploaded_at desc, ph.id;
end
$function$;
