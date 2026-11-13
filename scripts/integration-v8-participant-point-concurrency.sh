#!/usr/bin/env bash
# Local-only V8 P1 integration: two authorized opponents submit distinct points
# against the same event/match versions while the event row is locked.
set -euo pipefail

host="${PGHOST:-127.0.0.1}"
port="${PGPORT:-54322}"
db_name="${PGDATABASE:-postgres}"
if [[ "$host" != "127.0.0.1" && "$host" != "localhost" && "$host" != "::1" ]] \
  || [[ "$port" != "54322" || -n "${PGHOSTADDR:-}" || -n "${PGSERVICE:-}" \
     || -n "${PGSERVICEFILE:-}" || -n "${PGSYSCONFDIR:-}" \
     || ! "$db_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "FAIL: concurrency fixture may only run against local Supabase on port 54322" >&2
  exit 1
fi
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -X -w -h "$host" -p "$port" -U "${PGUSER:-postgres}" -d "$db_name" -v ON_ERROR_STOP=1 -At)
workdir="$(mktemp -d)"

event='d9999999-9999-4999-8999-999999999999'
match='dccccccc-cccc-4ccc-8ccc-cccccccccccc'
operation_a='dddddddd-dddd-4ddd-8ddd-ddddddddddda'
operation_b='dddddddd-dddd-4ddd-8ddd-dddddddddddb'
actor_a='d2222222-2222-4222-8222-222222222222'
actor_b='d3333333-3333-4333-8333-333333333333'

cleanup() {
  # The fixture is committed to make it visible to both independent sessions.
  # Always remove it; never run this test against a non-local database.
  "${PSQL[@]}" >/dev/null <<SQL || echo 'WARNING: concurrency fixture cleanup failed' >&2
begin;
delete from scoring_ops.participant_point_actor_binding where operation_id in ('$operation_a','$operation_b');
delete from public.point_logs where match_id='$match';
delete from public.set_scores where match_id='$match';
delete from public.matches where id='$match';
delete from public.entry_players where event_id='$event';
delete from public.entries where event_id='$event';
delete from public.events where id='$event';
delete from public.players where id in ('d7777777-7777-4777-8777-777777777777','d8888888-8888-4888-8888-888888888888');
delete from public.profiles where id in ('d4444444-4444-4444-8444-444444444444','d5555555-5555-4555-8555-555555555555','d6666666-6666-4666-8666-666666666666');
delete from auth.users where id in ('d1111111-1111-4111-8111-111111111111','$actor_a','$actor_b');
commit;
SQL
  rm -rf "$workdir"
}
trap cleanup EXIT

"${PSQL[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values
 ('d1111111-1111-4111-8111-111111111111','v8-race-owner@example.invalid'),
 ('d2222222-2222-4222-8222-222222222222','v8-race-a@example.invalid'),
 ('d3333333-3333-4333-8333-333333333333','v8-race-b@example.invalid');
insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code) values
 ('d4444444-4444-4444-8444-444444444444','d1111111-1111-4111-8111-111111111111','V8 race owner',null,'completed','V8RA01'),
 ('d5555555-5555-4555-8555-555555555555','d2222222-2222-4222-8222-222222222222','V8 race A',null,'completed','V8RA02'),
 ('d6666666-6666-4666-8666-666666666666','d3333333-3333-4333-8333-333333333333','V8 race B',null,'completed','V8RA03');
insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type) values
 ('d7777777-7777-4777-8777-777777777777','d5555555-5555-4555-8555-555555555555','d5555555-5555-4555-8555-555555555555','Race A',null,'self'),
 ('d8888888-8888-4888-8888-888888888888','d6666666-6666-4666-8666-666666666666','d6666666-6666-4666-8666-666666666666','Race B',null,'self');
insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,fee_type,status,version,draw_generated) values
 ('d9999999-9999-4999-8999-999999999999','d4444444-4444-4444-8444-444444444444','V8 race event','public','singles','round_robin',1,'games_4','free','ongoing',1,true);
insert into public.entries(id,event_id,entry_type,signup_user_id,status) values
 ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','d9999999-9999-4999-8999-999999999999','singles',null,'confirmed'),
 ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','d9999999-9999-4999-8999-999999999999','singles',null,'confirmed');
insert into public.entry_players(entry_id,event_id,player_id,slot,active) values
 ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','d9999999-9999-4999-8999-999999999999','d7777777-7777-4777-8777-777777777777',1,true),
 ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','d9999999-9999-4999-8999-999999999999','d8888888-8888-4888-8888-888888888888',1,true);
insert into public.matches(id,event_id,stage,round_no,entry_a_id,entry_b_id,status,is_bye,version) values
 ('dccccccc-cccc-4ccc-8ccc-cccccccccccc','d9999999-9999-4999-8999-999999999999','round_robin',1,
 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','not_started',false,1);
commit;
SQL

make_snapshot() {
  local op="$1" side="$2"
  "${PSQL[@]}" -v "operation=$op" -v "side=$side" <<SQL
with current as (select public.get_event_snapshot('$event') as s)
select jsonb_set(
  jsonb_set(
    jsonb_set(s,'{event,version}','2'::jsonb,true),
    '{matches}',jsonb_build_array((s->'matches'->0)||jsonb_build_object('version',2,'status','ongoing','scoring_mode','live')),true),
  '{point_logs}',jsonb_build_array(jsonb_build_object(
    'id',:'operation'::uuid,'match_id','$match'::uuid,'set_no',1,'game_no',1,'point_no',1,
    'winner_side',:'side','scoring_context','normal_game','created_at',now(),'voided_at',null)),true)::text
from current;
SQL
}
snapshot_a="$(make_snapshot "$operation_a" A)"
snapshot_b="$(make_snapshot "$operation_b" B)"
[[ -n "$snapshot_a" && -n "$snapshot_b" ]] || { echo 'FAIL: empty fixture snapshot' >&2; exit 1; }

# Hold the event lock so both requests start from the same expected versions.
"${PSQL[@]}" >"$workdir/lock.log" 2>&1 <<SQL &
begin;
select 1 from public.events where id='$event' for update;
\! touch "$workdir/locked"
select pg_sleep(3);
commit;
SQL
lock_pid=$!
for _ in {1..60}; do
  [[ -f "$workdir/locked" ]] && break
  kill -0 "$lock_pid" 2>/dev/null || break
  sleep 0.05
done
[[ -f "$workdir/locked" ]] || { cat "$workdir/lock.log" >&2; echo 'FAIL: event lock not acquired' >&2; exit 1; }

run_point() {
  local actor="$1" op="$2" side="$3" snapshot="$4" output="$5"
  "${PSQL[@]}" -v "snapshot=$snapshot" >"$output" 2>&1 <<SQL
select public.v8_commit_participant_round_robin_point(
  '$event'::uuid,'$match'::uuid,'$actor'::uuid,1,1,'$op'::uuid,'$side',:'snapshot'::jsonb);
SQL
}
run_point "$actor_a" "$operation_a" A "$snapshot_a" "$workdir/a.log" & pid_a=$!
run_point "$actor_b" "$operation_b" B "$snapshot_b" "$workdir/b.log" & pid_b=$!
status_a=0; wait "$pid_a" || status_a=$?
status_b=0; wait "$pid_b" || status_b=$?
wait "$lock_pid"
if ! { [[ "$status_a" -eq 0 && "$status_b" -ne 0 ]] || [[ "$status_b" -eq 0 && "$status_a" -ne 0 ]]; }; then
  cat "$workdir/a.log" "$workdir/b.log" >&2
  echo 'FAIL: concurrent commands must yield exactly one success' >&2
  exit 1
fi
if [[ "$status_a" -ne 0 ]]; then loser="$workdir/a.log"; else loser="$workdir/b.log"; fi
grep -q 'VERSION_CONFLICT' "$loser" || { cat "$loser" >&2; echo 'FAIL: loser must receive VERSION_CONFLICT' >&2; exit 1; }

result="$("${PSQL[@]}" <<SQL
select (select count(*) from public.point_logs where match_id='$match')::text || '|' ||
       (select count(*) from scoring_ops.participant_point_actor_binding where operation_id in ('$operation_a','$operation_b'))::text || '|' ||
       (select version from public.events where id='$event')::text || '|' ||
       (select version from public.matches where id='$match')::text;
SQL
)"
[[ "$result" == '1|1|2|2' ]] || { echo "FAIL: non-atomic result: $result" >&2; exit 1; }
echo 'PASS: V8 participant point concurrent opponents serialize to one commit and one version conflict'
