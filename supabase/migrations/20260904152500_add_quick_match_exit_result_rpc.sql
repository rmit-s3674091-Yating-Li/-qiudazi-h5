alter table public.matches
  add column if not exists completion_reason text;

alter table public.matches
  drop constraint if exists matches_completion_reason_check;
alter table public.matches
  add constraint matches_completion_reason_check
  check (completion_reason is null or completion_reason in ('retirement','walkover'));

create or replace function public.resolve_quick_match_exit(
  p_event_id uuid,
  p_match_id uuid,
  p_actor_auth_user_id uuid,
  p_expected_match_version integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  e public.events;
  m public.matches;
  actor uuid;
  actor_entry uuid;
  winner_entry uuid;
  reason text;
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
  if e.status <> 'ongoing' then raise exception 'MATCH_EXIT_CLOSED'; end if;

  select * into m
  from public.matches
  where id=p_match_id and event_id=e.id
  for update;
  if m.id is null then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.version is distinct from p_expected_match_version then raise exception 'VERSION_CONFLICT'; end if;
  if m.status='finished' then raise exception 'MATCH_ALREADY_FINISHED'; end if;
  if m.entry_a_id is null or m.entry_b_id is null or m.is_bye then raise exception 'MATCH_EXIT_INVALID'; end if;

  select en.id into actor_entry
  from public.entries en
  join public.entry_players ep on ep.entry_id=en.id and ep.event_id=e.id and ep.active
  join public.players p on p.id=ep.player_id
  where en.event_id=e.id
    and en.status='confirmed'
    and p.linked_user_id=actor
    and en.id in (m.entry_a_id,m.entry_b_id)
  order by en.joined_at,en.id
  limit 1;
  if actor_entry is null then raise exception 'NOT_MATCH_PARTICIPANT'; end if;

  winner_entry := case when actor_entry=m.entry_a_id then m.entry_b_id else m.entry_a_id end;
  reason := case when m.status='ongoing' then 'retirement' else 'walkover' end;

  update public.matches
  set status='finished',
      winner_entry_id=winner_entry,
      completion_reason=reason,
      version=version+1
  where id=m.id;

  -- Preserve any partial Point Log / Set Score for retirement. Walkover has no
  -- fabricated score: the authoritative result is winner + completion_reason.
  -- Knockout advancement is safe only while the downstream match has not begun.
  if m.next_match_id is not null then
    if exists(select 1 from public.matches n where n.id=m.next_match_id and n.event_id=e.id and n.status <> 'not_started') then
      raise exception 'DOWNSTREAM_MATCH_STARTED';
    end if;
    if m.next_slot='A' then
      update public.matches set entry_a_id=winner_entry,version=version+1 where id=m.next_match_id and event_id=e.id;
    elsif m.next_slot='B' then
      update public.matches set entry_b_id=winner_entry,version=version+1 where id=m.next_match_id and event_id=e.id;
    end if;
  end if;

  update public.events set version=version+1 where id=e.id;
  return public.get_event_snapshot(e.id);
end;
$function$;

revoke all on function public.resolve_quick_match_exit(uuid,uuid,uuid,integer) from public;
grant execute on function public.resolve_quick_match_exit(uuid,uuid,uuid,integer) to service_role;
