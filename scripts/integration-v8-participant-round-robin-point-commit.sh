#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)
result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
 ('c1111111-1111-4111-8111-111111111111','v8-tx-owner@example.invalid'),
 ('c2222222-2222-4222-8222-222222222222','v8-tx-player@example.invalid'),
 ('c3333333-3333-4333-8333-333333333333','v8-tx-signup@example.invalid');
insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code) values
 ('c4444444-4444-4444-8444-444444444444','c1111111-1111-4111-8111-111111111111','V8 TX owner',null,'completed','V8TX01'),
 ('c5555555-5555-4555-8555-555555555555','c2222222-2222-4222-8222-222222222222','V8 TX player',null,'completed','V8TX02'),
 ('c6666666-6666-4666-8666-666666666666','c3333333-3333-4333-8333-333333333333','V8 TX signup',null,'completed','V8TX03');
insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type) values
 ('c7777777-7777-4777-8777-777777777777','c5555555-5555-4555-8555-555555555555','c5555555-5555-4555-8555-555555555555','TX player',null,'self'),
 ('c8888888-8888-4888-8888-888888888888','c4444444-4444-4444-8444-444444444444','c4444444-4444-4444-8444-444444444444','TX opponent',null,'self');
insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,fee_type,status,version,draw_generated) values
 ('c9999999-9999-4999-8999-999999999999','c4444444-4444-4444-8444-444444444444','V8 TX event','public','singles','round_robin',1,'games_4','free','ongoing',1,true);
insert into public.entries(id,event_id,entry_type,signup_user_id,status) values
 ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c9999999-9999-4999-8999-999999999999','singles','c6666666-6666-4666-8666-666666666666','confirmed'),
 ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','c9999999-9999-4999-8999-999999999999','singles',null,'confirmed');
insert into public.entry_players(entry_id,event_id,player_id,slot,active) values
 ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c9999999-9999-4999-8999-999999999999','c7777777-7777-4777-8777-777777777777',1,true),
 ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','c9999999-9999-4999-8999-999999999999','c8888888-8888-4888-8888-888888888888',1,true);
insert into public.matches(id,event_id,stage,round_no,entry_a_id,entry_b_id,status,is_bye,version) values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','c9999999-9999-4999-8999-999999999999','round_robin',1,
 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','not_started',false,1);

do $test$
declare
  v_event uuid := 'c9999999-9999-4999-8999-999999999999';
  v_match uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_actor uuid := 'c2222222-2222-4222-8222-222222222222';
  v_op uuid := 'cddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_s jsonb;
  v_next jsonb;
  v_result jsonb;
  v_bad jsonb;
  v_blocked boolean;
begin
  v_s := public.get_event_snapshot(v_event);
  v_next := jsonb_set(v_s,'{event,version}','2'::jsonb,true);
  v_next := jsonb_set(v_next,'{matches}',jsonb_build_array(
    (v_s->'matches'->0) || jsonb_build_object('version',2,'status','ongoing','scoring_mode','live')
  ),true);
  v_next := jsonb_set(v_next,'{point_logs}',jsonb_build_array(jsonb_build_object(
    'id',v_op,'match_id',v_match,'set_no',1,'game_no',1,'point_no',1,
    'winner_side','A','scoring_context','normal_game','created_at',now(),'voided_at',null
  )),true);

  v_result := public.v8_commit_participant_round_robin_point(v_event,v_match,v_actor,1,1,v_op,'A',v_next);
  if (v_result->'event'->>'version')::integer<>2 or v_result->>'viewer_role'<>'participant'
    or not exists(select 1 from public.point_logs where id=v_op and winner_side='A')
    or not exists(select 1 from public.matches where id=v_match and version=2 and status='ongoing' and scoring_mode='live')
  then raise exception 'POINT_COMMIT_FAILED'; end if;

  -- Same operation must be idempotent even when original expected versions are stale.
  v_result := public.v8_commit_participant_round_robin_point(v_event,v_match,v_actor,1,1,v_op,'A',v_next);
  if (v_result->'event'->>'version')::integer<>2
    or (select count(*) from public.point_logs where match_id=v_match)<>1
  then raise exception 'REPLAY_NOT_IDEMPOTENT'; end if;

  v_blocked:=false;
  begin
    perform public.v8_commit_participant_round_robin_point(v_event,v_match,v_actor,1,1,
      'ceeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','A',v_next);
  exception when others then v_blocked:=(sqlerrm='VERSION_CONFLICT'); end;
  if not v_blocked then raise exception 'STALE_VERSION_ACCEPTED'; end if;

  v_blocked:=false;
  begin
    perform public.v8_commit_participant_round_robin_point(v_event,v_match,v_actor,1,1,v_op,'B',v_next);
  exception when others then v_blocked:=(sqlerrm='OPERATION_CONFLICT'); end;
  if not v_blocked then raise exception 'OPERATION_REPLAY_CONFLICT_NOT_REJECTED'; end if;

  -- Signup-only account must not gain scoring permission.
  v_blocked:=false;
  begin
    perform public.v8_commit_participant_round_robin_point(v_event,v_match,
      'c3333333-3333-4333-8333-333333333333',1,1,v_op,'A',v_next);
  exception when others then v_blocked:=(sqlerrm='NOT_MATCH_PARTICIPANT'); end;
  if not v_blocked then raise exception 'SIGNUP_ONLY_GRANTED'; end if;

  -- Membership revocation must be enforced even on a retry.
  update public.entry_players set active=false where player_id='c7777777-7777-4777-8777-777777777777';
  v_blocked:=false;
  begin
    perform public.v8_commit_participant_round_robin_point(v_event,v_match,v_actor,1,1,v_op,'A',v_next);
  exception when others then v_blocked:=(sqlerrm='NOT_MATCH_PARTICIPANT'); end;
  if not v_blocked then raise exception 'REVOKED_PLAYER_REPLAY_GRANTED'; end if;
  update public.entry_players set active=true where player_id='c7777777-7777-4777-8777-777777777777';

  -- A forged snapshot may not change another match or the event owner.
  v_bad := jsonb_set(v_next,'{event,owner_user_id}',to_jsonb(v_actor),true);
  v_blocked:=false;
  begin
    perform public.v8_commit_participant_round_robin_point(v_event,v_match,v_actor,2,2,
      'cfffffff-ffff-4fff-8fff-ffffffffffff','A',v_bad);
  exception when others then v_blocked:=(sqlerrm='INVALID_POINT_SNAPSHOT'); end;
  if not v_blocked then raise exception 'FORGED_SNAPSHOT_ACCEPTED'; end if;

  if has_function_privilege('authenticated',
      'public.v8_commit_participant_round_robin_point(uuid,uuid,uuid,integer,integer,uuid,text,jsonb)','EXECUTE')
    or has_function_privilege('anon',
      'public.v8_commit_participant_round_robin_point(uuid,uuid,uuid,integer,integer,uuid,text,jsonb)','EXECUTE')
    or not has_function_privilege('service_role',
      'public.v8_commit_participant_round_robin_point(uuid,uuid,uuid,integer,integer,uuid,text,jsonb)','EXECUTE')
  then raise exception 'POINT_TRANSACTION_ACL_BAD'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then echo "FAIL: V8 participant round-robin point transaction"; exit 1; fi
echo "PASS: V8 participant round-robin point transaction"
