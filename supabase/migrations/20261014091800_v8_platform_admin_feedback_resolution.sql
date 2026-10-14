-- V8 P2: audited and idempotent resolution/dismissal of private user feedback.
-- Requires 20261014064000_v8_platform_admin_feedback_directory.sql.
-- The trusted Edge caller must validate JWT and derive p_actor_auth_user_id
-- from the verified session. Never accept actor identity from request JSON.
-- This function is service-role-only; browsers cannot execute it directly.
create table platform_ops.feedback_resolution_requests (
  request_id uuid primary key,
  feedback_id uuid not null references platform_ops.user_feedback(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('resolved', 'dismissed')),
  expected_version integer not null check (expected_version > 0),
  resulting_version integer not null check (resulting_version = expected_version + 1),
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  created_at timestamptz not null default now()
);
create index feedback_resolution_requests_feedback_idx
  on platform_ops.feedback_resolution_requests(feedback_id, created_at desc);
alter table platform_ops.feedback_resolution_requests enable row level security;
revoke all on platform_ops.feedback_resolution_requests
  from public, anon, authenticated, service_role;

create function public.platform_admin_resolve_feedback(
  p_actor_auth_user_id uuid,
  p_feedback_id uuid,
  p_expected_version integer,
  p_decision text,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_role text;
  v_status text;
  v_version integer;
  v_existing platform_ops.feedback_resolution_requests%rowtype;
  v_reason text;
begin
  if p_actor_auth_user_id is null or p_feedback_id is null or p_request_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_expected_version = 2147483647
     or p_decision is null or p_decision not in ('resolved', 'dismissed')
     or p_reason is null then
    raise exception 'INVALID_FEEDBACK_RESOLUTION_REQUEST';
  end if;
  v_reason := btrim(p_reason);
  if length(v_reason) not between 10 and 1000 then
    raise exception 'INVALID_FEEDBACK_RESOLUTION_REASON';
  end if;

  -- Serialize permission revocation/downgrade with this transaction.
  -- The immutable audit trigger rechecks the role independently.
  select m.role into v_role
    from platform_ops.admin_members m
    where m.auth_user_id = p_actor_auth_user_id and m.active is true
    for share;
  if v_role is null or v_role not in ('operator', 'super_admin') then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;

  -- Lock feedback BEFORE checking replay. Concurrent decisions for the same
  -- feedback item cannot both pass the expected-version check.
  select f.status, f.version into v_status, v_version
    from platform_ops.user_feedback f
    where f.id = p_feedback_id
    for update;
  if not found then
    raise exception 'FEEDBACK_NOT_FOUND';
  end if;

  select * into v_existing
    from platform_ops.feedback_resolution_requests q
    where q.request_id = p_request_id;
  if found then
    if v_existing.actor_auth_user_id <> p_actor_auth_user_id
       or v_existing.feedback_id <> p_feedback_id
       or v_existing.expected_version <> p_expected_version
       or v_existing.decision <> p_decision
       or v_existing.reason <> v_reason then
      raise exception 'FEEDBACK_RESOLUTION_REPLAY_MISMATCH';
    end if;
    if v_status <> v_existing.decision
       or v_version <> v_existing.resulting_version then
      raise exception 'FEEDBACK_RESOLUTION_REPLAY_STATE_CHANGED';
    end if;
    return jsonb_build_object('request_id', p_request_id,
      'feedback_id', p_feedback_id, 'status', v_existing.decision,
      'version', v_existing.resulting_version, 'replayed', true);
  end if;

  if v_status not in ('open', 'in_review') then
    raise exception 'FEEDBACK_ALREADY_FINAL';
  end if;
  if v_version <> p_expected_version then
    raise exception 'STALE_FEEDBACK_VERSION';
  end if;

  -- Business change, immutable audit and private replay binding are atomic.
  -- Any failure rolls back the entire PostgreSQL function invocation.
  update platform_ops.user_feedback
    set status = p_decision, version = v_version + 1, updated_at = now()
    where id = p_feedback_id;
  insert into platform_ops.admin_action_audit
    (request_id, actor_auth_user_id, action, target_kind, target_id, reason)
    values (p_request_id, p_actor_auth_user_id, 'FEEDBACK_RESOLVE',
            'feedback', p_feedback_id::text, v_reason);
  insert into platform_ops.feedback_resolution_requests
    (request_id, feedback_id, actor_auth_user_id, decision,
     expected_version, resulting_version, reason)
    values (p_request_id, p_feedback_id, p_actor_auth_user_id, p_decision,
            p_expected_version, v_version + 1, v_reason);

  return jsonb_build_object('request_id', p_request_id,
    'feedback_id', p_feedback_id, 'status', p_decision,
    'version', v_version + 1, 'replayed', false);
end;
$fn$;

revoke all on function public.platform_admin_resolve_feedback(
  uuid, uuid, integer, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.platform_admin_resolve_feedback(
  uuid, uuid, integer, text, text, uuid
) to service_role;
