#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('a1111111-1111-4111-8111-111111111111','it-v8-audit-reviewer@example.invalid'),
  ('a2222222-2222-4222-8222-222222222222','it-v8-audit-operator@example.invalid'),
  ('a3333333-3333-4333-8333-333333333333','it-v8-audit-super@example.invalid'),
  ('a4444444-4444-4444-8444-444444444444','it-v8-audit-outsider@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('a1111111-1111-4111-8111-111111111111','reviewer'),
  ('a2222222-2222-4222-8222-222222222222','operator'),
  ('a3333333-3333-4333-8333-333333333333','super_admin');
insert into platform_ops.admin_action_audit
  (id,request_id,actor_auth_user_id,action,target_kind,target_id,reason,created_at)
values
  ('a5555555-5555-4555-8555-555555555551','a6666666-6666-4666-8666-666666666661',
   'a2222222-2222-4222-8222-222222222222','REPORT_RESOLVE','report','report-1',
   'Reviewed report evidence and closed it','2026-10-11 13:00:00+00'),
  ('a5555555-5555-4555-8555-555555555552','a6666666-6666-4666-8666-666666666662',
   'a2222222-2222-4222-8222-222222222222','FEEDBACK_RESOLVE','feedback','feedback-2',
   'Reviewed feedback evidence and closed it','2026-10-11 13:00:00+00'),
  ('a5555555-5555-4555-8555-555555555553','a6666666-6666-4666-8666-666666666663',
   'a3333333-3333-4333-8333-333333333333','SCORE_CORRECT','match','match-3',
   'Corrected score following adjudication','2026-10-11 12:00:00+00');

do $test$
declare
  v_page jsonb;
  v_next jsonb;
  v_count integer;
  blocked boolean;
  v_actor uuid := 'a1111111-1111-4111-8111-111111111111';
begin
  if has_function_privilege('anon',
      'public.platform_admin_list_audit(uuid,integer,timestamptz,uuid)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.platform_admin_list_audit(uuid,integer,timestamptz,uuid)','EXECUTE')
    or not has_function_privilege('service_role',
      'public.platform_admin_list_audit(uuid,integer,timestamptz,uuid)','EXECUTE')
  then raise exception 'AUDIT_READ_RPC_GRANT_LEAK'; end if;

  v_page := public.platform_admin_list_audit(v_actor, 1);
  if jsonb_array_length(v_page->'items') <> 1
    or v_page->'items'->0->>'id' <> 'a5555555-5555-4555-8555-555555555552'
    or v_page->'next_cursor' is null
    or jsonb_typeof(v_page->'next_cursor') <> 'object'
    or (v_page->'items'->0 ? 'request_id')
  then raise exception 'AUDIT_FIRST_PAGE_BAD'; end if;

  v_next := public.platform_admin_list_audit(
    v_actor, 1,
    (v_page->'next_cursor'->>'created_at')::timestamptz,
    (v_page->'next_cursor'->>'id')::uuid
  );
  if v_next->'items'->0->>'id' <> 'a5555555-5555-4555-8555-555555555551'
  then raise exception 'AUDIT_TIEBREAK_PAGINATION_BAD'; end if;

  v_page := public.platform_admin_list_audit(v_actor, 50);
  if jsonb_array_length(v_page->'items') <> 3
    or jsonb_typeof(v_page->'next_cursor') <> 'null'
  then raise exception 'AUDIT_LAST_PAGE_BAD'; end if;
  v_page := public.platform_admin_list_audit('a2222222-2222-4222-8222-222222222222', 5);
  if jsonb_array_length(v_page->'items') <> 3 then raise exception 'AUDIT_OPERATOR_READ_BAD'; end if;
  v_page := public.platform_admin_list_audit('a3333333-3333-4333-8333-333333333333', 5);
  if jsonb_array_length(v_page->'items') <> 3 then raise exception 'AUDIT_SUPER_READ_BAD'; end if;

  blocked := false;
  begin
    perform public.platform_admin_list_audit('a4444444-4444-4444-8444-444444444444', 10);
  exception when others then blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not blocked then raise exception 'AUDIT_OUTSIDER_READ_ACCEPTED'; end if;

  update platform_ops.admin_members set active=false where auth_user_id=v_actor;
  blocked := false;
  begin
    perform public.platform_admin_list_audit(v_actor, 10);
  exception when others then blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not blocked then raise exception 'AUDIT_DISABLED_REVIEWER_READ_ACCEPTED'; end if;

  blocked := false;
  begin
    perform public.platform_admin_list_audit('a3333333-3333-4333-8333-333333333333', 0);
  exception when others then blocked := sqlerrm = 'INVALID_AUDIT_PAGE_SIZE'; end;
  if not blocked then raise exception 'AUDIT_ZERO_PAGE_SIZE_ACCEPTED'; end if;
  blocked := false;
  begin
    perform public.platform_admin_list_audit('a3333333-3333-4333-8333-333333333333', 51);
  exception when others then blocked := sqlerrm = 'INVALID_AUDIT_PAGE_SIZE'; end;
  if not blocked then raise exception 'AUDIT_OVERSIZE_PAGE_ACCEPTED'; end if;
  blocked := false;
  begin
    perform public.platform_admin_list_audit(
      'a3333333-3333-4333-8333-333333333333', 10,
      '2026-10-11 13:00:00+00'::timestamptz, null);
  exception when others then blocked := sqlerrm = 'INVALID_AUDIT_CURSOR'; end;
  if not blocked then raise exception 'AUDIT_PARTIAL_CURSOR_ACCEPTED'; end if;

  select count(*) into v_count from platform_ops.admin_action_audit;
  if v_count <> 3 then raise exception 'AUDIT_READ_CHANGED_DATA'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin audit read permission/pagination contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin audit read permission/pagination contract"
