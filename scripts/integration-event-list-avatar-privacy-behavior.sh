#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -Atc)

result="$("${PSQL[@]}" "begin;
  insert into auth.users(id,email)
  values ('51111111-1111-4111-8111-111111111111','it-hall-avatar-owner@example.invalid');
  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code)
  values ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','51111111-1111-4111-8111-111111111111','IT Hall Avatar Owner','https://example.invalid/hidden-avatar.png','completed','ITHALL51');
  insert into public.profile_preferences(profile_id,avatar_visible,level_visible,city_visible,play_times_visible,play_preference_visible,allow_event_invites,allow_doubles_invites,participant_album_visibility)
  values ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',false,true,true,true,true,true,true,'private');
  insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,tiebreak_trigger,fee_type,city,status,version)
  values ('5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT public hall avatar privacy','public','singles','knockout',1,'games_4',3,'free','Test City','signup',1);
  select case
    when exists (
      select 1
      from jsonb_array_elements(public.list_events(false,'{}'::jsonb)) item
      where item->>'id'='5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
        and item ? 'owner_avatar_url'
        and item->'owner_avatar_url'='null'::jsonb
    ) then 'ok' else 'bad' end;
  rollback;" | grep -E '^(ok|bad)$' | tail -n 1)"

if [ "$result" != "ok" ]; then
  echo "FAIL: public Hall list_events leaked owner avatar while avatar_visible=false"
  exit 1
fi

echo "PASS: public Hall list_events hides owner avatar when avatar_visible=false"
