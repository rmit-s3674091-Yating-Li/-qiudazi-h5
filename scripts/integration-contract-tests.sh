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

assert_ge() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [ "$actual" -lt "$expected" ]; then
    echo "FAIL: $label (expected >= $expected actual=$actual)"
    exit 1
  fi
  echo "PASS: $label"
}

echo "== Integration contract tests =="

# Schema / enum / defaults
assert_eq "$("${PSQL[@]}" "select count(*) from information_schema.columns where table_schema='public' and table_name='events' and column_name='event_mode' and column_default='''standard''::text';")" "1" "events.event_mode default standard"
assert_eq "$("${PSQL[@]}" "select count(*) from information_schema.columns where table_schema='public' and table_name='events' and column_name='game_scoring' and column_default='''advantage''::text' and is_nullable='NO';")" "1" "events.game_scoring default advantage"
assert_ge "$("${PSQL[@]}" "select count(*) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='events' and pg_get_constraintdef(con.oid) like '%game_scoring%' and pg_get_constraintdef(con.oid) like '%advantage%' and pg_get_constraintdef(con.oid) like '%no_ad%';")" "1" "game_scoring constraint contains advantage/no_ad"
assert_ge "$("${PSQL[@]}" "select count(*) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='events' and pg_get_constraintdef(con.oid) like '%cancelled%';")" "1" "event status constraint contains cancelled"

# Lifecycle RPC surface
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cancel_event';")" "1" "cancel_event RPC exists"
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_event';")" "1" "delete_event RPC exists"

# Photo / storage contracts
assert_eq "$("${PSQL[@]}" "select count(*) from storage.buckets where id='event-photos' and public=false;")" "1" "event-photos bucket is private"
assert_eq "$("${PSQL[@]}" "select count(*) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='participant_album_photos' and con.conname='participant_album_photos_source_event_photo_id_fkey' and pg_get_constraintdef(con.oid) like '%ON DELETE SET NULL%';")" "1" "personal album source FK is decoupled with SET NULL"
assert_eq "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_event_photo','remove_event_photo_from_event','set_my_event_album_visibility','list_my_event_photos');")" "0" "legacy photo RPC surface removed"
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_event_photos';")" "1" "list_event_photos RPC exists"

# Privacy contract: connection list must consult avatar privacy instead of returning raw avatar_url unconditionally.
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_connections' and position('avatar_visible' in pg_get_functiondef(p.oid))>0;")" "1" "list_connections consults avatar_visible"

# Behavioral privacy regression: an accepted partner whose avatar_visible=false must be returned with avatar_url=null.
privacy_result="$("${PSQL[@]}" "begin;
  select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code)
  values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111','IT requester',null,'active','ITREQ001'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','22222222-2222-4222-8222-222222222222','IT hidden','https://example.invalid/avatar.png','active','ITHID002');
  insert into public.profile_preferences(profile_id,avatar_visible,level_visible,city_visible,play_times_visible,play_preference_visible,allow_event_invites,allow_doubles_invites,participant_album_visibility)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',false,true,true,true,true,true,true,'private');
  insert into public.connections(id,requester_user_id,addressee_user_id,status,responded_at)
  values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','accepted',now());
  select case
    when jsonb_array_length(public.list_connections())=1
      and (public.list_connections()->0->>'id')='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
      and not (public.list_connections()->0 ? 'avatar_url') is false
      and public.list_connections()->0->'avatar_url'='null'::jsonb
    then 'ok' else 'bad' end;
  rollback;")"
assert_eq "$privacy_result" "ok" "list_connections behavior hides avatar when avatar_visible=false"

# Quick Start / identity contract
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_quick_event';")" "1" "create_quick_event RPC exists"
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_quick_start_players';")" "1" "list_quick_start_players RPC exists"

# Snapshot / scoring contract surface
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_event_snapshot';")" "1" "get_event_snapshot RPC exists"

# Security-definer sanity: public API functions under test should not silently disappear from final replay.
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef=true and p.proname in ('cancel_event','delete_event','create_quick_event','list_event_photos','list_connections');")" "3" "critical RPC security-definer surface present"

echo "Integration contract tests passed."
