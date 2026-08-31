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

# Quick Start / identity contract
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_quick_event';")" "1" "create_quick_event RPC exists"
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_quick_start_players';")" "1" "list_quick_start_players RPC exists"

# Snapshot / scoring contract surface
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_event_snapshot';")" "1" "get_event_snapshot RPC exists"

# Security-definer sanity: public API functions under test should not silently disappear from final replay.
assert_ge "$("${PSQL[@]}" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef=true and p.proname in ('cancel_event','delete_event','create_quick_event','list_event_photos','list_connections');")" "3" "critical RPC security-definer surface present"

echo "Integration contract tests passed."