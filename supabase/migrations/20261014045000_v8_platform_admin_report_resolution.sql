-- V8 P2: resolve/dismiss an existing report with an audited, versioned transaction.
-- Dependency: 20261014013900_v8_platform_admin_report_directory.sql.
-- Trusted Edge MUST verify JWT and supply only the verified auth.users.id.
-- This service-role-only function is not a browser-facing RPC.
create table platform_ops.report_resolution_requests (
  request_id uuid primary key,
  report_id uuid not null references platform_ops.moderation_reports(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('resolved', 'dismissed')),
  expected_version integer not null check (expected_version > 0),
  resulting_version integer not null check (resulting_version = expected_version + 1),
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  created_at timestamptz not null default now()
);
create index report_resolution_requests_report_idx
  on platform_ops.report_resolution_requests(report_id, created_at desc);
alter table platform_ops.report_resolution_requests enable row level security;
revoke all on platform_ops.report_resolution_requests from public, anon, authenticated, service_role;

create function public.platform_admin_resolve_report(
  p_actor_auth_user_id uuid,
  p_report_id uuid,
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
  v_existing platform_ops.report_resolution_requests%rowtype;
  v_reason text;
begin
  if p_actor_auth_user_id is null or p_report_id is null or p_request_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_expected_version = 2147483647
     or p_decision is null or p_decision not in ('resolved', 'dismissed')
     or p_reason is null then
    raise exception 'INVALID_REPORT_RESOLUTION_REQUEST';
  end if;
  v_reason := btrim(p_reason);
  if length(v_reason) not between 10 and 1000 then
    raise exception 'INVALID_REPORT_RESOLUTION_REASON';
  end if;

  -- FOR SHARE serializes concurrent membership revocation/downgrade with
  -- this transaction. The audit trigger independently checks the role again.
  select m.role into v_role
    from platform_ops.admin_members m
    where m.auth_user_id = p_actor_auth_user_id and m.active is true
    for share;
  if v_role not in ('operator', 'super_admin') or v_role is null then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;

  -- Lock the business record BEFORE reading replay state: competing requests
  -- for the same report are serialized and cannot both pass expected_version.
  select r.status, r.version into v_status, v_version
    from platform_ops.moderation_reports r
    where r.id = p_report_id
    for update;
  if not found then
    raise exception 'REPORT_NOT_FOUND';
  end if;

  select * into v_existing
    from platform_ops.report_resolution_requests q
    where q.request_id = p_request_id;
  if found then
    if v_existing.actor_auth_user_id <> p_actor_auth_user_id
       or v_existing.report_id <> p_report_id
       or v_existing.expected_version <> p_expected_version
       or v_existing.decision <> p_decision
       or v_existing.reason <> v_reason then
      raise exception 'REPORT_RESOLUTION_REPLAY_MISMATCH';
    end if;
    if v_status <> v_existing.decision or v_version <> v_existing.resulting_version then
      raise exception 'REPORT_RESOLUTION_REPLAY_STATE_CHANGED';
    end if;
    return jsonb_build_object('request_id', p_request_id, 'report_id', p_report_id,
      'status', v_existing.decision, 'version', v_existing.resulting_version,
      'replayed', true);
  end if;

  if v_status not in ('open', 'in_review') then
    raise exception 'REPORT_ALREADY_FINAL';
  end if;
  if v_version <> p_expected_version then
    raise exception 'STALE_REPORT_VERSION';
  end if;

  -- All three writes share this function call's PostgreSQL transaction.
  -- Any failure (including the immutable audit trigger) rolls back all three.
  update platform_ops.moderation_reports
    set status = p_decision, version = v_version + 1, updated_at = now()
    where id = p_report_id;
  insert into platform_ops.admin_action_audit
    (request_id, actor_auth_user_id, action, target_kind, target_id, reason)
    values (p_request_id, p_actor_auth_user_id, 'REPORT_RESOLVE',
            'report', p_report_id::text, v_reason);
  insert into platform_ops.report_resolution_requests
    (request_id, report_id, actor_auth_user_id, decision,
     expected_version, resulting_version, reason)
    values (p_request_id, p_report_id, p_actor_auth_user_id, p_decision,
            p_expected_version, v_version + 1, v_reason);

  return jsonb_build_object('request_id', p_request_id, 'report_id', p_report_id,
    'status', p_decision, 'version', v_version + 1, 'replayed', false);
end;
$fn$;

revoke all on function public.platform_admin_resolve_report(
  uuid, uuid, integer, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.platform_admin_resolve_report(
  uuid, uuid, integer, text, text, uuid
) to service_role;
