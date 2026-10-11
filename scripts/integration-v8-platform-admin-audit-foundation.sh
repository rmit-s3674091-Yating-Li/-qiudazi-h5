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
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin private allowlist and immutable audit contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin private allowlist and immutable audit contract"
