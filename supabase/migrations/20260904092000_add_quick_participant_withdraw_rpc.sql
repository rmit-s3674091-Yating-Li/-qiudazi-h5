create or replace function public.withdraw_quick_event(
  p_event_id uuid,
  p_actor_auth_user_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  e public.events;
  actor uuid;
  target_entry uuid;
  remaining_entries integer;
  next_version integer;
begin
  select r.id into actor
  from public.resolve_profile_for_auth_user(p_actor_auth_user_id) r
  where r.profile_status='completed'
  limit 1;

  if actor is null then raise exception 'FORBIDDEN'; end if;

  select * into e
  from public.events
  where id=p_event_id
  for update;

  if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if coalesce(e.event_mode,'standard') <> 'quick' then raise exception 'QUICK_ONLY'; end if;
  if e.status not in ('signup','locked') then raise exception 'WITHDRAW_CLOSED'; end if;
  if e.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if e.owner_user_id=actor then raise exception 'OWNER_MUST_CANCEL'; end if;
  if exists(select 1 from public.matches m where m.event_id=e.id and m.status <> 'pending') then
    raise exception 'WITHDRAW_CLOSED';
  end if;

  select en.id into target_entry
  from public.entries en
  join public.entry_players ep on ep.entry_id=en.id and ep.event_id=e.id and ep.active
  join public.players p on p.id=ep.player_id
  where en.event_id=e.id
    and en.status='confirmed'
    and p.linked_user_id=actor
  order by en.joined_at, en.id
  limit 1;

  if target_entry is null then raise exception 'NOT_PARTICIPANT'; end if;

  update public.entries
  set status='withdrawn'
  where id=target_entry and event_id=e.id;

  update public.entry_players
  set active=false
  where entry_id=target_entry and event_id=e.id;

  -- Any pre-start draw is no longer authoritative after a participant leaves.
  delete from public.matches where event_id=e.id;

  select count(*) into remaining_entries
  from public.entries en
  where en.event_id=e.id and en.status='confirmed';

  update public.events
  set status=case when remaining_entries < 2 then 'cancelled' else status end,
      cancelled_at=case when remaining_entries < 2 then now() else cancelled_at end,
      draw_generated=false,
      version=version+1
  where id=e.id
  returning version into next_version;

  return public.get_event_snapshot(e.id);
end;
$function$;

revoke all on function public.withdraw_quick_event(uuid,uuid,integer) from public;
grant execute on function public.withdraw_quick_event(uuid,uuid,integer) to service_role;
