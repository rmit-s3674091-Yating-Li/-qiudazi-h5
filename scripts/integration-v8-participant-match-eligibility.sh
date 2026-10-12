#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('b1111111-1111-4111-8111-111111111111','v8-elig-owner@example.invalid'),
  ('b2222222-2222-4222-8222-222222222222','v8-elig-actor@example.invalid'),
  ('b3333333-3333-4333-8333-333333333333','v8-elig-signup@example.invalid');
insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code) values
  ('b4444444-4444-4444-8444-444444444444','b1111111-1111-4111-8111-111111111111','V8 eligibility owner',null,'completed','V8ELIG01'),
  ('b5555555-5555-4555-8555-555555555555','b2222222-2222-4222-8222-222222222222','V8 eligibility actor',null,'completed','V8ELIG02'),
  ('b6666666-6666-4666-8666-666666666666','b3333333-3333-4333-8333-333333333333','V8 eligibility signup',null,'completed','V8ELIG03');
insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type) values
  ('b7777777-7777-4777-8777-777777777777','b5555555-5555-4555-8555-555555555555','b5555555-5555-4555-8555-555555555555','V8 actor',null,'self'),
  ('b8888888-8888-4888-8888-888888888888','b4444444-4444-4444-8444-444444444444','b4444444-4444-4444-8444-444444444444','V8 opponent',null,'self');
insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,fee_type,status,version,draw_generated) values
  ('b9999999-9999-4999-8999-999999999999','b4444444-4444-4444-8444-444444444444','V8 eligibility event','public','singles','knockout',1,'games_4','free','ongoing',1,true),
  ('baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','b4444444-4444-4444-8444-444444444444','V8 other event','public','singles','knockout',1,'games_4','free','ongoing',1,true);
insert into public.entries(id,event_id,entry_type,signup_user_id,status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b9999999-9999-4999-8999-999999999999','singles','b6666666-6666-4666-8666-666666666666','confirmed'),
  ('bccccccc-cccc-4ccc-8ccc-cccccccccccc','b9999999-9999-4999-8999-999999999999','singles',null,'confirmed');
insert into public.entry_players(entry_id,event_id,player_id,slot,active) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b9999999-9999-4999-8999-999999999999','b7777777-7777-4777-8777-777777777777',1,true),
  ('bccccccc-cccc-4ccc-8ccc-cccccccccccc','b9999999-9999-4999-8999-999999999999','b8888888-8888-4888-8888-888888888888',1,true);
insert into public.matches(id,event_id,stage,round_no,entry_a_id,entry_b_id,status,is_bye) values
  ('bddddddd-dddd-4ddd-8ddd-dddddddddddd','b9999999-9999-4999-8999-999999999999','knockout',1,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bccccccc-cccc-4ccc-8ccc-cccccccccccc','ongoing',false);

do $test$
declare
  event_id uuid := 'b9999999-9999-4999-8999-999999999999';
  match_id uuid := 'bddddddd-dddd-4ddd-8ddd-dddddddddddd';
  actor_id uuid := 'b2222222-2222-4222-8222-222222222222';
  signup_id uuid := 'b3333333-3333-4333-8333-333333333333';
begin
  if not public.v8_active_match_participant(event_id,match_id,actor_id) then
    raise exception 'ACTIVE_PARTICIPANT_DENIED';
  end if;
  if public.v8_active_match_participant(event_id,match_id,signup_id) then
    raise exception 'SIGNUP_ONLY_GRANTED';
  end if;
  if public.v8_active_match_participant('baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',match_id,actor_id) then
    raise exception 'CROSS_EVENT_GRANTED';
  end if;
  if public.v8_active_match_participant(event_id,'beeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',actor_id) then
    raise exception 'MISSING_MATCH_GRANTED';
  end if;
  if public.v8_active_match_participant(event_id,match_id,'bffffffff-ffff-4fff-8fff-ffffffffffff') then
    raise exception 'UNKNOWN_IDENTITY_GRANTED';
  end if;

  update public.entry_players set active=false where player_id='b7777777-7777-4777-8777-777777777777';
  if public.v8_active_match_participant(event_id,match_id,actor_id) then raise exception 'INACTIVE_GRANTED'; end if;
  update public.entry_players set active=true where player_id='b7777777-7777-4777-8777-777777777777';

  update public.entries set status='withdrawn' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  if public.v8_active_match_participant(event_id,match_id,actor_id) then raise exception 'WITHDRAWN_GRANTED'; end if;
  update public.entries set status='confirmed' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  update public.matches set status='finished' where id=match_id;
  if public.v8_active_match_participant(event_id,match_id,actor_id) then raise exception 'FINISHED_MATCH_GRANTED'; end if;
  update public.matches set status='ongoing' where id=match_id;

  update public.matches set is_bye=true where id=match_id;
  if public.v8_active_match_participant(event_id,match_id,actor_id) then raise exception 'BYE_GRANTED'; end if;
  update public.matches set is_bye=false where id=match_id;

  update public.matches set entry_b_id=null where id=match_id;
  if public.v8_active_match_participant(event_id,match_id,actor_id) then raise exception 'UNPAIRED_GRANTED'; end if;
  update public.matches set entry_b_id='bccccccc-cccc-4ccc-8ccc-cccccccccccc' where id=match_id;

  update public.events set status='finished' where id=event_id;
  if public.v8_active_match_participant(event_id,match_id,actor_id) then raise exception 'FINISHED_EVENT_GRANTED'; end if;

  if has_function_privilege('anon','public.v8_active_match_participant(uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.v8_active_match_participant(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'ELIGIBILITY_RPC_PUBLIC_EXECUTE_LEAK';
  end if;
  if not has_function_privilege('service_role','public.v8_active_match_participant(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'ELIGIBILITY_RPC_SERVICE_EXECUTE_MISSING';
  end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"

if [ "$result" != "ok" ]; then
  echo "FAIL: V8 match eligibility integration (actual=$result)"
  exit 1
fi

echo "PASS: V8 match eligibility integration"
