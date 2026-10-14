#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('f1111111-1111-4111-8111-111111111111','it-v8-report-resolution-reviewer@example.invalid'),
  ('f2222222-2222-4222-8222-222222222222','it-v8-report-resolution-operator@example.invalid'),
  ('f3333333-3333-4333-8333-333333333333','it-v8-report-resolution-super@example.invalid'),
  ('f4444444-4444-4444-8444-444444444444','it-v8-report-resolution-outsider@example.invalid'),
  ('f5555555-5555-4555-8555-555555555555','it-v8-report-resolution-reporter@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('f1111111-1111-4111-8111-111111111111','reviewer'),
  ('f2222222-2222-4222-8222-222222222222','operator'),
  ('f3333333-3333-4333-8333-333333333333','super_admin');
insert into platform_ops.moderation_reports
  (id,reporter_auth_user_id,target_kind,target_id,category,summary,status,version) values
  ('f6666666-6666-4666-8666-666666666661','f5555555-5555-4555-8555-555555555555',
   'event','f7777777-7777-4777-8777-777777777771','safety','Private complaint for review','open',1),
  ('f6666666-6666-4666-8666-666666666662','f5555555-5555-4555-8555-555555555555',
   'photo','f7777777-7777-4777-8777-777777777772','privacy','Private complaint for dismissal','in_review',4);

do $test$
declare
  v_operator uuid := 'f2222222-2222-4222-8222-222222222222';
  v_super uuid := 'f3333333-3333-4333-8333-333333333333';
  v_reviewer uuid := 'f1111111-1111-4111-8111-111111111111';
  v_outsider uuid := 'f4444444-4444-4444-8444-444444444444';
  v_report uuid := 'f6666666-6666-4666-8666-666666666661';
  v_other uuid := 'f6666666-6666-4666-8666-666666666662';
  v_request uuid := 'f8888888-8888-4888-8888-888888888881';
  v_result jsonb;
  v_blocked boolean;
begin
  if has_function_privilege('anon',
       'public.platform_admin_resolve_report(uuid,uuid,integer,text,text,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.platform_admin_resolve_report(uuid,uuid,integer,text,text,uuid)','EXECUTE')
     or not has_function_privilege('service_role',
       'public.platform_admin_resolve_report(uuid,uuid,integer,text,text,uuid)','EXECUTE')
     or has_table_privilege('service_role','platform_ops.moderation_reports','UPDATE')
     or has_table_privilege('authenticated','platform_ops.report_resolution_requests','SELECT')
     or has_table_privilege('service_role','platform_ops.report_resolution_requests','INSERT')
  then raise exception 'REPORT_RESOLUTION_GRANT_LEAK'; end if;

  v_result := public.platform_admin_resolve_report(v_operator,v_report,1,'resolved',
    'Reviewed the evidence and resolved the report',v_request);
  if v_result->>'status' <> 'resolved' or (v_result->>'version')::int <> 2
     or v_result->>'replayed' <> 'false'
     or (select status from platform_ops.moderation_reports where id=v_report) <> 'resolved'
     or (select version from platform_ops.moderation_reports where id=v_report) <> 2
     or (select count(*) from platform_ops.admin_action_audit where request_id=v_request) <> 1
     or (select count(*) from platform_ops.report_resolution_requests where request_id=v_request) <> 1
  then raise exception 'REPORT_RESOLUTION_ATOMIC_WRITE_BAD'; end if;

  v_result := public.platform_admin_resolve_report(v_operator,v_report,1,'resolved',
    'Reviewed the evidence and resolved the report',v_request);
  if v_result->>'replayed' <> 'true'
     or (select count(*) from platform_ops.admin_action_audit where request_id=v_request) <> 1
  then raise exception 'REPORT_RESOLUTION_IDEMPOTENCY_BAD'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_operator,v_report,1,'dismissed',
      'Reviewed the evidence and resolved the report',v_request);
  exception when others then v_blocked := sqlerrm='REPORT_RESOLUTION_REPLAY_MISMATCH'; end;
  if not v_blocked then raise exception 'REPORT_RESOLUTION_REPLAY_CHANGED_DECISION_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_operator,v_report,1,'resolved',
      'Different reason must not replay the original request',v_request);
  exception when others then v_blocked := sqlerrm='REPORT_RESOLUTION_REPLAY_MISMATCH'; end;
  if not v_blocked then raise exception 'REPORT_RESOLUTION_REPLAY_CHANGED_REASON_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_operator,v_report,1,'resolved',
      'Reviewed the evidence and resolved the report','f8888888-8888-4888-8888-888888888882');
  exception when others then v_blocked := sqlerrm='REPORT_ALREADY_FINAL'; end;
  if not v_blocked then raise exception 'REPORT_RESOLUTION_FINAL_STATE_MUTATED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_reviewer,v_other,4,'dismissed',
      'Reviewer cannot dismiss a reported item','f8888888-8888-4888-8888-888888888883');
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'REPORT_RESOLUTION_REVIEWER_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_outsider,v_other,4,'dismissed',
      'Outsider cannot dismiss a reported item','f8888888-8888-4888-8888-888888888884');
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'REPORT_RESOLUTION_OUTSIDER_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_super,v_other,3,'dismissed',
      'Expected version must match the current record','f8888888-8888-4888-8888-888888888885');
  exception when others then v_blocked := sqlerrm='STALE_REPORT_VERSION'; end;
  if not v_blocked then raise exception 'REPORT_RESOLUTION_STALE_VERSION_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_super,v_other,4,'open',
      'Unsupported transition should be rejected','f8888888-8888-4888-8888-888888888886');
  exception when others then v_blocked := sqlerrm='INVALID_REPORT_RESOLUTION_REQUEST'; end;
  if not v_blocked then raise exception 'REPORT_RESOLUTION_INVALID_DECISION_ALLOWED'; end if;

  insert into platform_ops.admin_action_audit
    (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
  values ('f8888888-8888-4888-8888-888888888889',v_super,
    'REPORT_RESOLVE','report',v_report::text,
    'Existing audit request belongs to a different report');
  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_super,v_other,4,'dismissed',
      'Audit request collision must roll back business state',
      'f8888888-8888-4888-8888-888888888889');
  exception when unique_violation then v_blocked := true; end;
  if not v_blocked
     or (select status from platform_ops.moderation_reports where id=v_other) <> 'in_review'
     or (select version from platform_ops.moderation_reports where id=v_other) <> 4
     or exists (select 1 from platform_ops.report_resolution_requests
                where request_id='f8888888-8888-4888-8888-888888888889')
  then raise exception 'REPORT_RESOLUTION_PARTIAL_COMMIT_AFTER_AUDIT_FAILURE'; end if;

  update platform_ops.admin_members set active=false where auth_user_id=v_operator;
  v_blocked := false;
  begin
    perform public.platform_admin_resolve_report(v_operator,v_report,1,'resolved',
      'Reviewed the evidence and resolved the report',v_request);
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'REPORT_RESOLUTION_REVOKED_REPLAY_ALLOWED'; end if;

  v_result := public.platform_admin_resolve_report(v_super,v_other,4,'dismissed',
    'Confirmed the report does not warrant intervention','f8888888-8888-4888-8888-888888888887');
  if v_result->>'status' <> 'dismissed' or (v_result->>'version')::int <> 5
     or (select status from platform_ops.moderation_reports where id=v_other) <> 'dismissed'
     or (select count(*) from platform_ops.admin_action_audit where target_id=v_other::text) <> 1
  then raise exception 'REPORT_RESOLUTION_DISMISSAL_BAD'; end if;

  if (select count(*) from platform_ops.admin_action_audit
      where target_kind='report' and target_id in (v_report::text,v_other::text)) <> 3
  then raise exception 'REPORT_RESOLUTION_AUDIT_COUNT_BAD'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: V8 report resolution transaction contract (actual=$result)"
  exit 1
fi
echo "PASS: V8 report resolution transaction contract"
