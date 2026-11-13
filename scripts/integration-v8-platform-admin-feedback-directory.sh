#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('e1111111-1111-4111-8111-111111111111','it-v8-feedback-reviewer@example.invalid'),
  ('e2222222-2222-4222-8222-222222222222','it-v8-feedback-operator@example.invalid'),
  ('e3333333-3333-4333-8333-333333333333','it-v8-feedback-super@example.invalid'),
  ('e4444444-4444-4444-8444-444444444444','it-v8-feedback-outsider@example.invalid'),
  ('e5555555-5555-4555-8555-555555555555','it-v8-feedback-submitter@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('e1111111-1111-4111-8111-111111111111','reviewer'),
  ('e2222222-2222-4222-8222-222222222222','operator'),
  ('e3333333-3333-4333-8333-333333333333','super_admin');
insert into platform_ops.user_feedback
  (id,submitter_auth_user_id,category,message,status,created_at) values
  ('f7777777-7777-4777-8777-777777777770',
   'e5555555-5555-4555-8555-555555555555','bug',
   'Feedback text must never appear in directory response','open','2098-01-01 00:00:00+00'),
  ('f7777777-7777-4777-8777-777777777771',
   'e5555555-5555-4555-8555-555555555555','experience',
   'A second feedback entry with private message content','open','2099-01-01 00:00:00+00'),
  ('f7777777-7777-4777-8777-777777777772',
   'e5555555-5555-4555-8555-555555555555','accessibility',
   'Accessibility feedback should be visible only as metadata','resolved','2099-01-01 00:00:00+00'),
  ('f7777777-7777-4777-8777-777777777773',
   'e5555555-5555-4555-8555-555555555555','other',
   'Latest private feedback must not expose submitter','in_review','2099-02-01 00:00:00+00');

do $test$
declare
  v_reviewer uuid := 'e1111111-1111-4111-8111-111111111111';
  v_operator uuid := 'e2222222-2222-4222-8222-222222222222';
  v_super uuid := 'e3333333-3333-4333-8333-333333333333';
  v_page jsonb;
  v_next jsonb;
  v_row jsonb;
  v_blocked boolean;
begin
  if has_schema_privilege('anon','platform_ops','USAGE')
    or has_schema_privilege('authenticated','platform_ops','USAGE')
    or has_table_privilege('anon','platform_ops.user_feedback','SELECT')
    or has_table_privilege('authenticated','platform_ops.user_feedback','INSERT')
    or has_table_privilege('authenticated','platform_ops.user_feedback','SELECT')
    or has_table_privilege('service_role','platform_ops.user_feedback','UPDATE')
    or has_table_privilege('service_role','platform_ops.user_feedback','DELETE')
    or not has_table_privilege('service_role','platform_ops.user_feedback','SELECT')
    or not has_table_privilege('service_role','platform_ops.user_feedback','INSERT')
  then raise exception 'FEEDBACK_TABLE_GRANT_LEAK'; end if;
  if has_function_privilege('anon',
       'public.platform_admin_list_feedback(uuid,integer,timestamptz,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated',
       'public.platform_admin_list_feedback(uuid,integer,timestamptz,uuid,text)','EXECUTE')
    or not has_function_privilege('service_role',
       'public.platform_admin_list_feedback(uuid,integer,timestamptz,uuid,text)','EXECUTE')
  then raise exception 'FEEDBACK_RPC_GRANT_LEAK'; end if;

  v_page := public.platform_admin_list_feedback(v_reviewer, 2);
  if jsonb_array_length(v_page->'items') <> 2
    or v_page->'items'->0->>'id' <> 'f7777777-7777-4777-8777-777777777773'
    or v_page->'items'->1->>'id' <> 'f7777777-7777-4777-8777-777777777772'
    or jsonb_typeof(v_page->'next_cursor') <> 'object'
  then raise exception 'FEEDBACK_FIRST_PAGE_BAD'; end if;
  v_row := v_page->'items'->0;
  if (select count(*) from jsonb_object_keys(v_row)) <> 5
    or not (v_row ?& array['id','category','status','version','created_at'])
    or v_row ?| array['submitter_auth_user_id','message','email','phone','updated_at']
  then raise exception 'FEEDBACK_PRIVATE_FIELD_LEAK'; end if;

  v_next := public.platform_admin_list_feedback(v_operator, 2,
    (v_page->'next_cursor'->>'created_at')::timestamptz,
    (v_page->'next_cursor'->>'id')::uuid);
  if jsonb_array_length(v_next->'items') <> 2
    or v_next->'items'->0->>'id' <> 'f7777777-7777-4777-8777-777777777771'
    or v_next->'items'->1->>'id' <> 'f7777777-7777-4777-8777-777777777770'
    or jsonb_typeof(v_next->'next_cursor') <> 'null'
  then raise exception 'FEEDBACK_CURSOR_BAD'; end if;

  v_page := public.platform_admin_list_feedback(v_super, 10, null, null, 'resolved');
  if jsonb_array_length(v_page->'items') <> 1
    or v_page->'items'->0->>'id' <> 'f7777777-7777-4777-8777-777777777772'
  then raise exception 'FEEDBACK_FILTER_BAD'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_list_feedback('e4444444-4444-4444-8444-444444444444', 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'FEEDBACK_OUTSIDER_ALLOWED'; end if;

  update platform_ops.admin_members set active = false where auth_user_id = v_reviewer;
  v_blocked := false;
  begin perform public.platform_admin_list_feedback(v_reviewer, 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'FEEDBACK_REVOKED_ALLOWED'; end if;

  v_blocked := false;
  begin perform public.platform_admin_list_feedback(v_super, 0);
  exception when others then v_blocked := sqlerrm = 'INVALID_FEEDBACK_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'FEEDBACK_ZERO_PAGE_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_feedback(v_super, 51);
  exception when others then v_blocked := sqlerrm = 'INVALID_FEEDBACK_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'FEEDBACK_OVERSIZE_PAGE_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_feedback(v_super, 10, now(), null);
  exception when others then v_blocked := sqlerrm = 'INVALID_FEEDBACK_CURSOR'; end;
  if not v_blocked then raise exception 'FEEDBACK_PARTIAL_CURSOR_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_feedback(v_super, 10, null, null, 'all');
  exception when others then v_blocked := sqlerrm = 'INVALID_FEEDBACK_STATUS_FILTER'; end;
  if not v_blocked then raise exception 'FEEDBACK_BAD_FILTER_ALLOWED'; end if;

  if (select count(*) from platform_ops.user_feedback
      where id::text like 'f7777777-7777-4777-8777-77777777777%') <> 4
  then raise exception 'FEEDBACK_DIRECTORY_MUTATED_DATA'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin feedback directory privacy/permission/pagination contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin feedback directory privacy/permission/pagination contract"
