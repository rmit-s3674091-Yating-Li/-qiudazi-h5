alter table public.events drop constraint events_status_check;
alter table public.events add constraint events_status_check check (status = any(array['signup'::text,'locked'::text,'ongoing'::text,'finished'::text,'cancelled'::text]));
alter table public.events add column if not exists cancelled_at timestamptz;

create or replace function public.cancel_event(p_id uuid, p_version integer)
returns public.events
language plpgsql
security definer
set search_path=''
as $function$
declare e public.events;
begin
  select * into e from public.events where id=p_id for update;
  if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then raise exception 'FORBIDDEN'; end if;
  if e.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
  if e.status not in ('signup','locked') then raise exception 'EVENT_CANCEL_STATE'; end if;
  if exists(select 1 from public.matches where event_id=p_id and status<>'not_started') then raise exception 'EVENT_CANCEL_STARTED'; end if;
  update public.events set status='cancelled', cancelled_at=now(), version=version+1 where id=p_id returning * into e;
  return e;
end $function$;
revoke all on function public.cancel_event(uuid,integer) from public;
grant execute on function public.cancel_event(uuid,integer) to authenticated;

create or replace function public.delete_event(p_id uuid, p_version integer)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare e public.events;
begin
 select * into e from public.events where id=p_id for update;
 if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then raise exception 'FORBIDDEN'; end if;
 if e.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 if e.status not in ('signup','locked') then raise exception 'EVENT_DELETE_STATE'; end if;
 if exists(select 1 from public.matches where event_id=p_id and status<>'not_started') then raise exception 'EVENT_DELETE_STARTED'; end if;
 if exists(select 1 from public.entries where event_id=p_id) then raise exception 'EVENT_HAS_HISTORY'; end if;
 delete from public.events where id=p_id;
end $function$;

create or replace function public.save_event(p_id uuid, p_config jsonb, p_version integer default null)
returns public.events
language plpgsql
security definer
set search_path=''
as $function$
declare me uuid:=public.current_profile_id(); e public.events; old public.events; has_entries boolean; allowed text[]:=array['name','visibility','link_signup_enabled','match_type','format','best_of','scoring_type','custom_games_target','tiebreak_trigger','level','suggested_level_min','suggested_level_max','entry_limit','event_date','event_time','registration_deadline','city','venue','fee_type','venue_fee_total','ball_fee_total','other_fee_total','fixed_fee_per_entry','group_count','qualifiers_per_group']; levels text[]:=array['≤2.0','2.5','3.0','3.5','4.0','≥4.5']; start_at timestamp;
begin
 if me is null or not exists(select 1 from public.profiles where id=me and profile_status='completed') then raise exception 'PROFILE_REQUIRED'; end if;
 if p_config-allowed!='{}'::jsonb then raise exception 'INVALID_FIELDS'; end if;
 e:=jsonb_populate_record(null::public.events,p_config); e.city:=nullif(trim(e.city),''); e.venue:=nullif(trim(e.venue),'');
 if e.city is null then raise exception 'CITY_REQUIRED'; end if;
 if e.visibility not in ('public','private') then raise exception 'VISIBILITY'; end if;
 if e.event_date is null or e.event_time is null then raise exception 'EVENT_TIME_REQUIRED'; end if;
 start_at:=e.event_date::timestamp+e.event_time;
 if e.registration_deadline is null then e.registration_deadline:=start_at-interval '2 hours'; end if;
 if e.registration_deadline>start_at-interval '2 hours' then raise exception 'DEADLINE_TOO_LATE'; end if;
 if e.registration_deadline<=(now() at time zone 'Asia/Shanghai') and p_id is null then raise exception 'DEADLINE_PAST'; end if;
 if e.suggested_level_min is not null and not e.suggested_level_min=any(levels) then raise exception 'INVALID_LEVEL'; end if;
 if e.suggested_level_max is not null and not e.suggested_level_max=any(levels) then raise exception 'INVALID_LEVEL'; end if;
 if e.suggested_level_min is not null and e.suggested_level_max is not null and array_position(levels,e.suggested_level_min)>array_position(levels,e.suggested_level_max) then raise exception 'INVALID_LEVEL_RANGE'; end if;
 e.level:=null; e.link_signup_enabled:=true;
 if p_id is not null then
   select * into old from public.events where id=p_id for update;
   if old.id is null or old.owner_user_id!=me then raise exception 'FORBIDDEN'; end if;
   if old.status not in ('signup','locked') or exists(select 1 from public.matches where event_id=p_id and status<>'not_started') then raise exception 'EVENT_EDIT_STARTED'; end if;
   if old.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
   has_entries:=exists(select 1 from public.entries where event_id=p_id and status!='withdrawn');
   if has_entries and (e.match_type!=old.match_type or e.format!=old.format or e.best_of!=old.best_of or e.scoring_type!=old.scoring_type or e.custom_games_target is distinct from old.custom_games_target or e.tiebreak_trigger is distinct from old.tiebreak_trigger or e.group_count is distinct from old.group_count or e.qualifiers_per_group is distinct from old.qualifiers_per_group) then raise exception 'EVENT_STRUCTURE_LOCKED'; end if;
   if old.status='locked' and (e.match_type!=old.match_type or e.format!=old.format or e.best_of!=old.best_of or e.scoring_type!=old.scoring_type or e.custom_games_target is distinct from old.custom_games_target or e.tiebreak_trigger is distinct from old.tiebreak_trigger or e.entry_limit is distinct from old.entry_limit or e.group_count is distinct from old.group_count or e.qualifiers_per_group is distinct from old.qualifiers_per_group) then raise exception 'EVENT_STRUCTURE_LOCKED'; end if;
   if e.entry_limit is not null and e.entry_limit<(select count(*) from public.entries where event_id=p_id and status='confirmed') then raise exception 'LIMIT_BELOW_ROSTER'; end if;
   update public.events set name=e.name,visibility=e.visibility,link_signup_enabled=true,match_type=e.match_type,format=e.format,best_of=e.best_of,scoring_type=e.scoring_type,custom_games_target=e.custom_games_target,tiebreak_trigger=e.tiebreak_trigger,level=null,suggested_level_min=e.suggested_level_min,suggested_level_max=e.suggested_level_max,entry_limit=e.entry_limit,event_date=e.event_date,event_time=e.event_time,registration_deadline=e.registration_deadline,city=e.city,venue=e.venue,fee_type=e.fee_type,venue_fee_total=e.venue_fee_total,ball_fee_total=e.ball_fee_total,other_fee_total=e.other_fee_total,fixed_fee_per_entry=e.fixed_fee_per_entry,group_count=e.group_count,qualifiers_per_group=e.qualifiers_per_group,version=version+1 where id=p_id returning * into e;
 else
   insert into public.events(owner_user_id,name,visibility,link_signup_enabled,match_type,format,best_of,scoring_type,custom_games_target,tiebreak_trigger,level,suggested_level_min,suggested_level_max,entry_limit,event_date,event_time,registration_deadline,city,venue,fee_type,venue_fee_total,ball_fee_total,other_fee_total,fixed_fee_per_entry,group_count,qualifiers_per_group) values(me,e.name,e.visibility,true,e.match_type,e.format,e.best_of,e.scoring_type,e.custom_games_target,e.tiebreak_trigger,null,e.suggested_level_min,e.suggested_level_max,e.entry_limit,e.event_date,e.event_time,e.registration_deadline,e.city,e.venue,e.fee_type,e.venue_fee_total,e.ball_fee_total,e.other_fee_total,e.fixed_fee_per_entry,e.group_count,e.qualifiers_per_group) returning * into e;
 end if;
 return e;
end $function$;