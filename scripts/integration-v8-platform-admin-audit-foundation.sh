#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('91111111-1111-4111-8111-111111111111','it-v8-admin-reviewer@example.invalid'),
  ('92222222-2222-4222-8222-222222222222','it-v8-admin-operator@example.invalid'),
  ('93333333-3333-4333-8333-333333333333','it-v8-admin-super@example.invalid'),
  ('94444444-4444-4444-8444-444444444444','it-v8-admin-outsider@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('91111111-1111-4111-8111-111111111111','reviewer'),
  ('92222222-2222-4222-8222-222222222222','operator'),
  ('93333333-3333-4333-8333-333333333333','super_admin');

do $test$
declare
  blocked boolean;
begin
  if has_schema_privilege('authenticated','platform_ops','USAGE')
    or has_schema_privilege('anon','platform_ops','USAGE')
    or has_table_privilege('authenticated','platform_ops.admin_action_audit','SELECT')
    or has_table_privilege('authenticated','platform_ops.admin_action_audit','INSERT')
    or has_table_privilege('authenticated','platform_ops.admin_members','SELECT')
    or has_table_privilege('service_role','platform_ops.admin_members','UPDATE')
    or has_table_privilege('service_role','platform_ops.admin_action_audit','UPDATE')
    or has_table_privilege('service_role','platform_ops.admin_action_audit','DELETE')
  then raise exception 'ADMIN_TABLE_PRIVILEGE_LEAK'; end if;
  if not has_table_privilege('service_role','platform_ops.admin_action_audit','INSERT') then
    raise exception 'TRUSTED_AUDIT_INSERT_MISSING'; end if;

  insert into platform_ops.admin_action_audit
    (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
  values ('95555555-5555-4555-8555-555555555551',
    '92222222-2222-4222-8222-222222222222',
    'REPORT_RESOLVE','report','report-1','Reviewed evidence and resolved report');

  blocked:=false;
  begin
    insert into platform_ops.admin_action_audit
      (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
    values ('95555555-5555-4555-8555-555555555552',
      '92222222-2222-4222-8222-222222222222',
      'SCORE_CORRECT','match','match-1','Correcting a confirmed score');
  exception when others then blocked:=(sqlerrm='PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'); end;
  if not blocked then raise exception 'OPERATOR_HIGH_RISK_ACCEPTED'; end if;

  blocked:=false;
  begin
    insert into platform_ops.admin_action_audit
      (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
    values ('95555555-5555-4555-8555-555555555553',
      '91111111-1111-4111-8111-111111111111',
      'FEEDBACK_RESOLVE','feedback','feedback-1','Reviewed and closed feedback');
  exception when others then blocked:=(sqlerrm='PLATFORM_ADMIN_FORBIDDEN'); end;
  if not blocked then raise exception 'REVIEWER_WRITE_ACCEPTED'; end if;

  blocked:=false;
  begin
    insert into platform_ops.admin_action_audit
      (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
    values ('95555555-5555-4555-8555-555555555554',
      '94444444-4444-4444-8444-444444444444',
      'FEEDBACK_RESOLVE','feedback','feedback-2','Reviewed and closed feedback');
  exception when others then blocked:=(sqlerrm='PLATFORM_ADMIN_FORBIDDEN'); end;
  if not blocked then raise exception 'OUTSIDER_WRITE_ACCEPTED'; end if;

  insert into platform_ops.admin_action_audit
    (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
  values ('95555555-5555-4555-8555-555555555555',
    '93333333-3333-4333-8333-333333333333',
    'SCORE_CORRECT','match','match-1','Correcting an adjudicated match result');

  blocked:=false;
  begin
    insert into platform_ops.admin_action_audit
      (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
    values ('95555555-5555-4555-8555-555555555555',
      '93333333-3333-4333-8333-333333333333',
      'SCORE_CORRECT','match','match-1','Correcting an adjudicated match result');
  exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'AUDIT_REQUEST_REPLAY_ACCEPTED'; end if;

  -- Revocation and role downgrade must take effect at the next audit insert;
  -- cached client role state must never authorize a stale administrator.
  update platform_ops.admin_members set active=false
  where auth_user_id='92222222-2222-4222-8222-222222222222';
  blocked:=false;
  begin
    insert into platform_ops.admin_action_audit
      (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
    values ('95555555-5555-4555-8555-555555555556',
      '92222222-2222-4222-8222-222222222222',
      'REPORT_RESOLVE','report','report-revoked','Revoked operator must not resolve reports');
  exception when others then blocked:=(sqlerrm='PLATFORM_ADMIN_FORBIDDEN'); end;
  if not blocked then raise exception 'DEACTIVATED_OPERATOR_WRITE_ACCEPTED'; end if;

  update platform_ops.admin_members set active=true, role='reviewer'
  where auth_user_id='92222222-2222-4222-8222-222222222222';
  blocked:=false;
  begin
    insert into platform_ops.admin_action_audit
      (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
    values ('95555555-5555-4555-8555-555555555557',
      '92222222-2222-4222-8222-222222222222',
      'FEEDBACK_RESOLVE','feedback','feedback-downgraded','Reviewer cannot resolve feedback after downgrade');
  exception when others then blocked:=(sqlerrm='PLATFORM_ADMIN_FORBIDDEN'); end;
  if not blocked then raise exception 'DOWNGRADED_REVIEWER_WRITE_ACCEPTED'; end if;

  update platform_ops.admin_members set role='operator'
  where auth_user_id='93333333-3333-4333-8333-333333333333';
  blocked:=false;
  begin
    insert into platform_ops.admin_action_audit
      (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
    values ('95555555-5555-4555-8555-555555555558',
      '93333333-3333-4333-8333-333333333333',
      'SCORE_CORRECT','match','match-downgraded','Downgraded admin cannot correct match results');
  exception when others then blocked:=(sqlerrm='PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'); end;
  if not blocked then raise exception 'DOWNGRADED_OPERATOR_HIGH_RISK_ACCEPTED'; end if;

  -- Restore fixture roles for later assertions in this transaction.
  update platform_ops.admin_members set role='operator'
  where auth_user_id='92222222-2222-4222-8222-222222222222';
  update platform_ops.admin_members set role='super_admin'
  where auth_user_id='93333333-3333-4333-8333-333333333333';

  blocked:=false;
  begin
    update platform_ops.admin_action_audit set reason='Attempted unauthorized audit rewrite'
    where request_id='95555555-5555-4555-8555-555555555555';
  exception when others then blocked:=(sqlerrm='ADMIN_AUDIT_IMMUTABLE'); end;
  if not blocked then raise exception 'AUDIT_UPDATE_ACCEPTED'; end if;

  blocked:=false;
  begin
    delete from platform_ops.admin_action_audit
    where request_id='95555555-5555-4555-8555-555555555555';
  exception when others then blocked:=(sqlerrm='ADMIN_AUDIT_IMMUTABLE'); end;
  if not blocked then raise exception 'AUDIT_DELETE_ACCEPTED'; end if;

  if (select count(*) from platform_ops.admin_action_audit)<>2
    or (select risk_level from platform_ops.admin_action_audit
        where request_id='95555555-5555-4555-8555-555555555555')<>'high'
  then raise exception 'AUDIT_INSERT_OR_RISK_CLASSIFICATION_BAD'; end if;
end;
$test$;
do $role_acl$
begin
  if has_function_privilege('anon', 'public.platform_admin_my_role()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.platform_admin_my_role()', 'EXECUTE')
  then raise exception 'ADMIN_ROLE_RPC_ACL_LEAK'; end if;
end;
$role_acl$;

-- Simulate PostgREST's authenticated JWT claim; no caller-supplied user id.
set local role authenticated;
do $role_self$
begin
  perform set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
  if public.platform_admin_my_role() is distinct from 'reviewer'
  then raise exception 'ADMIN_ROLE_REVIEWER_MISMATCH'; end if;

  perform set_config('request.jwt.claim.sub', '92222222-2222-4222-8222-222222222222', true);
  if public.platform_admin_my_role() is distinct from 'operator'
  then raise exception 'ADMIN_ROLE_OPERATOR_MISMATCH'; end if;

  perform set_config('request.jwt.claim.sub', '93333333-3333-4333-8333-333333333333', true);
  if public.platform_admin_my_role() is distinct from 'super_admin'
  then raise exception 'ADMIN_ROLE_SUPER_MISMATCH'; end if;

  perform set_config('request.jwt.claim.sub', '94444444-4444-4444-8444-444444444444', true);
  if public.platform_admin_my_role() is not null
  then raise exception 'ADMIN_ROLE_OUTSIDER_DISCLOSURE'; end if;
end;
$role_self$;
reset role;

-- A deactivated administrator must immediately lose self-role visibility.
update platform_ops.admin_members
set active = false
where auth_user_id = '92222222-2222-4222-8222-222222222222';
set local role authenticated;
do $role_inactive$
begin
  perform set_config('request.jwt.claim.sub', '92222222-2222-4222-8222-222222222222', true);
  if public.platform_admin_my_role() is not null
  then raise exception 'ADMIN_ROLE_INACTIVE_DISCLOSURE'; end if;
end;
$role_inactive$;
reset role;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin private allowlist and immutable audit contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin private allowlist and immutable audit contract"
