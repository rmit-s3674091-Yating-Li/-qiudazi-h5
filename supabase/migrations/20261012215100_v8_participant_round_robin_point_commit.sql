-- V8 P1: atomic participant point commit for round-robin matches only.
-- The Edge layer must authenticate the JWT, derive actor_auth_user_id from it,
-- and compute p_snapshot with the shared TypeScript scoring engine. This RPC
-- is not a generic snapshot writer and is NEVER callable by browser roles.
create or replace function public.v8_commit_participant_round_robin_point(
  p_event_id uuid,
  p_match_id uuid,
  p_actor_auth_user_id uuid,
  p_expected_event_version integer,
  p_expected_match_version integer,
  p_operation_id uuid,
  p_side text,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $fn$
declare
  v_event public.events;
  v_match public.matches;
  v_actor uuid;
  v_existing public.point_logs;
  v_current jsonb;
  v_next_event jsonb;
  v_next_match jsonb;
  v_new_point jsonb;
  v_next_sets jsonb;
  v_old_other_matches jsonb;
  v_new_other_matches jsonb;
  v_old_other_sets jsonb;
  v_new_other_sets jsonb;
  v_wins_a integer;
  v_wins_b integer;
  v_needed integer;
  v_status text;
  v_next_event_status text;
  v_next_version integer;
begin
  if p_operation_id is null or p_side not in ('A','B') or p_snapshot is null then
    raise exception 'INVALID_POINT_COMMAND';
  end if;

  -- Event lock serializes this operation against organizer commit_tournament.
  select * into v_event from public.events where id=p_event_id for update;
  if v_event.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  select * into v_match from public.matches
    where id=p_match_id and event_id=p_event_id for update;
  if v_match.id is null then raise exception 'MATCH_NOT_FOUND'; end if;

  select r.id into v_actor
  from public.resolve_profile_for_auth_user(p_actor_auth_user_id) r
  where r.profile_status='completed' limit 1;
  if v_actor is null then raise exception 'NOT_MATCH_PARTICIPANT'; end if;

  -- Lock actual membership rows as well: signup_user_id is NOT eligibility.
  perform 1
  from public.entries en
  join public.entry_players ep on ep.entry_id=en.id and ep.event_id=p_event_id
  join public.players p on p.id=ep.player_id
  where en.event_id=p_event_id and en.status='confirmed'
    and en.id in (v_match.entry_a_id,v_match.entry_b_id)
    and ep.active is true and p.linked_user_id=v_actor
  for share of en,ep,p;
  if not found then raise exception 'NOT_MATCH_PARTICIPANT'; end if;

  -- Replay is checked under the event lock and must belong to this match/event.
  select * into v_existing from public.point_logs where id=p_operation_id;
  if found then
    if v_existing.match_id is distinct from p_match_id
      or v_existing.winner_side is distinct from p_side then
      raise exception 'OPERATION_CONFLICT';
    end if;
    v_current := public.get_event_snapshot(p_event_id);
    return jsonb_set(v_current,'{viewer_role}','"participant"'::jsonb,true);
  end if;

  if v_event.status <> 'ongoing' or v_event.format <> 'round_robin'
    or v_match.stage <> 'round_robin' or v_match.status='finished'
    or v_match.is_bye or v_match.entry_a_id is null or v_match.entry_b_id is null
    or v_match.scoring_mode='direct' then
    raise exception 'PARTICIPANT_POINT_NOT_ALLOWED';
  end if;
  if v_event.version is distinct from p_expected_event_version
    or v_match.version is distinct from p_expected_match_version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if jsonb_typeof(p_snapshot->'event') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'matches') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'entries') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'set_scores') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'point_logs') is distinct from 'array' then
    raise exception 'INVALID_POINT_SNAPSHOT';
  end if;

  v_current := public.get_event_snapshot(p_event_id);
  v_next_event := p_snapshot->'event';
  select x into v_next_match from jsonb_array_elements(p_snapshot->'matches') x
    where x->>'id'=p_match_id::text;
  select x into v_new_point from jsonb_array_elements(p_snapshot->'point_logs') x
    where x->>'id'=p_operation_id::text;
  if v_next_match is null or v_new_point is null
    or (select count(*) from jsonb_array_elements(p_snapshot->'matches') x where x->>'id'=p_match_id::text)<>1
    or (select count(*) from jsonb_array_elements(p_snapshot->'point_logs') x where x->>'id'=p_operation_id::text)<>1
    or (v_next_event->>'version')::integer <> v_event.version+1
    or (v_next_match->>'version')::integer <> v_match.version+1
    or v_next_event - 'version' - 'status' - 'finished_at'
       is distinct from to_jsonb(v_event) - 'version' - 'status' - 'finished_at'
    or v_next_match - 'version' - 'status' - 'winner_entry_id' - 'scoring_mode'
       is distinct from to_jsonb(v_match) - 'version' - 'status' - 'winner_entry_id' - 'scoring_mode'
    or p_snapshot->'entries' is distinct from v_current->'entries'
    or p_snapshot->'photo' is distinct from v_current->'photo' then
    raise exception 'INVALID_POINT_SNAPSHOT';
  end if;

  -- No unrelated match, set or point log may be changed by a participant.
  select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb)
    into v_old_other_matches from jsonb_array_elements(v_current->'matches') x
    where x->>'id'<>p_match_id::text;
  select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb)
    into v_new_other_matches from jsonb_array_elements(p_snapshot->'matches') x
    where x->>'id'<>p_match_id::text;
  select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb)
    into v_old_other_sets from jsonb_array_elements(v_current->'set_scores') x
    where x->>'match_id'<>p_match_id::text;
  select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb)
    into v_new_other_sets from jsonb_array_elements(p_snapshot->'set_scores') x
    where x->>'match_id'<>p_match_id::text;
  if v_old_other_matches is distinct from v_new_other_matches
    or v_old_other_sets is distinct from v_new_other_sets
    or jsonb_array_length(p_snapshot->'matches') <> jsonb_array_length(v_current->'matches')
    or jsonb_array_length(p_snapshot->'point_logs') <> jsonb_array_length(v_current->'point_logs')+1
    or exists (
      select 1 from jsonb_array_elements(v_current->'point_logs') old_log
      where not exists (select 1 from jsonb_array_elements(p_snapshot->'point_logs') new_log
                        where new_log=old_log)
    ) then
    raise exception 'INVALID_POINT_SNAPSHOT';
  end if;

  if v_new_point->>'match_id' is distinct from p_match_id::text
    or v_new_point->>'winner_side' is distinct from p_side
    or (v_new_point->>'point_no')::integer is distinct from
      coalesce((select max(point_no)+1 from public.point_logs where match_id=p_match_id),1)
    or coalesce((v_new_point->>'set_no')::integer,0) < 1
    or coalesce((v_new_point->>'game_no')::integer,0) < 1
    or coalesce(v_new_point->>'scoring_context','') not in ('normal_game','tiebreak','point_set')
    or v_new_point->>'created_at' is null
    or v_new_point->>'voided_at' is not null then
    raise exception 'INVALID_POINT_SNAPSHOT';
  end if;

  v_status := v_next_match->>'status';
  if v_next_match->>'scoring_mode' is distinct from 'live'
    or coalesce(v_status,'') not in ('ongoing','finished')
    or (v_status='ongoing' and v_next_match->>'winner_entry_id' is not null)
    or (v_status='finished' and (v_next_match->>'winner_entry_id')::uuid
       not in (v_match.entry_a_id,v_match.entry_b_id)) then
    raise exception 'INVALID_POINT_SNAPSHOT';
  end if;

  select coalesce(jsonb_agg(x order by (x->>'set_no')::integer),'[]'::jsonb)
    into v_next_sets from jsonb_array_elements(p_snapshot->'set_scores') x
    where x->>'match_id'=p_match_id::text;
  if jsonb_array_length(v_next_sets)>v_event.best_of or exists (
    select 1 from jsonb_array_elements(v_next_sets) x
    where coalesce((x->>'set_no')::integer,0) < 1
       or coalesce((x->>'set_no')::integer,0) > v_event.best_of
       or coalesce((x->>'a_games_or_points')::integer,-1) < 0
       or coalesce((x->>'b_games_or_points')::integer,-1) < 0
       or (x->>'winner_entry_id')::uuid not in (v_match.entry_a_id,v_match.entry_b_id)
       or (x->>'a_games_or_points')::integer=(x->>'b_games_or_points')::integer
       or ((x->>'a_games_or_points')::integer>(x->>'b_games_or_points')::integer)
          is distinct from ((x->>'winner_entry_id')::uuid=v_match.entry_a_id)
  ) then raise exception 'INVALID_POINT_SNAPSHOT'; end if;
  select count(*) filter(where x->>'winner_entry_id'=v_match.entry_a_id::text),
         count(*) filter(where x->>'winner_entry_id'=v_match.entry_b_id::text)
    into v_wins_a,v_wins_b from jsonb_array_elements(v_next_sets) x;
  v_needed := (v_event.best_of+1)/2;
  if (v_status='finished' and not (
        (v_wins_a>=v_needed and v_next_match->>'winner_entry_id'=v_match.entry_a_id::text)
        or (v_wins_b>=v_needed and v_next_match->>'winner_entry_id'=v_match.entry_b_id::text)
      ))
    or (v_status='ongoing' and greatest(v_wins_a,v_wins_b)>=v_needed) then
    raise exception 'INVALID_POINT_SNAPSHOT';
  end if;

  v_next_event_status := v_next_event->>'status';
  if v_next_event_status='finished' then
    if v_event.event_mode <> 'quick' or v_status <> 'finished'
      or v_next_event->>'finished_at' is null
      or (select count(*) from public.matches where event_id=p_event_id and not is_bye)<>1
    then raise exception 'INVALID_POINT_SNAPSHOT'; end if;
  elsif coalesce(v_next_event_status,'') <> 'ongoing'
    or v_next_event->>'finished_at' is distinct from to_jsonb(v_event)->>'finished_at' then
    raise exception 'INVALID_POINT_SNAPSHOT';
  end if;

  update public.matches set status=v_status,
    scoring_mode='live', winner_entry_id=(v_next_match->>'winner_entry_id')::uuid,
    version=version+1 where id=p_match_id;
  delete from public.set_scores where match_id=p_match_id;
  insert into public.set_scores
    select r.* from jsonb_populate_recordset(null::public.set_scores,v_next_sets) r;
  insert into public.point_logs
    select r.* from jsonb_populate_record(null::public.point_logs,v_new_point) r;
  update public.events set status=v_next_event_status,
    finished_at=(v_next_event->>'finished_at')::timestamptz,
    version=version+1 where id=p_event_id returning version into v_next_version;
  return jsonb_set(jsonb_set(p_snapshot,'{event,version}',to_jsonb(v_next_version),true),
    '{viewer_role}','"participant"'::jsonb,true);
end;
$fn$;

revoke all on function public.v8_commit_participant_round_robin_point(
  uuid,uuid,uuid,integer,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.v8_commit_participant_round_robin_point(
  uuid,uuid,uuid,integer,integer,uuid,text,jsonb) to service_role;
