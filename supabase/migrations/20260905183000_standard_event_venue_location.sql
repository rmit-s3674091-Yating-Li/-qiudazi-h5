alter table public.events add column if not exists venue_name text;
alter table public.events add column if not exists venue_address text;
alter table public.events add column if not exists venue_latitude double precision;
alter table public.events add column if not exists venue_longitude double precision;
alter table public.events add column if not exists venue_place_id text;
alter table public.events add column if not exists venue_provider text;

update public.events
set venue_name = nullif(trim(venue), '')
where venue_name is null and nullif(trim(venue), '') is not null;

alter table public.events drop constraint if exists events_venue_latitude_check;
alter table public.events add constraint events_venue_latitude_check check (venue_latitude is null or venue_latitude between -90 and 90);
alter table public.events drop constraint if exists events_venue_longitude_check;
alter table public.events add constraint events_venue_longitude_check check (venue_longitude is null or venue_longitude between -180 and 180);
alter table public.events drop constraint if exists events_venue_coordinate_pair_check;
alter table public.events add constraint events_venue_coordinate_pair_check check ((venue_latitude is null) = (venue_longitude is null));
alter table public.events drop constraint if exists events_venue_name_length_check;
alter table public.events add constraint events_venue_name_length_check check (venue_name is null or char_length(venue_name) <= 120);
alter table public.events drop constraint if exists events_venue_address_length_check;
alter table public.events add constraint events_venue_address_length_check check (venue_address is null or char_length(venue_address) <= 240);
alter table public.events drop constraint if exists events_venue_provider_length_check;
alter table public.events add constraint events_venue_provider_length_check check (venue_provider is null or char_length(venue_provider) <= 40);
alter table public.events drop constraint if exists events_venue_place_id_length_check;
alter table public.events add constraint events_venue_place_id_length_check check (venue_place_id is null or char_length(venue_place_id) <= 200);

create or replace function public.save_event(p_id uuid, p_config jsonb, p_version integer default null)
returns public.events
language plpgsql
security definer
set search_path=''
as $function$
declare
  me uuid:=public.current_profile_id();
  e public.events;
  old public.events;
  has_entries boolean;
  allowed text[]:=array['name','visibility','link_signup_enabled','match_type','format','best_of','scoring_type','custom_games_target','tiebreak_trigger','tiebreak_target','tiebreak_win_by_two','games_win_by_two','game_scoring','level','suggested_level_min','suggested_level_max','entry_limit','event_date','event_time','registration_deadline','city','venue','venue_name','venue_address','venue_latitude','venue_longitude','venue_place_id','venue_provider','fee_type','venue_fee_total','ball_fee_total','other_fee_total','fixed_fee_per_entry','group_count','qualifiers_per_group'];
  levels text[]:=array['≤2.0','2.5','3.0','3.5','4.0','≥4.5'];
  start_at timestamp;
begin
  if me is null or not exists(select 1 from public.profiles where id=me and profile_status='completed') then raise exception 'PROFILE_REQUIRED'; end if;
  if p_config-allowed!='{}'::jsonb then raise exception 'INVALID_FIELDS'; end if;
  e:=jsonb_populate_record(null::public.events,p_config);
  e.city:=nullif(trim(e.city),'');
  e.venue:=nullif(trim(e.venue),'');
  e.venue_name:=coalesce(nullif(trim(e.venue_name),''),e.venue);
  e.venue:=e.venue_name;
  e.venue_address:=nullif(trim(e.venue_address),'');
  e.venue_place_id:=nullif(trim(e.venue_place_id),'');
  e.venue_provider:=nullif(trim(e.venue_provider),'');
  if e.city is null then raise exception 'CITY_REQUIRED'; end if;
  if e.visibility not in ('public','private') then raise exception 'VISIBILITY'; end if;
  if e.game_scoring is null then e.game_scoring:='advantage'; end if;
  if e.game_scoring not in ('advantage','no_ad') then raise exception 'GAME_SCORING'; end if;
  if e.tiebreak_target is null then e.tiebreak_target:=7; end if;
  if e.tiebreak_target < 1 or e.tiebreak_target > 100 then raise exception 'TIEBREAK_TARGET'; end if;
  if e.tiebreak_win_by_two is null then e.tiebreak_win_by_two:=true; end if;
  if e.games_win_by_two is null then e.games_win_by_two:=true; end if;
  if char_length(coalesce(e.venue_name,'')) > 120 then raise exception 'VENUE'; end if;
  if char_length(coalesce(e.venue_address,'')) > 240 then raise exception 'VENUE_ADDRESS'; end if;
  if (e.venue_latitude is null) <> (e.venue_longitude is null) then raise exception 'VENUE_COORDINATES'; end if;
  if e.venue_latitude is not null and (e.venue_latitude < -90 or e.venue_latitude > 90 or e.venue_longitude < -180 or e.venue_longitude > 180) then raise exception 'VENUE_COORDINATES'; end if;
  if e.event_date is null or e.event_time is null then raise exception 'EVENT_TIME_REQUIRED'; end if;
  start_at:=e.event_date::timestamp+e.event_time;
  if e.registration_deadline is null then e.registration_deadline:=start_at-interval '2 hours'; end if;
  if e.registration_deadline>start_at-interval '2 hours' then raise exception 'DEADLINE_TOO_LATE'; end if;
  if e.registration_deadline<=(now() at time zone 'Asia/Shanghai') and p_id is null then raise exception 'DEADLINE_PAST'; end if;
  if e.suggested_level_min is not null and not e.suggested_level_min=any(levels) then raise exception 'INVALID_LEVEL'; end if;
  if e.suggested_level_max is not null and not e.suggested_level_max=any(levels) then raise exception 'INVALID_LEVEL'; end if;
  if e.suggested_level_min is not null and e.suggested_level_max is not null and array_position(levels,e.suggested_level_min)>array_position(levels,e.suggested_level_max) then raise exception 'INVALID_LEVEL_RANGE'; end if;
  e.level:=null;
  e.link_signup_enabled:=true;
  if p_id is not null then
    select * into old from public.events where id=p_id for update;
    if old.id is null or old.owner_user_id!=me then raise exception 'FORBIDDEN'; end if;
    if old.status not in ('signup','locked') or exists(select 1 from public.matches where event_id=p_id and status<>'not_started') then raise exception 'EVENT_EDIT_STARTED'; end if;
    if old.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
    has_entries:=exists(select 1 from public.entries where event_id=p_id and status!='withdrawn');
    if has_entries and (e.match_type!=old.match_type or e.format!=old.format or e.best_of!=old.best_of or e.scoring_type!=old.scoring_type or e.custom_games_target is distinct from old.custom_games_target or e.tiebreak_trigger is distinct from old.tiebreak_trigger or e.tiebreak_target is distinct from old.tiebreak_target or e.tiebreak_win_by_two is distinct from old.tiebreak_win_by_two or e.games_win_by_two is distinct from old.games_win_by_two or e.game_scoring is distinct from old.game_scoring or e.group_count is distinct from old.group_count or e.qualifiers_per_group is distinct from old.qualifiers_per_group) then raise exception 'EVENT_STRUCTURE_LOCKED'; end if;
    if old.status='locked' and (e.match_type!=old.match_type or e.format!=old.format or e.best_of!=old.best_of or e.scoring_type!=old.scoring_type or e.custom_games_target is distinct from old.custom_games_target or e.tiebreak_trigger is distinct from old.tiebreak_trigger or e.tiebreak_target is distinct from old.tiebreak_target or e.tiebreak_win_by_two is distinct from old.tiebreak_win_by_two or e.games_win_by_two is distinct from old.games_win_by_two or e.game_scoring is distinct from old.game_scoring or e.entry_limit is distinct from old.entry_limit or e.group_count is distinct from old.group_count or e.qualifiers_per_group is distinct from old.qualifiers_per_group) then raise exception 'EVENT_STRUCTURE_LOCKED'; end if;
    if e.entry_limit is not null and e.entry_limit<(select count(*) from public.entries where event_id=p_id and status='confirmed') then raise exception 'LIMIT_BELOW_ROSTER'; end if;
    update public.events set
      name=e.name,visibility=e.visibility,link_signup_enabled=true,match_type=e.match_type,format=e.format,best_of=e.best_of,
      scoring_type=e.scoring_type,custom_games_target=e.custom_games_target,tiebreak_trigger=e.tiebreak_trigger,tiebreak_target=e.tiebreak_target,
      tiebreak_win_by_two=e.tiebreak_win_by_two,games_win_by_two=e.games_win_by_two,game_scoring=e.game_scoring,level=null,
      suggested_level_min=e.suggested_level_min,suggested_level_max=e.suggested_level_max,entry_limit=e.entry_limit,event_date=e.event_date,
      event_time=e.event_time,registration_deadline=e.registration_deadline,city=e.city,venue=e.venue,venue_name=e.venue_name,venue_address=e.venue_address,
      venue_latitude=e.venue_latitude,venue_longitude=e.venue_longitude,venue_place_id=e.venue_place_id,venue_provider=e.venue_provider,
      fee_type=e.fee_type,venue_fee_total=e.venue_fee_total,ball_fee_total=e.ball_fee_total,other_fee_total=e.other_fee_total,
      fixed_fee_per_entry=e.fixed_fee_per_entry,group_count=e.group_count,qualifiers_per_group=e.qualifiers_per_group,version=version+1
    where id=p_id returning * into e;
  else
    insert into public.events(
      owner_user_id,name,visibility,link_signup_enabled,match_type,format,best_of,scoring_type,custom_games_target,tiebreak_trigger,tiebreak_target,
      tiebreak_win_by_two,games_win_by_two,game_scoring,level,suggested_level_min,suggested_level_max,entry_limit,event_date,event_time,registration_deadline,
      city,venue,venue_name,venue_address,venue_latitude,venue_longitude,venue_place_id,venue_provider,fee_type,venue_fee_total,ball_fee_total,
      other_fee_total,fixed_fee_per_entry,group_count,qualifiers_per_group
    ) values(
      me,e.name,e.visibility,true,e.match_type,e.format,e.best_of,e.scoring_type,e.custom_games_target,e.tiebreak_trigger,e.tiebreak_target,
      e.tiebreak_win_by_two,e.games_win_by_two,e.game_scoring,null,e.suggested_level_min,e.suggested_level_max,e.entry_limit,e.event_date,e.event_time,
      e.registration_deadline,e.city,e.venue,e.venue_name,e.venue_address,e.venue_latitude,e.venue_longitude,e.venue_place_id,e.venue_provider,e.fee_type,
      e.venue_fee_total,e.ball_fee_total,e.other_fee_total,e.fixed_fee_per_entry,e.group_count,e.qualifiers_per_group
    ) returning * into e;
  end if;
  return e;
end $function$;
