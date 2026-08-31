-- Keep audit issue allocation monotonic even if the counter lags behind existing registry rows.
update audit_ops.issue_counters c
set last_value = greatest(c.last_value, x.max_sequence), updated_at = now()
from (
  select audit_date, coalesce(max(sequence_no), 0) as max_sequence
  from audit_ops.issue_registry
  group by audit_date
) x
where x.audit_date = c.audit_date
  and c.last_value < x.max_sequence;

create or replace function audit_ops.create_issue(
  p_semantic_key text,
  p_source text,
  p_severity text,
  p_module text,
  p_summary text,
  p_details text default null,
  p_evidence text default null,
  p_affected_head text default null,
  p_audit_date date default ((now() at time zone 'Asia/Shanghai'))::date
)
returns table(audit_id text, created boolean)
language plpgsql
set search_path to ''
as $function$
declare
  v_existing audit_ops.issue_registry%rowtype;
  v_counter integer;
  v_registry_max integer;
  v_next integer;
  v_id text;
begin
  if p_semantic_key is null or btrim(p_semantic_key) = '' then raise exception 'semantic_key_required'; end if;
  if p_source is null or btrim(p_source) = '' then raise exception 'source_required'; end if;
  if p_summary is null or btrim(p_summary) = '' then raise exception 'summary_required'; end if;
  if p_severity not in ('P0','P1','P2') then raise exception 'invalid_severity'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qiudazi-audit-id:' || p_audit_date::text, 0)
  );

  select * into v_existing
  from audit_ops.issue_registry r
  where r.audit_date = p_audit_date and r.semantic_key = p_semantic_key;
  if found then
    return query select v_existing.audit_id, false;
    return;
  end if;

  insert into audit_ops.issue_counters(audit_date,last_value)
  values (p_audit_date,0)
  on conflict (audit_date) do nothing;

  select last_value into v_counter
  from audit_ops.issue_counters
  where audit_date = p_audit_date
  for update;

  select coalesce(max(sequence_no),0) into v_registry_max
  from audit_ops.issue_registry
  where audit_date = p_audit_date;

  v_next := greatest(coalesce(v_counter,0), coalesce(v_registry_max,0)) + 1;
  update audit_ops.issue_counters
  set last_value=v_next, updated_at=now()
  where audit_date=p_audit_date;

  v_id := 'AUD-' || to_char(p_audit_date,'YYYYMMDD') || '-' || lpad(v_next::text,3,'0');

  insert into audit_ops.issue_registry(
    audit_id,audit_date,sequence_no,semantic_key,source,summary,severity,status,module,details,evidence,affected_head,updated_at
  ) values (
    v_id,p_audit_date,v_next,p_semantic_key,p_source,p_summary,p_severity,'OPEN',p_module,p_details,p_evidence,p_affected_head,now()
  );

  return query select v_id, true;
end;
$function$;

-- commit_tournament is executed with a service-role client by the Edge Function.
-- Returning through get_event_snapshot() re-enters viewer visibility logic without the
-- original user's request context, which can make a valid private/quick event appear
-- missing and roll back an otherwise valid transaction. Return the committed snapshot
-- directly, with the authoritative incremented event version, instead.
create or replace function public.commit_tournament(
  p_event_id uuid,
  p_actor_auth_user_id uuid,
  p_expected_version integer,
  p_snapshot jsonb
)
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
  select id into actor from public.profiles where auth_user_id=p_actor_auth_user_id and profile_status='completed';
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
