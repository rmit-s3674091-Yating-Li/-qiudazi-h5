#!/usr/bin/env bash
set -euo pipefail
# Creates auth and tournament fixture rows: local Supabase test DB ONLY.
db_host="${PGHOST:-127.0.0.1}"
db_port="${PGPORT:-54322}"
db_name="${PGDATABASE:-postgres}"
case "$db_host" in 127.0.0.1|localhost|::1) ;; *) echo 'FAIL: local Supabase only' >&2; exit 2 ;; esac
if [[ "$db_port" != 54322 || -n "${PGHOSTADDR:-}" || -n "${PGSERVICE:-}" || -n "${PGSERVICEFILE:-}" || -n "${PGSYSCONFDIR:-}" || ! "$db_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo 'FAIL: direct local test database required' >&2; exit 2
fi
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -X -w -h "$db_host" -p "$db_port" -U "${PGUSER:-postgres}" -d "$db_name" -v ON_ERROR_STOP=1 -At)
result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
 ('d1111111-1111-4111-8111-111111111111','v8-opponent-owner@example.invalid'),
 ('d2222222-2222-4222-8222-222222222222','v8-opponent-player@example.invalid');
insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code) values
 ('d4444444-4444-4444-8444-444444444444','d1111111-1111-4111-8111-111111111111','Opponent owner',null,'completed','V8OPP01'),
 ('d5555555-5555-4555-8555-555555555555','d2222222-2222-4222-8222-222222222222','Opponent scorer',null,'completed','V8OPP02');
insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type) values
 ('d7777777-7777-4777-8777-777777777777','d5555555-5555-4555-8555-555555555555','d5555555-5555-4555-8555-555555555555','Scorer',null,'self'),
 ('d8888888-8888-4888-8888-888888888888','d4444444-4444-4444-8444-444444444444','d4444444-4444-4444-8444-444444444444','Opponent',null,'self');
insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,fee_type,status,version,draw_generated) values
 ('d9999999-9999-4999-8999-999999999999','d4444444-4444-4444-8444-444444444444','Opponent status test','public','singles','round_robin',1,'games_4','free','ongoing',1,true);
insert into public.entries(id,event_id,entry_type,status) values
 ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','d9999999-9999-4999-8999-999999999999','singles','confirmed'),
 ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','d9999999-9999-4999-8999-999999999999','singles','confirmed');
insert into public.entry_players(entry_id,event_id,player_id,slot,active) values
 ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','d9999999-9999-4999-8999-999999999999','d7777777-7777-4777-8777-777777777777',1,true),
 ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','d9999999-9999-4999-8999-999999999999','d8888888-8888-4888-8888-888888888888',1,true);
insert into public.matches(id,event_id,stage,round_no,entry_a_id,entry_b_id,status,is_bye,version) values
 ('dccccccc-cccc-4ccc-8ccc-cccccccccccc','d9999999-9999-4999-8999-999999999999','round_robin',1,
 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ongoing',false,1);
do $test$
declare
  v_event uuid := 'd9999999-9999-4999-8999-999999999999';
  v_match uuid := 'dccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_actor uuid := 'd2222222-2222-4222-8222-222222222222';
  v_op uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_blocked boolean;
begin
  -- No match may assign the same entry to both sides. This protects the
  -- scoring transaction even if a malformed bracket bypasses the UI.
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'v8_match_distinct_entries'
      and convalidated
  ) then raise exception 'DISTINCT_MATCH_ENTRY_CONSTRAINT_MISSING'; end if;
  v_blocked := false;
  begin
    update public.matches set entry_b_id = entry_a_id where id = v_match;
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'SAME_ENTRY_MATCH_ACCEPTED'; end if;
  if (select entry_b_id from public.matches where id = v_match)
    is distinct from 'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid then
    raise exception 'REJECTED_SAME_ENTRY_MUTATED_MATCH';
  end if;

  if not public.v8_active_match_participant(v_event,v_match,v_actor) then
    raise exception 'VALID_PAIR_DENIED';
  end if;

  -- The scorer remains confirmed and active, but the OTHER entry withdraws.
  update public.entries set status='withdrawn'
    where id='dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if public.v8_active_match_participant(v_event,v_match,v_actor) then
    raise exception 'WITHDRAWN_OPPONENT_PREFLIGHT_GRANTED';
  end if;
  v_blocked := false;
  begin
    perform public.v8_commit_participant_round_robin_point(
      v_event,v_match,v_actor,1,1,v_op,'A','{}'::jsonb);
  exception when others then
    v_blocked := (sqlerrm='PARTICIPANT_POINT_NOT_ALLOWED');
  end;
  if not v_blocked then raise exception 'WITHDRAWN_OPPONENT_POINT_GRANTED'; end if;

  -- Restoring both confirmed entries must reach the normal snapshot validator,
  -- not be rejected by the new pair-status gate.
  update public.entries set status='confirmed'
    where id='dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if not public.v8_active_match_participant(v_event,v_match,v_actor) then
    raise exception 'RESTORED_PAIR_DENIED';
  end if;
  v_blocked := false;
  begin
    perform public.v8_commit_participant_round_robin_point(
      v_event,v_match,v_actor,1,1,v_op,'A','{}'::jsonb);
  exception when others then
    v_blocked := (sqlerrm='INVALID_POINT_SNAPSHOT');
  end;
  if not v_blocked then raise exception 'VALID_PAIR_DID_NOT_REACH_SNAPSHOT_VALIDATION'; end if;

  if exists(select 1 from public.point_logs where id=v_op)
    or exists(select 1 from scoring_ops.participant_point_actor_binding where operation_id=v_op) then
    raise exception 'REJECTED_POINT_MUTATED_DATABASE';
  end if;
  if has_function_privilege('authenticated',
    'public.v8_commit_participant_round_robin_point(uuid,uuid,uuid,integer,integer,uuid,text,jsonb)','EXECUTE')
    or not has_function_privilege('service_role',
    'public.v8_commit_participant_round_robin_point(uuid,uuid,uuid,integer,integer,uuid,text,jsonb)','EXECUTE')
  then raise exception 'POINT_RPC_ACL_REGRESSION'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [[ "$result" != ok ]]; then echo 'FAIL: V8 participant opponent entry status contract' >&2; exit 1; fi
echo 'PASS: V8 participant opponent entry status contract'
