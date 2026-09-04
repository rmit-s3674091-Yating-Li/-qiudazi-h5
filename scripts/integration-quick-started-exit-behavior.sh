#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -Atc)

result="$("${PSQL[@]}" "begin;
  insert into auth.users(id,email) values
    ('81111111-1111-4111-8111-111111111111','it-quick-exit-owner@example.invalid'),
    ('82222222-2222-4222-8222-222222222222','it-quick-exit-player@example.invalid'),
    ('83333333-3333-4333-8333-333333333333','it-quick-exit-other@example.invalid');
  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code) values
    ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','81111111-1111-4111-8111-111111111111','IT exit owner',null,'completed','ITEXIT1'),
    ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','82222222-2222-4222-8222-222222222222','IT exit player',null,'completed','ITEXIT2'),
    ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','83333333-3333-4333-8333-333333333333','IT exit other',null,'completed','ITEXIT3');
  insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type) values
    ('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Owner',null,'self'),
    ('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','Participant',null,'manual');

  -- Single real match: Walkover must finish Match and Event atomically.
  insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,tiebreak_trigger,fee_type,status,version,draw_generated,event_mode)
  values ('8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT single walkover','private','singles','knockout',1,'games_4',3,'free','ongoing',1,true,'quick');
  insert into public.entries(id,event_id,entry_type,status) values
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc1','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','singles','confirmed'),
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc2','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','singles','confirmed');
  insert into public.entry_players(entry_id,player_id,event_id,slot,active) values
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc1','8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1,true),
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc2','8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',1,true);
  insert into public.matches(id,event_id,stage,round_no,status,entry_a_id,entry_b_id,version,scoring_mode)
  values ('8ddddddd-dddd-4ddd-8ddd-ddddddddddd1','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','knockout',1,'not_started','8ccccccc-cccc-4ccc-8ccc-ccccccccccc1','8ccccccc-cccc-4ccc-8ccc-ccccccccccc2',1,'live');

  do \$\$
  declare snap jsonb;
  begin
    snap := public.resolve_quick_match_exit('8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','8ddddddd-dddd-4ddd-8ddd-ddddddddddd1','82222222-2222-4222-8222-222222222222',1);
    if snap->'event'->>'status' <> 'finished'
      or (snap->'event'->>'finished_at') is null
      or (snap->'event'->>'version')::integer <> 2
      or (snap->'matches'->0->>'status') <> 'finished'
      or (snap->'matches'->0->>'completion_reason') <> 'walkover'
      or (snap->'matches'->0->>'winner_entry_id')::uuid <> '8ccccccc-cccc-4ccc-8ccc-ccccccccccc1'
      or (snap->'matches'->0->>'version')::integer <> 2
    then raise exception 'QUICK_SINGLE_WALKOVER_BAD'; end if;
  end \$\$;

  -- Multi-match Quick: finishing one real Match must not finish Event early.
  insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,tiebreak_trigger,fee_type,status,version,draw_generated,event_mode)
  values ('8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT multi retirement','private','singles','round_robin',1,'games_4',3,'free','ongoing',1,true,'quick');
  insert into public.entries(id,event_id,entry_type,status) values
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc3','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','singles','confirmed'),
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc4','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','singles','confirmed');
  insert into public.entry_players(entry_id,player_id,event_id,slot,active) values
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc3','8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',1,true),
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc4','8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',1,true);
  insert into public.matches(id,event_id,stage,round_no,status,entry_a_id,entry_b_id,version,scoring_mode) values
    ('8ddddddd-dddd-4ddd-8ddd-ddddddddddd2','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','round_robin',1,'ongoing','8ccccccc-cccc-4ccc-8ccc-ccccccccccc3','8ccccccc-cccc-4ccc-8ccc-ccccccccccc4',1,'live'),
    ('8ddddddd-dddd-4ddd-8ddd-ddddddddddd3','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','round_robin',2,'not_started','8ccccccc-cccc-4ccc-8ccc-ccccccccccc3','8ccccccc-cccc-4ccc-8ccc-ccccccccccc4',1,'live');

  do \$\$
  declare snap jsonb; blocked boolean;
  begin
    blocked:=false; begin perform public.resolve_quick_match_exit('8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','8ddddddd-dddd-4ddd-8ddd-ddddddddddd2','83333333-3333-4333-8333-333333333333',1); exception when others then blocked := sqlerrm='NOT_MATCH_PARTICIPANT'; end;
    if not blocked then raise exception 'QUICK_EXIT_NON_PARTICIPANT_NOT_BLOCKED'; end if;

    blocked:=false; begin perform public.resolve_quick_match_exit('8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','8ddddddd-dddd-4ddd-8ddd-ddddddddddd2','82222222-2222-4222-8222-222222222222',0); exception when others then blocked := sqlerrm='VERSION_CONFLICT'; end;
    if not blocked then raise exception 'QUICK_EXIT_STALE_NOT_BLOCKED'; end if;

    snap := public.resolve_quick_match_exit('8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','8ddddddd-dddd-4ddd-8ddd-ddddddddddd2','82222222-2222-4222-8222-222222222222',1);
    if snap->'event'->>'status' <> 'ongoing'
      or (snap->'event'->>'finished_at') is not null
      or (snap->'event'->>'version')::integer <> 2
      or (select completion_reason from public.matches where id='8ddddddd-dddd-4ddd-8ddd-ddddddddddd2') <> 'retirement'
      or (select status from public.matches where id='8ddddddd-dddd-4ddd-8ddd-ddddddddddd3') <> 'not_started'
    then raise exception 'QUICK_MULTI_PREMATURE_FINISH'; end if;
  end \$\$;

  -- Downstream-start guard must roll the whole transaction back.
  insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,tiebreak_trigger,fee_type,status,version,draw_generated,event_mode)
  values ('8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT downstream guard','private','singles','knockout',1,'games_4',3,'free','ongoing',1,true,'quick');
  insert into public.entries(id,event_id,entry_type,status) values
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc5','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','singles','confirmed'),
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc6','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','singles','confirmed');
  insert into public.entry_players(entry_id,player_id,event_id,slot,active) values
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc5','8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',1,true),
    ('8ccccccc-cccc-4ccc-8ccc-ccccccccccc6','8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',1,true);
  insert into public.matches(id,event_id,stage,round_no,status,entry_a_id,entry_b_id,version,scoring_mode) values
    ('8ddddddd-dddd-4ddd-8ddd-ddddddddddd4','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','knockout',1,'ongoing','8ccccccc-cccc-4ccc-8ccc-ccccccccccc5','8ccccccc-cccc-4ccc-8ccc-ccccccccccc6',1,'live'),
    ('8ddddddd-dddd-4ddd-8ddd-ddddddddddd5','8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','knockout',2,'ongoing','8ccccccc-cccc-4ccc-8ccc-ccccccccccc5','8ccccccc-cccc-4ccc-8ccc-ccccccccccc6',1,'live');
  update public.matches set next_match_id='8ddddddd-dddd-4ddd-8ddd-ddddddddddd5',next_slot='A' where id='8ddddddd-dddd-4ddd-8ddd-ddddddddddd4';

  do \$\$
  declare blocked boolean;
  begin
    blocked:=false; begin perform public.resolve_quick_match_exit('8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','8ddddddd-dddd-4ddd-8ddd-ddddddddddd4','82222222-2222-4222-8222-222222222222',1); exception when others then blocked := sqlerrm='DOWNSTREAM_MATCH_STARTED'; end;
    if not blocked then raise exception 'QUICK_EXIT_DOWNSTREAM_NOT_BLOCKED'; end if;
    if (select status from public.matches where id='8ddddddd-dddd-4ddd-8ddd-ddddddddddd4') <> 'ongoing'
      or (select completion_reason from public.matches where id='8ddddddd-dddd-4ddd-8ddd-ddddddddddd4') is not null
      or (select version from public.events where id='8eeeeeee-eeee-4eee-8eee-eeeeeeeeeee3') <> 1
    then raise exception 'QUICK_EXIT_DOWNSTREAM_PARTIAL_COMMIT'; end if;
  end \$\$;

  select 'ok';
  rollback;" | grep -E '^(ok|bad)$' | tail -n 1)"

if [ "$result" != "ok" ]; then
  echo "FAIL: Quick started-exit transaction contract (actual=$result)"
  exit 1
fi

echo "PASS: Quick started-exit transaction contract"
