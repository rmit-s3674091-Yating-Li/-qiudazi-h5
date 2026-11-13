#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)
result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
 ('e1111111-1111-4111-8111-111111111111','v8-exception-reviewer@example.invalid'),
 ('e2222222-2222-4222-8222-222222222222','v8-exception-operator@example.invalid'),
 ('e3333333-3333-4333-8333-333333333333','v8-exception-super@example.invalid'),
 ('e4444444-4444-4444-8444-444444444444','v8-exception-outsider@example.invalid'),
 ('e5555555-5555-4555-8555-555555555555','v8-exception-owner@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
 ('e1111111-1111-4111-8111-111111111111','reviewer'),
 ('e2222222-2222-4222-8222-222222222222','operator'),
 ('e3333333-3333-4333-8333-333333333333','super_admin');
insert into public.profiles(id,auth_user_id,nickname,profile_status) values
 ('e6666666-6666-4666-8666-666666666666','e5555555-5555-4555-8555-555555555555','V8 exception owner','completed');
insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,fee_type,status,version) values
 ('e7777777-7777-4777-8777-777777777777','e6666666-6666-4666-8666-666666666666','V8 exception event','private','singles','round_robin',1,'games_4','free','ongoing',1);
insert into public.entries(id,event_id,entry_type,status) values
 ('e8888888-8888-4888-8888-888888888881','e7777777-7777-4777-8777-777777777777','singles','confirmed'),
 ('e8888888-8888-4888-8888-888888888882','e7777777-7777-4777-8777-777777777777','singles','confirmed'),
 ('e8888888-8888-4888-8888-888888888883','e7777777-7777-4777-8777-777777777777','singles','confirmed');
insert into public.matches(id,event_id,stage,round_no,entry_a_id,entry_b_id,status,winner_entry_id,is_bye,scoring_mode,created_at) values
 ('e9999999-9999-4999-8999-999999999991','e7777777-7777-4777-8777-777777777777','round_robin',1,'e8888888-8888-4888-8888-888888888881','e8888888-8888-4888-8888-888888888882','finished',null,false,'live','2099-01-01 00:00:00+00'),
 ('e9999999-9999-4999-8999-999999999992','e7777777-7777-4777-8777-777777777777','round_robin',1,'e8888888-8888-4888-8888-888888888881','e8888888-8888-4888-8888-888888888882','ongoing','e8888888-8888-4888-8888-888888888881',false,'live','2099-01-01 00:00:00+00'),
 ('e9999999-9999-4999-8999-999999999993','e7777777-7777-4777-8777-777777777777','round_robin',1,'e8888888-8888-4888-8888-888888888881','e8888888-8888-4888-8888-888888888882','finished','e8888888-8888-4888-8888-888888888883',false,'direct','2099-01-01 00:00:00+00'),
 ('e9999999-9999-4999-8999-999999999994','e7777777-7777-4777-8777-777777777777','round_robin',1,'e8888888-8888-4888-8888-888888888881','e8888888-8888-4888-8888-888888888882','ongoing',null,false,'direct','2099-01-01 00:00:00+00'),
 ('e9999999-9999-4999-8999-999999999995','e7777777-7777-4777-8777-777777777777','round_robin',1,'e8888888-8888-4888-8888-888888888881','e8888888-8888-4888-8888-888888888882','ongoing',null,false,null,'2099-01-01 00:00:00+00');
insert into public.point_logs(match_id,set_no,game_no,point_no,winner_side,scoring_context)
 values ('e9999999-9999-4999-8999-999999999994',1,1,1,'A','normal_game');

do $test$
declare
  v_event uuid := 'e7777777-7777-4777-8777-777777777777';
  v_reviewer uuid := 'e1111111-1111-4111-8111-111111111111';
  v_operator uuid := 'e2222222-2222-4222-8222-222222222222';
  v_super uuid := 'e3333333-3333-4333-8333-333333333333';
  v_page jsonb; v_next jsonb; v_row jsonb; v_blocked boolean;
begin
  if has_function_privilege('anon','public.platform_admin_list_score_exceptions(uuid,uuid,integer,timestamptz,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.platform_admin_list_score_exceptions(uuid,uuid,integer,timestamptz,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.platform_admin_list_score_exceptions(uuid,uuid,integer,timestamptz,uuid)','EXECUTE')
  then raise exception 'SCORE_EXCEPTION_RPC_GRANT_LEAK'; end if;
  v_page := public.platform_admin_list_score_exceptions(v_reviewer,v_event,2);
  if jsonb_array_length(v_page->'items') <> 2
    or v_page->'items'->0->>'anomaly_code' <> 'DIRECT_WITH_ACTIVE_POINTS'
    or v_page->'items'->1->>'anomaly_code' <> 'WINNER_NOT_IN_MATCH'
    or jsonb_typeof(v_page->'next_cursor') <> 'object' then raise exception 'SCORE_EXCEPTION_FIRST_PAGE_BAD'; end if;
  v_row := v_page->'items'->0;
  if (select count(*) from jsonb_object_keys(v_row)) <> 9
    or v_row ?| array['winner_entry_id','entry_a_id','entry_b_id','signup_user_id','name','email','phone','point_logs','scores']
  then raise exception 'SCORE_EXCEPTION_PRIVATE_FIELDS_LEAK'; end if;
  v_next := public.platform_admin_list_score_exceptions(v_reviewer,v_event,2,
    (v_page->'next_cursor'->>'created_at')::timestamptz,(v_page->'next_cursor'->>'id')::uuid);
  if jsonb_array_length(v_next->'items') <> 2
    or v_next->'items'->0->>'anomaly_code' <> 'UNFINISHED_WITH_WINNER'
    or v_next->'items'->1->>'anomaly_code' <> 'FINISHED_WITHOUT_WINNER'
    or jsonb_typeof(v_next->'next_cursor') <> 'null' then raise exception 'SCORE_EXCEPTION_PAGINATION_BAD'; end if;
  v_page := public.platform_admin_list_score_exceptions(v_operator,v_event,50);
  if jsonb_array_length(v_page->'items') <> 4 then raise exception 'SCORE_EXCEPTION_NORMAL_MATCH_INCLUDED'; end if;
  v_page := public.platform_admin_list_score_exceptions(v_super,v_event,10,'0001-01-01 00:00:00+00','00000000-0000-0000-0000-000000000000');
  if jsonb_array_length(v_page->'items') <> 0 then raise exception 'SCORE_EXCEPTION_EMPTY_PAGE_BAD'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_score_exceptions('e4444444-4444-4444-8444-444444444444',v_event,10);
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'SCORE_EXCEPTION_OUTSIDER_ALLOWED'; end if;
  update platform_ops.admin_members set active=false where auth_user_id=v_reviewer;
  v_blocked := false;
  begin perform public.platform_admin_list_score_exceptions(v_reviewer,v_event,10);
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'SCORE_EXCEPTION_REVOKED_ALLOWED'; end if;
  if (select count(*) from public.matches where event_id=v_event) <> 5
    or (select count(*) from public.point_logs where match_id='e9999999-9999-4999-8999-999999999994') <> 1
  then raise exception 'SCORE_EXCEPTION_READ_CHANGED_DATA'; end if;
end;
$test$;
select 'ok'; rollback;
SQL
)"
if [ "$result" != "ok" ]; then echo "FAIL: Platform Admin score exception directory contract (actual=$result)"; exit 1; fi
echo "PASS: Platform Admin score exception directory contract"
