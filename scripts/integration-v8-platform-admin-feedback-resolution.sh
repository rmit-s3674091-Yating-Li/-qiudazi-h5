#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('d1111111-1111-4111-8111-111111111111','it-v8-feedback-resolve-reviewer@example.invalid'),
  ('d2222222-2222-4222-8222-222222222222','it-v8-feedback-resolve-operator@example.invalid'),
  ('d3333333-3333-4333-8333-333333333333','it-v8-feedback-resolve-super@example.invalid'),
  ('d4444444-4444-4444-8444-444444444444','it-v8-feedback-resolve-outsider@example.invalid'),
  ('d5555555-5555-4555-8555-555555555555','it-v8-feedback-resolve-submitter@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('d1111111-1111-4111-8111-111111111111','reviewer'),
  ('d2222222-2222-4222-8222-222222222222','operator'),
  ('d3333333-3333-4333-8333-333333333333','super_admin');
insert into platform_ops.user_feedback
  (id,submitter_auth_user_id,category,message,status,version) values
  ('d6666666-6666-4666-8666-666666666661','d5555555-5555-4555-8555-555555555555',
   'bug','Private feedback narrative must never leave the database','open',1),
  ('d6666666-6666-4666-8666-666666666662','d5555555-5555-4555-8555-555555555555',
   'accessibility','Private accessibility feedback for moderation','in_review',4);

do $test$
declare
  v_operator uuid := 'd2222222-2222-4222-8222-222222222222';
  v_super uuid := 'd3333333-3333-4333-8333-333333333333';
  v_reviewer uuid := 'd1111111-1111-4111-8111-111111111111';
  v_outsider uuid := 'd4444444-4444-4444-8444-444444444444';
  v_feedback uuid := 'd6666666-6666-4666-8666-666666666661';
  v_other uuid := 'd6666666-6666-4666-8666-666666666662';
  v_request uuid := 'd8888888-8888-4888-8888-888888888881';
  v_result jsonb;
  v_blocked boolean;
begin
  if has_function_privilege('anon',
       'public.platform_admin_resolve_feedback(uuid,uuid,integer,text,text,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.platform_admin_resolve_feedback(uuid,uuid,integer,text,text,uuid)','EXECUTE')
     or not has_function_privilege('service_role',
       'public.platform_admin_resolve_feedback(uuid,uuid,integer,text,text,uuid)','EXECUTE')
     or has_table_privilege('service_role','platform_ops.user_feedback','UPDATE')
     or has_table_privilege('authenticated','platform_ops.feedback_resolution_requests','SELECT')
     or has_table_privilege('service_role','platform_ops.feedback_resolution_requests','INSERT')
  then raise exception 'FEEDBACK_RESOLUTION_GRANT_LEAK'; end if;

  v_result := public.platform_admin_resolve_feedback(v_operator,v_feedback,1,'resolved',
    'Reviewed the feedback and confirmed resolution',v_request);
  if v_result->>'status' <> 'resolved' or (v_result->>'version')::int <> 2
     or v_result->>'replayed' <> 'false'
     or (select status from platform_ops.user_feedback where id=v_feedback) <> 'resolved'
     or (select version from platform_ops.user_feedback where id=v_feedback) <> 2
     or (select count(*) from platform_ops.admin_action_audit where request_id=v_request) <> 1
     or (select count(*) from platform_ops.feedback_resolution_requests where request_id=v_request) <> 1
     or (select count(*) from jsonb_object_keys(v_result)) <> 5
     or v_result ?| array['submitter_auth_user_id','message','reason','email']
  then raise exception 'FEEDBACK_RESOLUTION_ATOMIC_WRITE_BAD'; end if;

  v_result := public.platform_admin_resolve_feedback(v_operator,v_feedback,1,'resolved',
    'Reviewed the feedback and confirmed resolution',v_request);
  if v_result->>'replayed' <> 'true'
     or (select count(*) from platform_ops.admin_action_audit where request_id=v_request) <> 1
  then raise exception 'FEEDBACK_RESOLUTION_IDEMPOTENCY_BAD'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_operator,v_feedback,1,'dismissed',
      'Reviewed the feedback and confirmed resolution',v_request);
  exception when others then v_blocked := sqlerrm='FEEDBACK_RESOLUTION_REPLAY_MISMATCH'; end;
  if not v_blocked then raise exception 'FEEDBACK_REPLAY_CHANGED_DECISION_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_operator,v_feedback,1,'resolved',
      'A changed reason cannot replay an earlier request',v_request);
  exception when others then v_blocked := sqlerrm='FEEDBACK_RESOLUTION_REPLAY_MISMATCH'; end;
  if not v_blocked then raise exception 'FEEDBACK_REPLAY_CHANGED_REASON_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_super,v_feedback,1,'resolved',
      'Another actor must not reuse an existing request',v_request);
  exception when others then v_blocked := sqlerrm='FEEDBACK_RESOLUTION_REPLAY_MISMATCH'; end;
  if not v_blocked then raise exception 'FEEDBACK_REPLAY_CROSS_ACTOR_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_operator,v_feedback,1,'resolved',
      'Reviewed the feedback and confirmed resolution','d8888888-8888-4888-8888-888888888882');
  exception when others then v_blocked := sqlerrm='FEEDBACK_ALREADY_FINAL'; end;
  if not v_blocked then raise exception 'FEEDBACK_FINAL_STATE_MUTATED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_reviewer,v_other,4,'dismissed',
      'Reviewer cannot dismiss feedback','d8888888-8888-4888-8888-888888888883');
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'FEEDBACK_REVIEWER_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_outsider,v_other,4,'dismissed',
      'Outsider cannot dismiss feedback','d8888888-8888-4888-8888-888888888884');
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'FEEDBACK_OUTSIDER_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_super,v_other,3,'dismissed',
      'Expected version must match current feedback','d8888888-8888-4888-8888-888888888885');
  exception when others then v_blocked := sqlerrm='STALE_FEEDBACK_VERSION'; end;
  if not v_blocked then raise exception 'FEEDBACK_STALE_VERSION_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_super,v_other,4,'open',
      'Unsupported decision must be rejected','d8888888-8888-4888-8888-888888888886');
  exception when others then v_blocked := sqlerrm='INVALID_FEEDBACK_RESOLUTION_REQUEST'; end;
  if not v_blocked then raise exception 'FEEDBACK_INVALID_DECISION_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_super,v_other,4,'dismissed',
      'short','d8888888-8888-4888-8888-888888888886');
  exception when others then v_blocked := sqlerrm='INVALID_FEEDBACK_RESOLUTION_REASON'; end;
  if not v_blocked then raise exception 'FEEDBACK_SHORT_REASON_ALLOWED'; end if;

  insert into platform_ops.admin_action_audit
    (request_id,actor_auth_user_id,action,target_kind,target_id,reason)
  values ('d8888888-8888-4888-8888-888888888889',v_super,
    'FEEDBACK_RESOLVE','feedback',v_feedback::text,
    'Existing audit request belongs to a different feedback item');
  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_super,v_other,4,'dismissed',
      'Audit collision must roll back the feedback status',
      'd8888888-8888-4888-8888-888888888889');
  exception when unique_violation then v_blocked := true; end;
  if not v_blocked
     or (select status from platform_ops.user_feedback where id=v_other) <> 'in_review'
     or (select version from platform_ops.user_feedback where id=v_other) <> 4
     or exists (select 1 from platform_ops.feedback_resolution_requests
                where request_id='d8888888-8888-4888-8888-888888888889')
  then raise exception 'FEEDBACK_PARTIAL_COMMIT_AFTER_AUDIT_FAILURE'; end if;

  update platform_ops.admin_members set active=false where auth_user_id=v_operator;
  v_blocked := false;
  begin
    perform public.platform_admin_resolve_feedback(v_operator,v_feedback,1,'resolved',
      'Reviewed the feedback and confirmed resolution',v_request);
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'FEEDBACK_REVOKED_REPLAY_ALLOWED'; end if;

  v_result := public.platform_admin_resolve_feedback(v_super,v_other,4,'dismissed',
    'Confirmed the feedback does not warrant intervention',
    'd8888888-8888-4888-8888-888888888887');
  if v_result->>'status' <> 'dismissed' or (v_result->>'version')::int <> 5
     or (select status from platform_ops.user_feedback where id=v_other) <> 'dismissed'
     or (select count(*) from platform_ops.admin_action_audit where target_id=v_other::text) <> 1
  then raise exception 'FEEDBACK_DISMISSAL_BAD'; end if;

  if (select count(*) from platform_ops.admin_action_audit
      where target_kind='feedback' and target_id in (v_feedback::text,v_other::text)) <> 3
  then raise exception 'FEEDBACK_AUDIT_COUNT_BAD'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: V8 feedback resolution transaction contract (actual=$result)"
  exit 1
fi
echo "PASS: V8 feedback resolution transaction contract"
