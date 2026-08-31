-- Initial schema baseline reconstructed from the live test project so the
-- repository migration chain can be replayed on a fresh Supabase database.
-- This migration is intentionally idempotent and contains only objects that
-- pre-date the incremental migrations that follow it.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  nickname text,
  avatar_url text,
  profile_status text not null default 'pending' check (profile_status in ('pending','completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id),
  linked_user_id uuid unique references public.profiles(id),
  name text not null,
  avatar_url text,
  player_type text not null check (player_type in ('self','manual')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  level text,
  city text,
  play_times text[] not null default '{}'::text[],
  play_preference text,
  check (length(trim(name)) between 1 and 40)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id),
  name text not null,
  visibility text not null check (visibility in ('public','private')),
  link_signup_enabled boolean not null default false,
  match_type text not null check (match_type in ('singles','doubles')),
  format text not null check (format in ('round_robin','knockout','group_knockout')),
  best_of integer not null check (best_of in (1,3,5)),
  scoring_type text not null,
  custom_games_target integer,
  tiebreak_trigger integer,
  level text,
  entry_limit integer,
  event_date date,
  event_time time,
  venue text,
  fee_type text not null,
  venue_fee_total numeric,
  ball_fee_total numeric,
  other_fee_total numeric,
  fixed_fee_per_entry numeric,
  group_count integer,
  qualifiers_per_group integer,
  status text not null default 'signup' check (status in ('signup','locked','ongoing','finished')),
  version integer not null default 1,
  draw_generated boolean not null default false,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (length(trim(name)) between 1 and 80)
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  entry_type text not null check (entry_type in ('singles','doubles')),
  team_name text,
  signup_user_id uuid references public.profiles(id),
  status text not null check (status in ('confirmed','waitlist','withdrawn')),
  waitlist_order integer,
  joined_at timestamptz not null default clock_timestamp(),
  group_no integer,
  unique(event_id,id)
);

create table if not exists public.entry_players (
  entry_id uuid not null references public.entries(id),
  player_id uuid not null references public.players(id),
  event_id uuid not null,
  slot integer not null check (slot in (1,2)),
  active boolean not null default true,
  primary key(entry_id,slot),
  unique(entry_id,player_id),
  foreign key(event_id,entry_id) references public.entries(event_id,id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  stage text not null check (stage in ('round_robin','group','knockout')),
  group_no integer,
  round_no integer not null check (round_no >= 1),
  bracket_position integer,
  entry_a_id uuid,
  entry_b_id uuid,
  status text not null check (status in ('not_started','ongoing','finished')),
  winner_entry_id uuid references public.entries(id),
  is_bye boolean not null default false,
  next_match_id uuid,
  next_slot text,
  version integer not null default 1,
  scoring_mode text,
  created_at timestamptz not null default now(),
  unique(event_id,id),
  foreign key(event_id,entry_a_id) references public.entries(event_id,id),
  foreign key(event_id,entry_b_id) references public.entries(event_id,id)
);

alter table public.matches
  drop constraint if exists matches_event_id_next_match_id_fkey;
alter table public.matches
  add constraint matches_event_id_next_match_id_fkey
  foreign key(event_id,next_match_id) references public.matches(event_id,id)
  deferrable initially deferred;

create table if not exists public.set_scores (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  set_no integer not null,
  a_games_or_points integer not null,
  b_games_or_points integer not null,
  a_tiebreak_points integer,
  b_tiebreak_points integer,
  winner_entry_id uuid not null references public.entries(id),
  unique(match_id,set_no)
);

create table if not exists public.point_logs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  set_no integer not null,
  game_no integer not null,
  point_no integer not null,
  winner_side text not null check (winner_side in ('A','B')),
  scoring_context text not null check (scoring_context in ('normal_game','tiebreak','point_set')),
  created_at timestamptz not null default clock_timestamp(),
  voided_at timestamptz,
  unique(match_id,point_no)
);

create table if not exists public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id),
  original_url text not null,
  watermarked_url text not null,
  uploaded_at timestamptz not null default now(),
  version integer not null default 1
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  addressee_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_user_id <> addressee_user_id)
);

create table if not exists public.event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  invitee_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  invite_kind text not null default 'event',
  check (inviter_user_id <> invitee_user_id)
);

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_event_owner(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.events e
    where e.id=p_event_id and e.owner_user_id=public.current_profile_id()
  );
$$;

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.events enable row level security;
alter table public.entries enable row level security;
alter table public.entry_players enable row level security;
alter table public.matches enable row level security;
alter table public.set_scores enable row level security;
alter table public.point_logs enable row level security;
alter table public.event_photos enable row level security;
alter table public.connections enable row level security;
alter table public.event_invites enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
  using (auth_user_id = auth.uid());
create policy players_owner_read on public.players for select to authenticated
  using (owner_user_id = public.current_profile_id());
create policy events_public_or_owner_read on public.events for select to anon, authenticated
  using (visibility='public' or owner_user_id=public.current_profile_id());
create policy entries_owner_read on public.entries for select to authenticated
  using (public.is_event_owner(event_id) or signup_user_id=public.current_profile_id());
create policy entry_players_owner_read on public.entry_players for select to authenticated
  using (public.is_event_owner(event_id));
create policy matches_owner_read on public.matches for select to authenticated
  using (public.is_event_owner(event_id));
create policy sets_owner_read on public.set_scores for select to authenticated
  using (exists(select 1 from public.matches m where m.id=set_scores.match_id and public.is_event_owner(m.event_id)));
create policy logs_owner_read on public.point_logs for select to authenticated
  using (exists(select 1 from public.matches m where m.id=point_logs.match_id and public.is_event_owner(m.event_id)));
create policy photos_owner_read on public.event_photos for select to authenticated
  using (public.is_event_owner(event_id));
create policy connections_participant_select on public.connections for select to authenticated
  using (requester_user_id=public.current_profile_id() or addressee_user_id=public.current_profile_id());
create policy event_invites_participant_select on public.event_invites for select to authenticated
  using (inviter_user_id=public.current_profile_id() or invitee_user_id=public.current_profile_id());
