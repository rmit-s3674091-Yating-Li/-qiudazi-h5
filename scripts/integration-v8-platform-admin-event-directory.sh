#!/usr/bin/env bash
set -euo pipefail

# These integration fixtures INSERT into auth.users and admin tables.
# Refuse non-local databases before starting the first SQL transaction.
case "${PGHOST:-127.0.0.1}" in
  127.0.0.1|localhost|::1) ;;
  *) echo "FAIL: V8 admin integration requires local Supabase (PGHOST)" >&2; exit 1 ;;
esac
if [[ "${PGPORT:-54322}" != "54322" ]]; then
  echo "FAIL: V8 admin integration requires local Supabase port 54322" >&2
  exit 1
fi

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('d1111111-1111-4111-8111-111111111111','it-v8-event-reviewer@example.invalid'),
  ('d2222222-2222-4222-8222-222222222222','it-v8-event-operator@example.invalid'),
  ('d3333333-3333-4333-8333-333333333333','it-v8-event-super@example.invalid'),
  ('d4444444-4444-4444-8444-444444444444','it-v8-event-outsider@example.invalid'),
  ('d5555555-5555-4555-8555-555555555555','it-v8-event-owner@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('d1111111-1111-4111-8111-111111111111','reviewer'),
  ('d2222222-2222-4222-8222-222222222222','operator'),
  ('d3333333-3333-4333-8333-333333333333','super_admin');
insert into public.profiles(id,auth_user_id,nickname,profile_status) values
  ('d6666666-6666-4666-8666-666666666666',
   'd5555555-5555-4555-8555-555555555555','V8 event directory owner','completed');
insert into public.events
  (id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,
   fee_type,status,version,created_at) values
  ('d7777777-7777-4777-8777-777777777770',
   'd6666666-6666-4666-8666-666666666666','V8 ongoing event','public',
   'singles','round_robin',1,'games_4','free','ongoing',2,'2098-01-01 00:00:00+00'),
  ('d7777777-7777-4777-8777-777777777771',
   'd6666666-6666-4666-8666-666666666666','V8 signup event','public',
   'singles','round_robin',1,'games_4','free','signup',1,'2099-01-01 00:00:00+00'),
  ('d7777777-7777-4777-8777-777777777772',
   'd6666666-6666-4666-8666-666666666666','V8 private event','private',
   'singles','round_robin',1,'games_4','free','signup',3,'2099-01-01 00:00:00+00'),
  ('d7777777-7777-4777-8777-777777777773',
   'd6666666-6666-4666-8666-666666666666','V8 cancelled event','private',
   'singles','round_robin',1,'games_4','free','cancelled',4,'2099-01-01 00:00:00+00');

do $test$
declare
  v_reviewer uuid := 'd1111111-1111-4111-8111-111111111111';
  v_operator uuid := 'd2222222-2222-4222-8222-222222222222';
  v_super uuid := 'd3333333-3333-4333-8333-333333333333';
  v_page jsonb;
  v_next jsonb;
  v_blocked boolean;
begin
  if has_function_privilege('anon',
       'public.platform_admin_list_events(uuid,integer,timestamptz,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated',
       'public.platform_admin_list_events(uuid,integer,timestamptz,uuid,text)','EXECUTE')
    or not has_function_privilege('service_role',
       'public.platform_admin_list_events(uuid,integer,timestamptz,uuid,text)','EXECUTE')
  then raise exception 'EVENT_DIRECTORY_RPC_GRANT_LEAK'; end if;

  v_page := public.platform_admin_list_events(v_reviewer, 2);
  if jsonb_array_length(v_page->'items') <> 2
    or v_page->'items'->0->>'id' <> 'd7777777-7777-4777-8777-777777777773'
    or v_page->'items'->1->>'id' <> 'd7777777-7777-4777-8777-777777777772'
    or v_page->'items'->1->>'visibility' <> 'private'
    or (v_page->'items'->1 ? 'fee_type')
    or (v_page->'items'->1 ? 'venue')
    or jsonb_typeof(v_page->'next_cursor') <> 'object'
  then raise exception 'EVENT_DIRECTORY_FIRST_PAGE_BAD'; end if;

  v_next := public.platform_admin_list_events(
    v_reviewer, 2,
    (v_page->'next_cursor'->>'created_at')::timestamptz,
    (v_page->'next_cursor'->>'id')::uuid
  );
  if jsonb_array_length(v_next->'items') <> 2
    or v_next->'items'->0->>'id' <> 'd7777777-7777-4777-8777-777777777771'
    or v_next->'items'->1->>'id' <> 'd7777777-7777-4777-8777-777777777770'
    or jsonb_typeof(v_next->'next_cursor') <> 'null'
  then raise exception 'EVENT_DIRECTORY_CURSOR_BAD'; end if;

  v_page := public.platform_admin_list_events(v_operator, 10, null, null, 'signup');
  if jsonb_array_length(v_page->'items') <> 2
    or v_page->'items'->0->>'id' <> 'd7777777-7777-4777-8777-777777777772'
    or v_page->'items'->1->>'id' <> 'd7777777-7777-4777-8777-777777777771'
  then raise exception 'EVENT_DIRECTORY_STATUS_FILTER_BAD'; end if;
  v_page := public.platform_admin_list_events(v_super, 10, null, null, 'cancelled');
  if jsonb_array_length(v_page->'items') <> 1
    or v_page->'items'->0->>'id' <> 'd7777777-7777-4777-8777-777777777773'
  then raise exception 'EVENT_DIRECTORY_SUPER_FILTER_BAD'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_list_events(
      'd4444444-4444-4444-8444-444444444444', 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'EVENT_DIRECTORY_OUTSIDER_ALLOWED'; end if;

  update platform_ops.admin_members set active = false where auth_user_id = v_reviewer;
  v_blocked := false;
  begin
    perform public.platform_admin_list_events(v_reviewer, 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'EVENT_DIRECTORY_REVOKED_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_list_events(v_super, 0);
  exception when others then v_blocked := sqlerrm = 'INVALID_EVENT_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'EVENT_DIRECTORY_ZERO_SIZE_ALLOWED'; end if;
  v_blocked := false;
  begin
    perform public.platform_admin_list_events(v_super, 51);
  exception when others then v_blocked := sqlerrm = 'INVALID_EVENT_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'EVENT_DIRECTORY_OVERSIZE_ALLOWED'; end if;
  v_blocked := false;
  begin
    perform public.platform_admin_list_events(v_super, 5, now(), null);
  exception when others then v_blocked := sqlerrm = 'INVALID_EVENT_CURSOR'; end;
  if not v_blocked then raise exception 'EVENT_DIRECTORY_PARTIAL_CURSOR_ALLOWED'; end if;
  v_blocked := false;
  begin
    perform public.platform_admin_list_events(v_super, 5, null, null, 'all');
  exception when others then v_blocked := sqlerrm = 'INVALID_EVENT_STATUS_FILTER'; end;
  if not v_blocked then raise exception 'EVENT_DIRECTORY_BAD_STATUS_ALLOWED'; end if;

  if (select count(*) from public.events
      where id::text like 'd7777777-7777-4777-8777-77777777777%') <> 4
  then raise exception 'EVENT_DIRECTORY_READ_CHANGED_EVENTS'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin event directory permission/pagination contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin event directory permission/pagination contract"

# Event-derived venue candidates must be covered by the default integration gate.
bash scripts/integration-v8-platform-admin-event-venue-candidates.sh
