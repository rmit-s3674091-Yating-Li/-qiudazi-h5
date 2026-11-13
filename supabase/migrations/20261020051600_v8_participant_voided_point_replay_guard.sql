-- V8 P1: a voided point remains historical and must never be accepted as an
-- idempotent active score. Preserve the original operation ID and actor binding.
-- This replaces only the service-role wrapper introduced by the actor-binding
-- migration; the underlying atomic scoring transition remains unchanged.
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
  v_has_active_point boolean;
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
  -- Serialize with organizer scoring/undo and keep actor replay checks atomic.
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  select * into v_binding
  from scoring_ops.participant_point_actor_binding
  where operation_id=p_operation_id;
  select exists(select 1 from public.point_logs where id=p_operation_id),
         exists(select 1 from public.point_logs
                where id=p_operation_id and voided_at is null)
    into v_has_point, v_has_active_point;

  if v_binding.operation_id is not null then
    if v_binding.event_id is distinct from p_event_id
      or v_binding.match_id is distinct from p_match_id
      or v_binding.actor_auth_user_id is distinct from p_actor_auth_user_id
      or v_binding.side is distinct from p_side
      or not v_has_point
      or not v_has_active_point then
      -- Reuse of an undone operation is a conflict, never a new point.
      raise exception 'OPERATION_CONFLICT';
    end if;
    -- A still-active replay remains authorized by the unbound RPC's current
    -- membership checks; do not require the match to remain ongoing.
    return public.v8_commit_participant_round_robin_point_unbound(
      p_event_id,p_match_id,p_actor_auth_user_id,
      p_expected_event_version,p_expected_match_version,
      p_operation_id,p_side,p_snapshot
    );
  end if;

  -- Existing but unbound historical operations must not be adopted by a
  -- different actor or recycled after an organizer undo.
  if v_has_point then raise exception 'OPERATION_CONFLICT'; end if;

  -- Preserve both-entry confirmation under the event lock for fresh points.
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
