#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -Atc)

result="$("${PSQL[@]}" "begin;
  insert into auth.users(id,email) values
    ('71111111-1111-4111-8111-111111111111','it-quick-withdraw-owner@example.invalid'),
    ('72222222-2222-4222-8222-222222222222','it-quick-withdraw-player@example.invalid'),
    ('73333333-3333-4333-8333-333333333333','it-quick-withdraw-other@example.invalid');
  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code) values
    ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','71111111-1111-4111-8111-111111111111','IT withdraw owner',null,'completed','ITWDRW1'),
    ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','72222222-2222-4222-8222-222222222222','IT withdraw player',null,'completed','ITWDRW2'),
    ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','73333333-3333-4333-8333-333333333333','IT withdraw other',null,'completed','ITWDRW3');
  insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type) values
    ('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Owner',null,'self'),
    ('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','Participant',null,'manual');

  select set_config('request.jwt.claim.sub','71111111-1111-4111-8111-111111111111',true);
  select (public.create_quick_event(
    jsonb_build_object('name','IT withdraw success','match_type','singles','format','knockout','scoring_type','games_4'),
    jsonb_build_array(jsonb_build_array('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::text),jsonb_build_array('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::text))
  )).id;

  do \$\$
  declare ev public.events; snap jsonb; participant_entry uuid;
  begin
    select * into ev from public.events where name='IT withdraw success';
    select en.id into participant_entry from public.entries en
      join public.entry_players ep on ep.entry_id=en.id and ep.active
      join public.players p on p.id=ep.player_id
      where en.event_id=ev.id and p.linked_user_id='7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
    snap := public.withdraw_quick_event(ev.id,'72222222-2222-4222-8222-222222222222',ev.version);
    if snap->'event'->>'status' <> 'cancelled'
      or (snap->'event'->>'cancelled_at') is null
      or (snap->'event'->>'draw_generated')::boolean is not false
      or (snap->'event'->>'version')::integer <> ev.version+1
      or not exists(select 1 from public.entries where id=participant_entry and status='withdrawn')
      or exists(select 1 from public.entry_players where entry_id=participant_entry and active)
      or exists(select 1 from public.matches where event_id=ev.id)
    then raise exception 'QUICK_WITHDRAW_SUCCESS_BAD'; end if;
  end \$\$;

  -- Fresh event for authorization/version/start rejection cases.
  select set_config('request.jwt.claim.sub','71111111-1111-4111-8111-111111111111',true);
  select (public.create_quick_event(
    jsonb_build_object('name','IT withdraw guards','match_type','singles','format','knockout','scoring_type','games_4'),
    jsonb_build_array(jsonb_build_array('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::text),jsonb_build_array('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::text))
  )).id;

  do \$\$
  declare ev public.events; blocked boolean;
  begin
    select * into ev from public.events where name='IT withdraw guards';

    blocked:=false; begin perform public.withdraw_quick_event(ev.id,'73333333-3333-4333-8333-333333333333',ev.version); exception when others then blocked := sqlerrm='NOT_PARTICIPANT'; end;
    if not blocked then raise exception 'QUICK_WITHDRAW_NON_PARTICIPANT_NOT_BLOCKED'; end if;

    blocked:=false; begin perform public.withdraw_quick_event(ev.id,'71111111-1111-4111-8111-111111111111',ev.version); exception when others then blocked := sqlerrm='OWNER_MUST_CANCEL'; end;
    if not blocked then raise exception 'QUICK_WITHDRAW_OWNER_NOT_BLOCKED'; end if;

    blocked:=false; begin perform public.withdraw_quick_event(ev.id,'72222222-2222-4222-8222-222222222222',ev.version-1); exception when others then blocked := sqlerrm='VERSION_CONFLICT'; end;
    if not blocked then raise exception 'QUICK_WITHDRAW_STALE_NOT_BLOCKED'; end if;

    update public.matches set status='ongoing' where event_id=ev.id;
    blocked:=false; begin perform public.withdraw_quick_event(ev.id,'72222222-2222-4222-8222-222222222222',ev.version); exception when others then blocked := sqlerrm='WITHDRAW_CLOSED'; end;
    if not blocked then raise exception 'QUICK_WITHDRAW_STARTED_NOT_BLOCKED'; end if;
  end \$\$;

  select 'ok';
  rollback;" | grep -E '^(ok|bad)$' | tail -n 1)"

if [ "$result" != "ok" ]; then
  echo "FAIL: quick participant withdraw transaction contract (actual=$result)"
  exit 1
fi

echo "PASS: quick participant withdraw transaction contract"
