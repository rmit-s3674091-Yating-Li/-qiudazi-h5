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

echo "== Scoring persistence behavior =="

scoring_result="$("${PSQL[@]}" "begin;
  insert into auth.users(id,email)
  values ('61111111-1111-4111-8111-111111111111','it-scoring-owner@example.invalid');
  select set_config('request.jwt.claim.sub','61111111-1111-4111-8111-111111111111',true);
  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code)
  values ('6aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','61111111-1111-4111-8111-111111111111','IT scoring owner',null,'completed','ITSCORE1');

  do \$\$
  declare
    saved public.events;
    legacy_saved public.events;
  begin
    saved := public.save_event(null, jsonb_build_object(
      'name','IT scoring rules','visibility','private','link_signup_enabled',true,
      'match_type','singles','format','knockout','best_of',3,'scoring_type','games_6',
      'custom_games_target',null,'tiebreak_trigger',6,'tiebreak_target',10,
      'tiebreak_win_by_two',false,'games_win_by_two',false,'game_scoring','no_ad',
      'suggested_level_min',null,'suggested_level_max',null,'entry_limit',8,
      'event_date','2099-01-01','event_time','12:00:00','registration_deadline','2099-01-01T10:00:00',
      'city','Test City','venue',null,'fee_type','free','venue_fee_total',null,
      'ball_fee_total',null,'other_fee_total',null,'fixed_fee_per_entry',null,
      'group_count',null,'qualifiers_per_group',null
    ), null);
    if saved.tiebreak_target <> 10 or saved.tiebreak_win_by_two is not false or saved.games_win_by_two is not false or saved.game_scoring <> 'no_ad' then
      raise exception 'SCORING_RULE_SAVE_BAD';
    end if;

    legacy_saved := public.save_event(null, jsonb_build_object(
      'name','IT legacy scoring rules','visibility','private','link_signup_enabled',true,
      'match_type','singles','format','knockout','best_of',1,'scoring_type','games_4',
      'custom_games_target',null,'tiebreak_trigger',3,'game_scoring','advantage',
      'suggested_level_min',null,'suggested_level_max',null,'entry_limit',8,
      'event_date','2099-01-02','event_time','12:00:00','registration_deadline','2099-01-02T10:00:00',
      'city','Test City','venue',null,'fee_type','free','venue_fee_total',null,
      'ball_fee_total',null,'other_fee_total',null,'fixed_fee_per_entry',null,
      'group_count',null,'qualifiers_per_group',null
    ), null);
    if legacy_saved.tiebreak_target <> 7 or legacy_saved.tiebreak_win_by_two is not true or legacy_saved.games_win_by_two is not true then
      raise exception 'SCORING_RULE_LEGACY_DEFAULT_BAD';
    end if;
  end
  \$\$;

  insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,tiebreak_trigger,tiebreak_target,tiebreak_win_by_two,games_win_by_two,fee_type,city,status,version,draw_generated)
  values ('6eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','6aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT scoring persistence','private','singles','knockout',1,'games_4',3,9,false,false,'free','Test City','ongoing',1,true);
  insert into public.matches(id,event_id,stage,round_no,status,version,scoring_mode)
  values ('6ddddddd-dddd-4ddd-8ddd-ddddddddddd1','6eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','knockout',1,'ongoing',1,'live');

  do \$\$
  declare
    s jsonb;
    committed jsonb;
    undone jsonb;
    next_matches jsonb;
    stale_blocked boolean := false;
  begin
    s := public.get_event_snapshot('6eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1');
    if (s->'event'->>'tiebreak_target')::integer <> 9
      or (s->'event'->>'tiebreak_win_by_two')::boolean is not false
      or (s->'event'->>'games_win_by_two')::boolean is not false
    then raise exception 'SCORING_RULE_SNAPSHOT_BAD'; end if;

    select jsonb_agg(
      case when x->>'id'='6ddddddd-dddd-4ddd-8ddd-ddddddddddd1'
        then jsonb_set(x,'{version}','2'::jsonb,true)
        else x end
      order by x->>'id'
    ) into next_matches
    from jsonb_array_elements(s->'matches') x;
    s := jsonb_set(s,'{matches}',coalesce(next_matches,'[]'::jsonb),true);
    s := jsonb_set(s,'{point_logs}',jsonb_build_array(jsonb_build_object(
      'id','6ccccccc-cccc-4ccc-8ccc-ccccccccccc1','match_id','6ddddddd-dddd-4ddd-8ddd-ddddddddddd1',
      'set_no',1,'game_no',1,'point_no',1,'winner_side','A','scoring_context','normal_game',
      'created_at',clock_timestamp(),'voided_at',null
    )),true);

    committed := public.commit_tournament('6eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','61111111-1111-4111-8111-111111111111',1,s);
    if (committed->'event'->>'version')::integer <> 2
      or (committed->'event'->>'tiebreak_target')::integer <> 9
      or not exists(select 1 from public.events where id='6eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1' and version=2 and status='ongoing')
      or not exists(select 1 from public.matches where id='6ddddddd-dddd-4ddd-8ddd-ddddddddddd1' and version=2 and status='ongoing')
      or not exists(select 1 from public.point_logs where id='6ccccccc-cccc-4ccc-8ccc-ccccccccccc1' and voided_at is null)
      or jsonb_array_length(committed->'point_logs') <> 1
    then raise exception 'SCORING_POINT_PERSISTENCE_BAD'; end if;

    begin
      perform public.commit_tournament('6eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','61111111-1111-4111-8111-111111111111',1,committed);
    exception when others then
      if sqlerrm='VERSION_CONFLICT' then stale_blocked := true; else raise; end if;
    end;
    if not stale_blocked then raise exception 'SCORING_STALE_VERSION_NOT_BLOCKED'; end if;

    committed := jsonb_set(committed,'{point_logs}',jsonb_build_array((committed->'point_logs'->0) || jsonb_build_object('voided_at',clock_timestamp())),true);
    undone := public.commit_tournament('6eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','61111111-1111-4111-8111-111111111111',2,committed);

    if (undone->'event'->>'version')::integer <> 3
      or not exists(select 1 from public.events where id='6eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1' and version=3)
      or not exists(select 1 from public.point_logs where id='6ccccccc-cccc-4ccc-8ccc-ccccccccccc1' and voided_at is not null)
      or jsonb_array_length(undone->'point_logs') <> 1
      or (undone->'point_logs'->0->>'voided_at') is null
    then raise exception 'SCORING_UNDO_PERSISTENCE_BAD'; end if;

    perform set_config('it.scoring_persistence','ok',true);
  end
  \$\$;
  select current_setting('it.scoring_persistence',true);
  rollback;" | grep -E '^(ok|bad)$' | tail -n 1)"

assert_eq "$scoring_result" "ok" "scoring rules persist with legacy defaults; point/undo returns authoritative versioned Snapshot and rejects stale writes"

echo "Scoring persistence behavior passed."
