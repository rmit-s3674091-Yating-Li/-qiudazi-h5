-- Stable public-facing user code for MVP identity disambiguation.
-- This is intentionally separate from auth_user_id/profile.id and is safe to display.
create sequence if not exists public.profile_public_code_seq start with 100001;

alter table public.profiles
  add column if not exists public_code text;

update public.profiles
set public_code = 'QD' || lpad(nextval('public.profile_public_code_seq')::text, 6, '0')
where public_code is null;

alter table public.profiles
  alter column public_code set default ('QD' || lpad(nextval('public.profile_public_code_seq')::text, 6, '0'));

alter table public.profiles
  alter column public_code set not null;

create unique index if not exists profiles_public_code_uidx
  on public.profiles(public_code);

comment on column public.profiles.public_code is
  'Stable public-facing 球搭子ID. Safe to display; not an authentication secret or database primary key.';
