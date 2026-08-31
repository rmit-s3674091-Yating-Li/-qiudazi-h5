alter table public.events add column if not exists event_mode text not null default 'standard';
alter table public.events drop constraint if exists events_event_mode_check;
alter table public.events add constraint events_event_mode_check check (event_mode in ('standard','quick'));

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

  for raw_entry in select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(raw_entry) is distinct from 'array' or jsonb_array_length(raw_entry)<>expected then raise exception 'ENTRY_SIZE'; end if;
    select array_agg(value::uuid order by ordinality) into player_ids from jsonb_array_elements_text(raw_entry) with ordinality;
    foreach player_id in array player_ids loop
      if player_id=any(seen) then raise exception 'DUPLICATE_PLAYER'; end if;
      if not exists(select 1 from public.players p where p.id=player_id and p.owner_user_id=me) then raise exception 'PLAYER_FORBIDDEN'; end if;
      seen:=array_append(seen,player_id);
    end loop;
  end loop;

  if event_name is null then event_name:=to_char(event_day,'MM月DD日') || case when match_type='doubles' then ' 快速双打' else ' 快速单打' end; end if;

  insert into public.events(owner_user_id,name,visibility,link_signup_enabled,match_type,format,best_of,scoring_type,custom_games_target,tiebreak_trigger,level,suggested_level_min,suggested_level_max,entry_limit,event_date,event_time,registration_deadline,city,venue,fee_type,venue_fee_total,ball_fee_total,other_fee_total,fixed_fee_per_entry,group_count,qualifiers_per_group,status,event_mode)
  values(me,event_name,'private',false,match_type,fmt,1,scoring,null,case when scoring='games_4' then 4 when scoring='games_6' then 6 else null end,null,null,null,entry_count,event_day,event_clock,null,city_text,venue_text,'free',null,null,null,null,null,null,'locked','quick') returning * into e;

  for raw_entry in select value from jsonb_array_elements(p_entries)
  loop
    select array_agg(value::uuid order by ordinality) into player_ids from jsonb_array_elements_text(raw_entry) with ordinality;
    insert into public.entries(event_id,entry_type,team_name,signup_user_id,status,waitlist_order)
    values(e.id,match_type,null,null,'confirmed',null) returning * into entry_row;
    insert into public.entry_players(entry_id,event_id,player_id,slot)
    select entry_row.id,e.id,x.id,x.slot::integer from unnest(player_ids) with ordinality as x(id,slot);
  end loop;
  return e;
end $fn$;

revoke all on function public.create_quick_event(jsonb,jsonb) from public, anon;
grant execute on function public.create_quick_event(jsonb,jsonb) to authenticated, service_role;
