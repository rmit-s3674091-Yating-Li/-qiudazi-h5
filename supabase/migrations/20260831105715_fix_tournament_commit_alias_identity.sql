create or replace function public.commit_tournament(p_event_id uuid, p_actor_auth_user_id uuid, p_expected_version integer, p_snapshot jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  e public.events;
  actor uuid;
  next_state text;
  item jsonb;
  v_match public.matches;
  v_next_version integer;
begin
  select coalesce(
    (select p.id from public.profiles p where p.auth_user_id=p_actor_auth_user_id and p.profile_status='completed' limit 1),
    (select a.profile_id from private.profile_auth_aliases a join public.profiles p on p.id=a.profile_id where a.auth_user_id=p_actor_auth_user_id and p.profile_status='completed' limit 1)
  ) into actor;
  select * into e from public.events where id=p_event_id for update;
  if actor is null or e.id is null or e.owner_user_id!=actor then raise exception 'FORBIDDEN'; end if;
  if e.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if e.status='finished' then raise exception 'EVENT_FINISHED'; end if;
  if (p_snapshot->'event'->>'id')::uuid is distinct from p_event_id or (p_snapshot->'event'->>'owner_user_id')::uuid is distinct from actor then raise exception 'INVALID_SNAPSHOT'; end if;
  next_state:=p_snapshot->'event'->>'status';
  if not ((e.status='locked' and next_state in ('signup','locked','ongoing')) or (e.status='ongoing' and next_state in ('ongoing','finished'))) then raise exception 'INVALID_TRANSITION'; end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'matches') x where (x->>'event_id')::uuid is distinct from p_event_id) then raise exception 'INVALID_SNAPSHOT'; end if;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'matches') x join public.matches prior on prior.id=(x->>'id')::uuid where prior.event_id!=p_event_id) then raise exception 'INVALID_SNAPSHOT'; end if;
  delete from public.matches old where old.event_id=p_event_id and not exists(select 1 from jsonb_array_elements(p_snapshot->'matches') x where (x->>'id')::uuid=old.id);
  for item in select * from jsonb_array_elements(p_snapshot->'matches') loop
    v_match:=jsonb_populate_record(null::public.matches,item);
    insert into public.matches select v_match.* on conflict(id) do update set entry_a_id=excluded.entry_a_id,entry_b_id=excluded.entry_b_id,status=excluded.status,winner_entry_id=excluded.winner_entry_id,is_bye=excluded.is_bye,next_match_id=excluded.next_match_id,next_slot=excluded.next_slot,version=excluded.version,scoring_mode=excluded.scoring_mode;
  end loop;
  for item in select * from jsonb_array_elements(p_snapshot->'entries') loop
    update public.entries set group_no=(item->>'group_no')::integer where id=(item->>'id')::uuid and event_id=p_event_id;
  end loop;
  delete from public.set_scores old where exists(select 1 from public.matches m where m.id=old.match_id and m.event_id=p_event_id);
  if exists(select 1 from jsonb_array_elements(p_snapshot->'set_scores') x where not exists(select 1 from public.matches m where m.id=(x->>'match_id')::uuid and m.event_id=p_event_id)) then raise exception 'INVALID_SNAPSHOT'; end if;
  insert into public.set_scores select r.* from jsonb_populate_recordset(null::public.set_scores,p_snapshot->'set_scores') r;
  if exists(select 1 from jsonb_array_elements(p_snapshot->'point_logs') x where not exists(select 1 from public.matches m where m.id=(x->>'match_id')::uuid and m.event_id=p_event_id)) then raise exception 'INVALID_SNAPSHOT'; end if;
  insert into public.point_logs select r.* from jsonb_populate_recordset(null::public.point_logs,p_snapshot->'point_logs') r on conflict(id) do update set voided_at=excluded.voided_at;
  update public.events
  set status=next_state,
      draw_generated=(p_snapshot->'event'->>'draw_generated')::boolean,
      finished_at=(p_snapshot->'event'->>'finished_at')::timestamptz,
      version=version+1
  where id=p_event_id
  returning version into v_next_version;
  return jsonb_set(p_snapshot, '{event,version}', to_jsonb(v_next_version), true);
end;
$function$;
