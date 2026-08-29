-- Stable public-facing user code for MVP identity disambiguation.
-- This is intentionally separate from auth_user_id/profile.id and is safe to display.
create or replace function public.generate_profile_public_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := 'QD' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where public_code = candidate);
  end loop;
  return candidate;
end;
$$;

alter table public.profiles
  add column if not exists public_code text;

update public.profiles
set public_code = public.generate_profile_public_code()
where public_code is null;

alter table public.profiles
  alter column public_code set default public.generate_profile_public_code();

alter table public.profiles
  alter column public_code set not null;

create unique index if not exists profiles_public_code_uidx
  on public.profiles(public_code);

comment on column public.profiles.public_code is
  'Stable random public-facing 球搭子ID. Safe to display; not an authentication secret or database primary key.';
