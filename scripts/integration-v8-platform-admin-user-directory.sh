#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('b1111111-1111-4111-8111-111111111111','it-v8-directory-reviewer@example.invalid'),
  ('b2222222-2222-4222-8222-222222222222','it-v8-directory-operator@example.invalid'),
  ('b3333333-3333-4333-8333-333333333333','it-v8-directory-super@example.invalid'),
  ('b4444444-4444-4444-8444-444444444444','it-v8-directory-outsider@example.invalid'),
  ('b5555555-5555-4555-8555-555555555551','it-v8-directory-user1@example.invalid'),
  ('b5555555-5555-4555-8555-555555555552','it-v8-directory-user2@example.invalid'),
  ('b5555555-5555-4555-8555-555555555553','it-v8-directory-user3@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('b1111111-1111-4111-8111-111111111111','reviewer'),
  ('b2222222-2222-4222-8222-222222222222','operator'),
  ('b3333333-3333-4333-8333-333333333333','super_admin');
insert into public.profiles(id,auth_user_id,nickname,profile_status,created_at) values
  ('b6666666-6666-4666-8666-666666666661','b5555555-5555-4555-8555-555555555551','IT_V8_Directory_A','pending','2099-10-12 10:00:00+00'),
  ('b6666666-6666-4666-8666-666666666662','b5555555-5555-4555-8555-555555555552','IT_V8_Directory_B','pending','2099-10-12 10:00:00+00'),
  ('b6666666-6666-4666-8666-666666666663','b5555555-5555-4555-8555-555555555553','IT_V8_Directory_C','pending','2098-10-11 10:00:00+00');

do $test$
declare
  v_super uuid := 'b3333333-3333-4333-8333-333333333333';
  v_page jsonb;
  v_next jsonb;
  v_row jsonb;
  v_count integer;
  v_blocked boolean;
begin
  if has_function_privilege('anon', 'public.platform_admin_list_users(uuid,integer,timestamptz,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.platform_admin_list_users(uuid,integer,timestamptz,uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.platform_admin_list_users(uuid,integer,timestamptz,uuid)', 'EXECUTE')
  then raise exception 'USER_DIRECTORY_RPC_GRANT_LEAK'; end if;

  v_page := public.platform_admin_list_users(v_super, 1);
  if jsonb_array_length(v_page->'items') <> 1
    or v_page->'items'->0->>'id' <> 'b6666666-6666-4666-8666-666666666662'
    or jsonb_typeof(v_page->'next_cursor') <> 'object'
  then raise exception 'USER_DIRECTORY_FIRST_PAGE_BAD'; end if;
  v_row := v_page->'items'->0;
  if (select count(*) from jsonb_object_keys(v_row)) <> 4
    or not (v_row ?& array['id','nickname','profile_status','created_at'])
    or v_row ?| array['auth_user_id','email','phone','avatar_url','user_metadata']
  then raise exception 'USER_DIRECTORY_PRIVATE_FIELD_LEAK'; end if;

  v_next := public.platform_admin_list_users(v_super, 1,
    (v_page->'next_cursor'->>'created_at')::timestamptz,
    (v_page->'next_cursor'->>'id')::uuid);
  if v_next->'items'->0->>'id' <> 'b6666666-6666-4666-8666-666666666661'
  then raise exception 'USER_DIRECTORY_TIEBREAK_BAD'; end if;

  -- A database may already contain unrelated users; assert our future-dated
  -- fixtures lead the directory without assuming an empty environment.
  v_page := public.platform_admin_list_users(v_super, 50);
  if jsonb_array_length(v_page->'items') < 3
    or v_page->'items'->2->>'id' <> 'b6666666-6666-4666-8666-666666666663'
  then raise exception 'USER_DIRECTORY_ORDER_BAD'; end if;
  v_page := public.platform_admin_list_users(v_super, 50,
    '0001-01-01 00:00:00+00'::timestamptz,
    '00000000-0000-0000-0000-000000000000'::uuid);
  if jsonb_array_length(v_page->'items') <> 0
    or jsonb_typeof(v_page->'next_cursor') <> 'null'
  then raise exception 'USER_DIRECTORY_EMPTY_LAST_PAGE_BAD'; end if;

  v_blocked := false;
  begin perform public.platform_admin_list_users('b1111111-1111-4111-8111-111111111111', 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'; end;
  if not v_blocked then raise exception 'USER_DIRECTORY_REVIEWER_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_users('b2222222-2222-4222-8222-222222222222', 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'; end;
  if not v_blocked then raise exception 'USER_DIRECTORY_OPERATOR_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_users('b4444444-4444-4444-8444-444444444444', 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'; end;
  if not v_blocked then raise exception 'USER_DIRECTORY_OUTSIDER_ALLOWED'; end if;

  update platform_ops.admin_members set active=false where auth_user_id=v_super;
  v_blocked := false;
  begin perform public.platform_admin_list_users(v_super, 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'; end;
  if not v_blocked then raise exception 'USER_DIRECTORY_REVOKED_ADMIN_ALLOWED'; end if;
  update platform_ops.admin_members set active=true, role='operator' where auth_user_id=v_super;
  v_blocked := false;
  begin perform public.platform_admin_list_users(v_super, 10);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'; end;
  if not v_blocked then raise exception 'USER_DIRECTORY_DOWNGRADED_ADMIN_ALLOWED'; end if;
  update platform_ops.admin_members set role='super_admin' where auth_user_id=v_super;

  v_blocked := false;
  begin perform public.platform_admin_list_users(v_super, 0);
  exception when others then v_blocked := sqlerrm = 'INVALID_USER_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'USER_DIRECTORY_ZERO_PAGE_ACCEPTED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_users(v_super, 51);
  exception when others then v_blocked := sqlerrm = 'INVALID_USER_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'USER_DIRECTORY_OVERSIZE_PAGE_ACCEPTED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_users(v_super, 10, '2099-10-12 10:00:00+00', null);
  exception when others then v_blocked := sqlerrm = 'INVALID_USER_CURSOR'; end;
  if not v_blocked then raise exception 'USER_DIRECTORY_PARTIAL_CURSOR_ACCEPTED'; end if;
  select count(*) into v_count from public.profiles
  where id in ('b6666666-6666-4666-8666-666666666661','b6666666-6666-4666-8666-666666666662','b6666666-6666-4666-8666-666666666663');
  if v_count <> 3 then raise exception 'USER_DIRECTORY_READ_CHANGED_DATA'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin user directory contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin user directory contract"
