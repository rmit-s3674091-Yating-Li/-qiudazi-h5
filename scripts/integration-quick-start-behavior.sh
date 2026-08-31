#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -Atc)

result="$("${PSQL[@]}" "begin;
  insert into auth.users(id,email)
  values
    ('51111111-1111-4111-8111-111111111111','it-quick-owner@example.invalid'),
    ('52222222-2222-4222-8222-222222222222','it-quick-alias@example.invalid');

  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code)
  values ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','51111111-1111-4111-8111-111111111111','IT quick owner',null,'completed','ITQUICK1');

  insert into private.profile_auth_aliases(auth_user_id,profile_id)
  values ('52222222-2222-4222-8222-222222222222','5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

  insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type)
  values
    ('5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT quick owner',null,'self'),
    ('5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',null,'IT quick temp',null,'manual');

  select set_config('request.jwt.claim.sub','52222222-2222-4222-8222-222222222222',true);

  with created as (
    select public.create_quick_event(
      jsonb_build_object(
        'name','IT Quick contract',
        'city','Test City',
        'match_type','singles',
        'format','knockout',
        'scoring_type','games_4'
      ),
      jsonb_build_array(
        jsonb_build_array('5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::text),
        jsonb_build_array('5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::text)
      )
    ) e
  ), unpacked as (
    select (e).id event_id,(e).owner_user_id owner_user_id,(e).event_mode event_mode,(e).visibility visibility,(e).status status,(e).entry_limit entry_limit
    from created
  )
  select case when
    owner_user_id='5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
    and event_mode='quick'
    and visibility='public'
    and status='locked'
    and entry_limit=2
    and (select count(*) from public.entries en where en.event_id=event_id and en.status='confirmed')=2
    and (select count(*) from public.entry_players ep where ep.event_id=event_id and ep.active)=2
    and (select count(distinct ep.player_id) from public.entry_players ep where ep.event_id=event_id and ep.active)=2
  then 'ok' else 'bad' end
  from unpacked;

  rollback;" | grep -E '^(ok|bad)$' | tail -n 1)"

if [ "$result" != "ok" ]; then
  echo "FAIL: quick-start behavioral identity/event contract (actual=$result)"
  exit 1
fi

echo "PASS: quick-start behavioral identity/event contract"
