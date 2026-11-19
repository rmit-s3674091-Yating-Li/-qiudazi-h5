#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('e1111111-1111-4111-8111-111111111111','it-v8-report-reviewer@example.invalid'),
  ('e2222222-2222-4222-8222-222222222222','it-v8-report-operator@example.invalid'),
  ('e3333333-3333-4333-8333-333333333333','it-v8-report-super@example.invalid'),
  ('e4444444-4444-4444-8444-444444444444','it-v8-report-outsider@example.invalid'),
  ('e5555555-5555-4555-8555-555555555555','it-v8-report-reporter@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('e1111111-1111-4111-8111-111111111111','reviewer'),
  ('e2222222-2222-4222-8222-222222222222','operator'),
  ('e3333333-3333-4333-8333-333333333333','super_admin');
insert into platform_ops.moderation_reports
  (id,reporter_auth_user_id,target_kind,target_id,category,summary,status,version,created_at) values
  ('e7777777-7777-4777-8777-777777777770','e5555555-5555-4555-8555-555555555555',
   'event','e8888888-8888-4888-8888-888888888880','safety','Private complaint A','open',1,'2098-01-01 00:00:00+00'),
  ('e7777777-7777-4777-8777-777777777771','e5555555-5555-4555-8555-555555555555',
   'photo','e8888888-8888-4888-8888-888888888881','privacy','Private complaint B','in_review',2,'2099-01-01 00:00:00+00'),
  ('e7777777-7777-4777-8777-777777777772','e5555555-5555-4555-8555-555555555555',
   'user','e8888888-8888-4888-8888-888888888882','conduct','Private complaint C','resolved',3,'2099-01-01 00:00:00+00'),
  ('e7777777-7777-4777-8777-777777777773','e5555555-5555-4555-8555-555555555555',
   'match','e8888888-8888-4888-8888-888888888883','spam','Private complaint D','dismissed',4,'2099-01-01 00:00:00+00');

do $test$
declare
  v_reviewer uuid := 'e1111111-1111-4111-8111-111111111111';
  v_operator uuid := 'e2222222-2222-4222-8222-222222222222';
  v_super uuid := 'e3333333-3333-4333-8333-333333333333';
  v_page jsonb;
  v_next jsonb;
  v_blocked boolean;
begin
  if has_function_privilege('anon',
       'public.platform_admin_list_reports(uuid,integer,timestamptz,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated',
       'public.platform_admin_list_reports(uuid,integer,timestamptz,uuid,text)','EXECUTE')
    or not has_function_privilege('service_role',
       'public.platform_admin_list_reports(uuid,integer,timestamptz,uuid,text)','EXECUTE')
  then raise exception 'REPORT_DIRECTORY_RPC_GRANT_LEAK'; end if;
  if has_table_privilege('authenticated','platform_ops.moderation_reports','SELECT')
    or has_table_privilege('anon','platform_ops.moderation_reports','INSERT')
    or has_table_privilege('service_role','platform_ops.moderation_reports','UPDATE')
    or has_table_privilege('service_role','platform_ops.moderation_reports','DELETE')
  then raise exception 'REPORT_TABLE_GRANT_LEAK'; end if;

  v_page := public.platform_admin_list_reports(v_reviewer, 2);
  if jsonb_array_length(v_page->'items') <> 2
    or v_page->'items'->0->>'id' <> 'e7777777-7777-4777-8777-777777777773'
    or v_page->'items'->1->>'id' <> 'e7777777-7777-4777-8777-777777777772'
    or (v_page->'items'->0 ? 'summary')
    or (v_page->'items'->0 ? 'reporter_auth_user_id')
    or (v_page->'items'->0 ? 'updated_at')
    or jsonb_typeof(v_page->'next_cursor') <> 'object'
  then raise exception 'REPORT_DIRECTORY_FIRST_PAGE_BAD'; end if;
  v_next := public.platform_admin_list_reports(
    v_reviewer, 2,
    (v_page->'next_cursor'->>'created_at')::timestamptz,
    (v_page->'next_cursor'->>'id')::uuid
  );
  if jsonb_array_length(v_next->'items') <> 2
    or v_next->'items'->0->>'id' <> 'e7777777-7777-4777-8777-777777777771'
    or v_next->'items'->1->>'id' <> 'e7777777-7777-4777-8777-777777777770'
    or jsonb_typeof(v_next->'next_cursor') <> 'null'
  then raise exception 'REPORT_DIRECTORY_CURSOR_BAD'; end if;

  v_page := public.platform_admin_list_reports(v_operator, 10, null, null, 'open');
  if jsonb_array_length(v_page->'items') <> 1
    or v_page->'items'->0->>'id' <> 'e7777777-7777-4777-8777-777777777770'
  then raise exception 'REPORT_DIRECTORY_STATUS_FILTER_BAD'; end if;
  v_page := public.platform_admin_list_reports(v_super, 10, null, null, 'resolved');
  if jsonb_array_length(v_page->'items') <> 1
    or v_page->'items'->0->>'version' <> '3'
  then raise exception 'REPORT_DIRECTORY_VERSION_BAD'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_list_reports('e4444444-4444-4444-8444-444444444444', 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'REPORT_DIRECTORY_OUTSIDER_ALLOWED'; end if;
  update platform_ops.admin_members set active = false where auth_user_id = v_reviewer;
  v_blocked := false;
  begin
    perform public.platform_admin_list_reports(v_reviewer, 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'REPORT_DIRECTORY_REVOKED_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_list_reports(v_super, 0);
  exception when others then v_blocked := sqlerrm = 'INVALID_REPORT_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'REPORT_DIRECTORY_ZERO_SIZE_ALLOWED'; end if;
  v_blocked := false;
  begin
    perform public.platform_admin_list_reports(v_super, 51);
  exception when others then v_blocked := sqlerrm = 'INVALID_REPORT_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'REPORT_DIRECTORY_OVERSIZE_ALLOWED'; end if;
  v_blocked := false;
  begin
    perform public.platform_admin_list_reports(v_super, 5, now(), null);
  exception when others then v_blocked := sqlerrm = 'INVALID_REPORT_CURSOR'; end;
  if not v_blocked then raise exception 'REPORT_DIRECTORY_PARTIAL_CURSOR_ALLOWED'; end if;
  v_blocked := false;
  begin
    perform public.platform_admin_list_reports(v_super, 5, null, null, 'all');
  exception when others then v_blocked := sqlerrm = 'INVALID_REPORT_STATUS_FILTER'; end;
  if not v_blocked then raise exception 'REPORT_DIRECTORY_BAD_STATUS_ALLOWED'; end if;

  if (select count(*) from platform_ops.moderation_reports
      where id::text like 'e7777777-7777-4777-8777-77777777777%') <> 4
  then raise exception 'REPORT_DIRECTORY_READ_CHANGED_REPORTS'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin report directory permission/pagination contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin report directory permission/pagination contract"
