#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -Atc)

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $label (expected=$expected actual=$actual)"
    exit 1
  fi
  echo "PASS: $label"
}

echo "== Event lifecycle started-match behavior =="

# IT-03 behavioral regression: once a Match has started, owner-side cancel/delete
# must be rejected by the server. The fixture is transaction-scoped and rolls back.
result="$("${PSQL[@]}" "begin;
  insert into auth.users(id,email)
  values ('51111111-1111-4111-8111-111111111111','it-started-lifecycle-owner@example.invalid');
  select set_config('request.jwt.claim.sub','51111111-1111-4111-8111-111111111111',true);
  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code)
  values ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','51111111-1111-4111-8111-111111111111','IT started lifecycle owner',null,'completed','ITSTART1');
  insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,tiebreak_trigger,fee_type,city,status,version)
  values ('5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT started lifecycle','private','singles','knockout',1,'games_4',3,'free','Test City','locked',1);
  insert into public.matches(id,event_id,stage,round_no,status,version)
  values ('5ddddddd-dddd-4ddd-8ddd-ddddddddddd1','5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','knockout',1,'ongoing',1);
  do \$\$
  declare
    cancel_blocked boolean := false;
    delete_blocked boolean := false;
  begin
    begin
      perform * from public.cancel_event('5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1);
    exception when others then
      if sqlerrm='EVENT_CANCEL_STARTED' then cancel_blocked := true; else raise; end if;
    end;
    begin
      perform public.delete_event('5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1);
    exception when others then
      if sqlerrm='EVENT_DELETE_STARTED' then delete_blocked := true; else raise; end if;
    end;
    if cancel_blocked and delete_blocked then
      perform set_config('it.started_lifecycle','blocked',true);
    else
      perform set_config('it.started_lifecycle','bad',true);
    end if;
  end
  \$\$;
  select case
    when current_setting('it.started_lifecycle',true)='blocked'
      and exists(select 1 from public.events where id='5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1' and status='locked' and version=1)
    then 'ok' else 'bad' end;
  rollback;" | grep -E '^(ok|bad)$' | tail -n 1)"

assert_eq "$result" "ok" "started Match blocks event cancel/delete without mutating Event"

echo "Event lifecycle started-match behavior passed."
