-- V8 participant scoring: service-only, read-only match membership preflight.
-- This helper is NOT a transaction authorization boundary. The eventual scoring
-- write RPC must re-check membership while holding the relevant row locks.
create or replace function public.v8_active_match_participant(
  p_event_id uuid,
  p_match_id uuid,
  p_actor_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.events e
    join public.matches m on m.event_id = e.id and m.id = p_match_id
    join public.entries en on en.event_id = e.id
      and en.id in (m.entry_a_id, m.entry_b_id)
    join public.entry_players ep on ep.entry_id = en.id
      and ep.event_id = e.id and ep.active is true
    join public.players p on p.id = ep.player_id
    join public.resolve_profile_for_auth_user(p_actor_auth_user_id) actor
      on actor.id = p.linked_user_id
    where e.id = p_event_id
      and e.status = 'ongoing'
      and m.status <> 'finished'
      and m.is_bye is false
      and m.entry_a_id is not null
      and m.entry_b_id is not null
      and en.status = 'confirmed'
      and actor.profile_status = 'completed'
  );
$fn$;

-- SECURITY DEFINER functions otherwise inherit PUBLIC EXECUTE by default.
revoke all on function public.v8_active_match_participant(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.v8_active_match_participant(uuid,uuid,uuid)
  to service_role;
