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

echo "== Standard venue save_event behavior =="

result="$("${PSQL[@]}" "
begin;
  insert into auth.users(id,email)
  values ('61111111-1111-4111-8111-111111111111','it-venue-owner@example.invalid');
  select set_config('request.jwt.claim.sub','61111111-1111-4111-8111-111111111111',true);
  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code)
  values ('6aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','61111111-1111-4111-8111-111111111111','IT venue owner',null,'completed','ITVENUE1');

  with created as (
    select * from public.save_event(
      null,
      jsonb_build_object(
        'name','IT venue create',
        'visibility','private',
        'link_signup_enabled',true,
        'match_type','singles',
        'format','knockout',
        'best_of',1,
        'scoring_type','games_4',
        'tiebreak_trigger',3,
        'game_scoring','advantage',
        'city','Shanghai',
        'venue','  Tennis Center  ',
        'venue_name','  Tennis Center  ',
        'venue_address','  1 Court Road  ',
        'venue_latitude',31.2304,
        'venue_longitude',121.4737,
        'venue_place_id','poi-123',
        'venue_provider','baidu',
        'event_date','2099-09-20',
        'event_time','10:00',
        'fee_type','free',
        'group_count',2,
        'qualifiers_per_group',2
      )
    )
  )
  select case
    when venue='Tennis Center'
      and venue_name='Tennis Center'
      and venue_address='1 Court Road'
      and venue_latitude=31.2304
      and venue_longitude=121.4737
      and venue_place_id='poi-123'
      and venue_provider='baidu'
      and version=1
    then 'create-ok:'||id::text
    else 'create-bad:'||id::text
  end
  from created;

  with target as (
    select id,version from public.events where name='IT venue create'
  ), edited as (
    select s.* from target t
    cross join lateral public.save_event(
      t.id,
      jsonb_build_object(
        'name','IT venue edited',
        'visibility','private',
        'link_signup_enabled',true,
        'match_type','singles',
        'format','knockout',
        'best_of',1,
        'scoring_type','games_4',
        'tiebreak_trigger',3,
        'game_scoring','advantage',
        'city','Shanghai',
        'venue','Edited Court',
        'venue_name','Edited Court',
        'venue_address','2 Court Road',
        'venue_latitude',31.2200,
        'venue_longitude',121.4800,
        'venue_place_id','poi-456',
        'venue_provider','baidu',
        'event_date','2099-09-20',
        'event_time','11:00',
        'fee_type','free',
        'group_count',2,
        'qualifiers_per_group',2
      ),
      t.version
    ) s
  )
  select case
    when venue='Edited Court'
      and venue_name='Edited Court'
      and venue_address='2 Court Road'
      and venue_latitude=31.22
      and venue_longitude=121.48
      and venue_place_id='poi-456'
      and venue_provider='baidu'
      and version=2
    then 'edit-ok'
    else 'edit-bad'
  end
  from edited;

  do \$\$
  declare
    pair_blocked boolean := false;
    latitude_blocked boolean := false;
    longitude_blocked boolean := false;
  begin
    begin
      perform public.save_event(
        null,
        jsonb_build_object(
          'name','IT venue invalid pair','visibility','private','link_signup_enabled',true,
          'match_type','singles','format','knockout','best_of',1,'scoring_type','games_4',
          'tiebreak_trigger',3,'game_scoring','advantage','city','Shanghai',
          'venue','Court','venue_latitude',31.2,'venue_longitude',null,
          'event_date','2099-09-20','event_time','12:00','fee_type','free',
          'group_count',2,'qualifiers_per_group',2
        )
      );
    exception when others then
      if sqlerrm='VENUE_COORDINATES' then pair_blocked := true; else raise; end if;
    end;

    begin
      perform public.save_event(
        null,
        jsonb_build_object(
          'name','IT venue bad latitude','visibility','private','link_signup_enabled',true,
          'match_type','singles','format','knockout','best_of',1,'scoring_type','games_4',
          'tiebreak_trigger',3,'game_scoring','advantage','city','Shanghai',
          'venue','Court','venue_latitude',91,'venue_longitude',121.5,
          'event_date','2099-09-20','event_time','12:00','fee_type','free',
          'group_count',2,'qualifiers_per_group',2
        )
      );
    exception when others then
      if sqlerrm='VENUE_COORDINATES' then latitude_blocked := true; else raise; end if;
    end;

    begin
      perform public.save_event(
        null,
        jsonb_build_object(
          'name','IT venue bad longitude','visibility','private','link_signup_enabled',true,
          'match_type','singles','format','knockout','best_of',1,'scoring_type','games_4',
          'tiebreak_trigger',3,'game_scoring','advantage','city','Shanghai',
          'venue','Court','venue_latitude',31.2,'venue_longitude',181,
          'event_date','2099-09-20','event_time','12:00','fee_type','free',
          'group_count',2,'qualifiers_per_group',2
        )
      );
    exception when others then
      if sqlerrm='VENUE_COORDINATES' then longitude_blocked := true; else raise; end if;
    end;

    perform set_config(
      'it.venue_validation',
      case when pair_blocked and latitude_blocked and longitude_blocked then 'validation-ok' else 'validation-bad' end,
      true
    );
  end
  \$\$;

  select current_setting('it.venue_validation',true);
rollback;
" | grep -E '^(create-(ok|bad):|edit-(ok|bad)|validation-(ok|bad))' | sed -E 's/^(create-(ok|bad)):.*/\1/' | tr '\n' ':' | sed 's/:$//')"

assert_eq "$result" "create-ok:edit-ok:validation-ok" "save_event creates/edits venue fields and rejects invalid coordinate pairs/ranges"

echo "Standard venue save_event behavior passed."
