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
  select r.id into actor
  from public.resolve_profile_for_auth_user(p_actor_auth_user_id) r
  where r.profile_status='completed'
  limit 1;

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

create or replace function public.create_quick_event(p_config jsonb, p_entries jsonb)
returns public.events
language plpgsql
security definer
set search_path=''
as $fn$
declare
  me uuid:=public.current_profile_id();
  e public.events;
  raw_entry jsonb;
  player_ids uuid[];
  player_id uuid;
  entry_row public.entries;
  expected integer;
  entry_count integer;
  seen uuid[]:=array[]::uuid[];
  fmt text:=coalesce(nullif(p_config->>'format',''),'round_robin');
  scoring text:=coalesce(nullif(p_config->>'scoring_type',''),'games_6');
  match_type text:=coalesce(nullif(p_config->>'match_type',''),'singles');
  city_text text:=nullif(trim(p_config->>'city'),'');
  venue_text text:=nullif(trim(p_config->>'venue'),'');
  event_name text:=nullif(trim(p_config->>'name'),'');
  event_day date:=coalesce(nullif(p_config->>'event_date','')::date,(now() at time zone 'Asia/Shanghai')::date);
  event_clock time:=coalesce(nullif(p_config->>'event_time','')::time,(now() at time zone 'Asia/Shanghai')::time(0));
begin
  if me is null or not exists(select 1 from public.profiles where id=me and profile_status='completed') then raise exception 'PROFILE_REQUIRED'; end if;
  if city_text is null then raise exception 'CITY_REQUIRED'; end if;
  if match_type not in ('singles','doubles') then raise exception 'MATCH_TYPE'; end if;
  if fmt not in ('round_robin','knockout') then raise exception 'FORMAT'; end if;
  if scoring not in ('games_4','games_6','tiebreak_7','points_11','points_15') then raise exception 'SCORING'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'ENTRY_SIZE'; end if;
  entry_count:=jsonb_array_length(p_entries);
  if entry_count<2 then raise exception 'TOO_FEW_ENTRIES'; end if;
  expected:=case when match_type='doubles' then 2 else 1 end;
  for raw_entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(raw_entry) is distinct from 'array' or jsonb_array_length(raw_entry)<>expected then raise exception 'ENTRY_SIZE'; end if;
    select array_agg(value::uuid order by ordinality) into player_ids from jsonb_array_elements_text(raw_entry) with ordinality;
    foreach player_id in array player_ids loop
      if player_id=any(seen) then raise exception 'DUPLICATE_PLAYER'; end if;
      if not exists(
        select 1 from public.players p
        where p.id=player_id and (
          (p.owner_user_id=me and (p.player_type='self' or (p.player_type='manual' and p.linked_user_id is null)))
          or (p.owner_user_id<>me and p.player_type='self' and p.linked_user_id=p.owner_user_id and exists(
            select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me and c.addressee_user_id=p.owner_user_id) or (c.addressee_user_id=me and c.requester_user_id=p.owner_user_id))
          ))
        )
      ) then raise exception 'PLAYER_FORBIDDEN'; end if;
      seen:=array_append(seen,player_id);
    end loop;
  end loop;
  if event_name is null then event_name:=to_char(event_day,'MM月DD日') || case when match_type='doubles' then ' 快速双打' else ' 快速单打' end; end if;
  insert into public.events(owner_user_id,name,visibility,link_signup_enabled,match_type,format,best_of,scoring_type,custom_games_target,tiebreak_trigger,level,suggested_level_min,suggested_level_max,entry_limit,event_date,event_time,registration_deadline,city,venue,fee_type,venue_fee_total,ball_fee_total,other_fee_total,fixed_fee_per_entry,group_count,qualifiers_per_group,status,event_mode)
  values(me,event_name,'public',false,match_type,fmt,1,scoring,null,case when scoring='games_4' then 4 when scoring='games_6' then 6 else null end,null,null,null,entry_count,event_day,event_clock,null,city_text,venue_text,'free',null,null,null,null,null,null,'locked','quick') returning * into e;
  for raw_entry in select value from jsonb_array_elements(p_entries) loop
    select array_agg(value::uuid order by ordinality) into player_ids from jsonb_array_elements_text(raw_entry) with ordinality;
    insert into public.entries(event_id,entry_type,team_name,signup_user_id,status,waitlist_order)
    values(e.id,match_type,null,null,'confirmed',null) returning * into entry_row;
    insert into public.entry_players(entry_id,event_id,player_id,slot)
    select entry_row.id,e.id,x.id,x.slot::integer from unnest(player_ids) with ordinality as x(id,slot);
  end loop;
  return e;
end $fn$;

create or replace function public.list_events(p_mine boolean default false, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare result jsonb;
begin
  if p_mine and public.current_profile_id() is null then raise exception 'AUTH_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result
  from(
    select e.id,e.name,e.event_mode,
      case when p_mine or e.visibility='public' then e.owner_user_id else null end owner_user_id,
      case when e.status='signup' and not public.event_registration_open(e) then 'locked' else e.status end status,
      e.visibility,e.match_type,e.format,e.suggested_level_min,e.suggested_level_max,e.city,
      case when p_mine or e.visibility='public' then e.event_date else null end event_date,
      case when p_mine or e.visibility='public' then e.event_time else null end event_time,
      case when p_mine or e.visibility='public' then e.registration_deadline else null end registration_deadline,
      case when p_mine or e.visibility='public' then e.venue else null end venue,
      case when p_mine or e.visibility='public' then e.best_of else null end best_of,
      case when p_mine or e.visibility='public' then e.entry_limit else null end entry_limit,
      case when p_mine or e.visibility='public' then e.fee_type else null end fee_type,
      case when p_mine or e.visibility='public' then e.fixed_fee_per_entry else null end fixed_fee_per_entry,
      case when p_mine or e.visibility='public' then e.venue_fee_total else null end venue_fee_total,
      case when p_mine or e.visibility='public' then e.ball_fee_total else null end ball_fee_total,
      case when p_mine or e.visibility='public' then e.other_fee_total else null end other_fee_total,
      case when p_mine or e.visibility='public' then owner.nickname else null end owner_nickname,
      case when p_mine or e.visibility='public' then owner.avatar_url else null end owner_avatar_url,
      case when p_mine or e.visibility='public' then(select count(*) from public.entries en where en.event_id=e.id and en.status='confirmed') else null end confirmed_count,
      case when p_mine or e.visibility='public' then(select count(*) from public.entries en where en.event_id=e.id and en.status='waitlist') else null end waitlist_count
    from public.events e join public.profiles owner on owner.id=e.owner_user_id
    where(
      case when p_mine then
        case when p_filters->>'scope'='joined' then exists(select 1 from public.entries own_entry join public.entry_players ep on ep.entry_id=own_entry.id and ep.active join public.players p on p.id=ep.player_id where own_entry.event_id=e.id and own_entry.status!='withdrawn' and p.linked_user_id=public.current_profile_id())
        else e.owner_user_id=public.current_profile_id() end
      else e.status!='finished' and coalesce(e.event_mode,'standard') in ('standard','quick') and e.visibility='public' end
    )
    and (p_mine or not (e.name like 'QA %' and coalesce(owner.nickname,'') like 'QA%'))
    and(coalesce(p_filters->>'match_type','')='' or e.match_type=p_filters->>'match_type')
    and(coalesce(p_filters->>'level','')='' or (public.qiudazi_level_rank(p_filters->>'level') is not null and (e.suggested_level_min is null or public.qiudazi_level_rank(e.suggested_level_min)<=public.qiudazi_level_rank(p_filters->>'level')) and (e.suggested_level_max is null or public.qiudazi_level_rank(e.suggested_level_max)>=public.qiudazi_level_rank(p_filters->>'level'))))
    and(coalesce(p_filters->>'event_date','')='' or(e.visibility='public' and e.event_date::text=p_filters->>'event_date'))
    and(coalesce(p_filters->>'status','')='' or(case when e.status='signup' and not public.event_registration_open(e) then 'locked' else e.status end)=p_filters->>'status')
    order by e.event_date asc nulls last,e.created_at desc,e.id limit 200
  ) t;
  return result;
end $function$;