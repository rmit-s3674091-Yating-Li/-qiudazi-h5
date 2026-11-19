-- V8 Platform Admin foundation: private allowlist and immutable audit trail.
-- No admin is auto-provisioned; onboarding requires a separately authorized
-- operator/migration. These objects are NOT a merchant/organization backend.
create schema if not exists platform_ops;
revoke all on schema platform_ops from public, anon, authenticated;
grant usage on schema platform_ops to service_role;

create table platform_ops.admin_members (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null check (role in ('reviewer','operator','super_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- No before/after JSON snapshots: avoid replicating sensitive user content.
-- A request_id is supplied by the trusted server for retry deduplication.
create table platform_ops.admin_action_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in (
    'USER_RESTRICT','EVENT_CANCEL','SCORE_CORRECT','PHOTO_REMOVE',
    'VENUE_UPDATE','COMMERCIAL_ORGANIZATION_VERIFY',
    'REPORT_RESOLVE','FEEDBACK_RESOLVE','ADMIN_MEMBER_CHANGE'
  )),
  target_kind text not null check (target_kind in (
    'user','event','match','photo','venue','commercial_organization',
    'report','feedback','admin_member'
  )),
  target_id text not null check (length(btrim(target_id)) between 1 and 128),
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  risk_level text generated always as (
    case when action in ('REPORT_RESOLVE','FEEDBACK_RESOLVE') then 'low' else 'high' end
  ) stored,
  created_at timestamptz not null default now(),
  constraint admin_action_target_matches_action check (
    (action='USER_RESTRICT' and target_kind='user') or
    (action='EVENT_CANCEL' and target_kind='event') or
    (action='SCORE_CORRECT' and target_kind='match') or
    (action='PHOTO_REMOVE' and target_kind='photo') or
    (action='VENUE_UPDATE' and target_kind='venue') or
    (action='COMMERCIAL_ORGANIZATION_VERIFY' and target_kind='commercial_organization') or
    (action='REPORT_RESOLVE' and target_kind='report') or
    (action='FEEDBACK_RESOLVE' and target_kind='feedback') or
    (action='ADMIN_MEMBER_CHANGE' and target_kind='admin_member')
  )
);

create index admin_action_audit_actor_time_idx
  on platform_ops.admin_action_audit(actor_auth_user_id,created_at desc);
create index admin_action_audit_target_time_idx
  on platform_ops.admin_action_audit(target_kind,target_id,created_at desc);

create function platform_ops.enforce_admin_action_audit()
returns trigger
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_role text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'ADMIN_AUDIT_IMMUTABLE';
  end if;
  select m.role into v_role
  from platform_ops.admin_members m
  where m.auth_user_id=new.actor_auth_user_id and m.active;
  if v_role is null or v_role='reviewer' then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;
  if new.action not in ('REPORT_RESOLVE','FEEDBACK_RESOLVE')
    and v_role <> 'super_admin' then
    raise exception 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN';
  end if;
  return new;
end;
$fn$;

create trigger platform_admin_audit_append_only
before insert or update or delete on platform_ops.admin_action_audit
for each row execute function platform_ops.enforce_admin_action_audit();

alter table platform_ops.admin_members enable row level security;
alter table platform_ops.admin_action_audit enable row level security;
revoke all on platform_ops.admin_members from public, anon, authenticated, service_role;
revoke all on platform_ops.admin_action_audit from public, anon, authenticated, service_role;
grant select on platform_ops.admin_members to service_role;
grant select, insert on platform_ops.admin_action_audit to service_role;
revoke all on function platform_ops.enforce_admin_action_audit() from public, anon, authenticated;
