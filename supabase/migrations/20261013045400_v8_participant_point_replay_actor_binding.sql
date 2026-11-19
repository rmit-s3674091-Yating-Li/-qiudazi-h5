-- V8 P1: bind each committed participant point operation to its authenticated actor.
-- Earlier transaction checked match/side but not the actor on idempotent replay.
-- This migration is deliberately additive: existing point snapshots stay unchanged.
create schema if not exists scoring_ops;
revoke all on schema scoring_ops from public, anon, authenticated, service_role;

create table scoring_ops.participant_point_actor_binding (
  operation_id uuid primary key,
  event_id uuid not null,
  match_id uuid not null,
  actor_auth_user_id uuid not null,
  side text not null check (side in ('A','B')),
  created_at timestamptz not null default now()
);
alter table scoring_ops.participant_point_actor_binding enable row level security;
revoke all on scoring_ops.participant_point_actor_binding
  from public, anon, authenticated, service_role;

alter function public.v8_commit_participant_round_robin_point(
  uuid,uuid,uuid,integer,integer,uuid,text,jsonb
) rename to v8_commit_participant_round_robin_point_unbound;
revoke all on function public.v8_commit_participant_round_robin_point_unbound(
  uuid,uuid,uuid,integer,integer,uuid,text,jsonb
) from public, anon, authenticated, service_role;

create function public.v8_commit_participant_round_robin_point(
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
    return public.v8_commit_participant_round_robin_point_unbound(
      p_event_id,p_match_id,p_actor_auth_user_id,
      p_expected_event_version,p_expected_match_version,
      p_operation_id,p_side,p_snapshot
    );
  end if;

  if v_has_point then raise exception 'OPERATION_CONFLICT'; end if;

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
