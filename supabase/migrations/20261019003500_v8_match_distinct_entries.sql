-- V8 P1: a participant must never be matched against the same entry.
-- A single NULL side is legitimate for an unfilled knockout bracket.
-- Validate existing rows on migration; do not silently grandfather malformed matches.
alter table public.matches
  add constraint v8_match_distinct_entries
  check (entry_a_id is null or entry_b_id is null or entry_a_id <> entry_b_id);
