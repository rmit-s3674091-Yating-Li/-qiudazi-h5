-- V8 P1: both match entries must remain confirmed for a NEW participant point.
-- A confirmed scorer alone is not sufficient if the opponent's entry was withdrawn.
-- Do not invalidate a previously committed operation replay merely because the
-- opponent later withdrew; replay retains the original actor/membership binding.

create or replace function public.v8_active_match_participant(
  p_event_id uuid,
  p_match_id uuid,
  p_actor_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.events e
    join public.matches m on m.event_id = e.id and m.id = p_match_id
    join public.entries entry_a on entry_a.id = m.entry_a_id
      and entry_a.event_id = e.id and entry_a.status = 'confirmed'
    join public.entries entry_b on entry_b.id = m.entry_b_id
      and entry_b.event_id = e.id and entry_b.status = 'confirmed'
    join public.entries en on en.event_id = e.id
      and en.id in (m.entry_a_id, m.entry_b_id)
    join public.entry_players ep on ep.entry_id = en.id
      and ep.event_id = e.id and ep.active is true
    join public.players p on p.id = ep.player_id
    join public.resolve_profile_for_auth_user(p_actor_auth_user_id) actor
      on actor.id = p.linked_user_id
    where e.id = p_event_id
      and e.status = 'ongoing'
      and m.status <> 'finished'
      and m.is_bye is false
      and en.status = 'confirmed'
      and actor.profile_status = 'completed'
  );
$fn$;
revoke all on function public.v8_active_match_participant(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.v8_active_match_participant(uuid,uuid,uuid)
  to service_role;

-- Keep the existing operation-id advisory lock, event lock, actor binding,
-- idempotent replay and unbound atomic commit unchanged. Only the fresh-point
-- path adds a locked check of BOTH entry statuses before the scoring write.
create or replace function public.v8_commit_participant_round_robin_point(
  p_event_id uuid,
  p_match_id uuid,
  p_actor_auth_user_id uuid,
  p_expected_event_version integer,
  p_expected_match_version integer,
  p_operation_id uuid,
  p_side text,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_binding scoring_ops.participant_point_actor_binding;
  v_has_point boolean;
  v_result jsonb;
begin
  if p_operation_id is null or p_actor_auth_user_id is null
    or p_event_id is null or p_match_id is null
    or p_side not in ('A','B') then
    raise exception 'INVALID_POINT_COMMAND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  select * into v_binding
  from scoring_ops.participant_point_actor_binding
  where operation_id=p_operation_id;
  select exists(select 1 from public.point_logs where id=p_operation_id)
    into v_has_point;

  if v_binding.operation_id is not null then
    if v_binding.event_id is distinct from p_event_id
      or v_binding.match_id is distinct from p_match_id
      or v_binding.actor_auth_user_id is distinct from p_actor_auth_user_id
      or v_binding.side is distinct from p_side
      or not v_has_point then
      raise exception 'OPERATION_CONFLICT';
    end if;
    -- A committed point is an idempotent replay, not a fresh score. The
    -- unbound RPC still verifies the scorer's CURRENT active membership.
    return public.v8_commit_participant_round_robin_point_unbound(
      p_event_id,p_match_id,p_actor_auth_user_id,
      p_expected_event_version,p_expected_match_version,
      p_operation_id,p_side,p_snapshot
    );
  end if;

  if v_has_point then raise exception 'OPERATION_CONFLICT'; end if;

  -- The event lock serializes organizer event/match commits; shared entry
  -- locks prevent an opponent's status from changing before the point commits.
  perform 1
  from public.matches m
  join public.entries entry_a on entry_a.id=m.entry_a_id
    and entry_a.event_id=p_event_id and entry_a.status='confirmed'
  join public.entries entry_b on entry_b.id=m.entry_b_id
    and entry_b.event_id=p_event_id and entry_b.status='confirmed'
  where m.id=p_match_id and m.event_id=p_event_id
  for share of entry_a, entry_b;
  if not found then raise exception 'PARTICIPANT_POINT_NOT_ALLOWED'; end if;

  v_result := public.v8_commit_participant_round_robin_point_unbound(
    p_event_id,p_match_id,p_actor_auth_user_id,
    p_expected_event_version,p_expected_match_version,
    p_operation_id,p_side,p_snapshot
  );

  insert into scoring_ops.participant_point_actor_binding
    (operation_id,event_id,match_id,actor_auth_user_id,side)
  values (p_operation_id,p_event_id,p_match_id,p_actor_auth_user_id,p_side);
  return v_result;
end;
$fn$;

revoke all on function public.v8_commit_participant_round_robin_point(
  uuid,uuid,uuid,integer,integer,uuid,text,jsonb
) from public, anon, authenticated;
grant execute on function public.v8_commit_participant_round_robin_point(
  uuid,uuid,uuid,integer,integer,uuid,text,jsonb
) to service_role;
