-- V7 test-only identity exchange support.
-- Canonical nickname comparison strategy for the current test phase:
-- 1) trim leading/trailing SQL whitespace via btrim;
-- 2) case-fold with PostgreSQL lower();
-- 3) preserve Unicode code points as entered (no NFKC/NFC compatibility folding in DB).
-- The database function/index are authoritative; clients may mirror only for UX.

create or replace function public.normalize_test_nickname(p_nickname text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(lower(btrim(coalesce(p_nickname, ''))), '');
$$;

-- Fail closed rather than silently choosing between pre-existing normalized duplicates.
do $$
begin
  if exists (
    select public.normalize_test_nickname(nickname)
    from public.profiles
    where public.normalize_test_nickname(nickname) is not null
    group by public.normalize_test_nickname(nickname)
    having count(*) > 1
  ) then
    raise exception 'NICKNAME_NORMALIZATION_CONFLICT';
  end if;
end $$;

create unique index if not exists profiles_test_nickname_normalized_uidx
  on public.profiles (public.normalize_test_nickname(nickname))
  where public.normalize_test_nickname(nickname) is not null;

comment on function public.normalize_test_nickname(text) is
  'V7 test-only nickname normalization authority: trim + PostgreSQL lower; Unicode normalization is intentionally not compatibility-folded.';
