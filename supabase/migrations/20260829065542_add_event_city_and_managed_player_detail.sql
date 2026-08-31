alter table public.events add column if not exists city text;

create or replace function public.save_event(p_id uuid, p_config jsonb, p_version integer default null)
returns public.events
language plpgsql
security definer
set search_path=''
as $$
declare
  me uuid:=public.current_profile_id();
  e public.events;
  old public.events;
  allowed text[]:=array['name','visibility','link_signup_enabled','match_type','format','best_of','scoring_type','custom_games_target','tiebreak_trigger','level','entry_limit','event_date','event_time','city','venue','fee_type','venue_fee_total','ball_fee_total','other_fee_total','fixed_fee_per_entry','group_count','qualifiers_per_group'];
begin
  if me is null or not exists(select 1 from public.profiles where id=me and profile_status='completed') then raise exception 'PROFILE_REQUIRED'; end if;
  if p_config-allowed!='{}'::jsonb then raise exception 'INVALID_FIELDS'; end if;
  e:=jsonb_populate_record(null::public.events,p_config);
  e.link_signup_enabled:=case when e.visibility='public' then true else coalesce(e.link_signup_enabled,false) end;
  e.city:=nullif(trim(e.city),'');
  e.venue:=nullif(trim(e.venue),'');
  if p_id is not null then
    select * into old from public.events where id=p_id for update;
    if old.id is null or old.owner_user_id!=me then raise exception 'FORBIDDEN'; end if;
    if old.status!='signup' then raise exception 'ROSTER_LOCKED'; end if;
    if old.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
    if exists(select 1 from public.entries where event_id=p_id and status!='withdrawn') and e.match_type!=old.match_type then raise exception 'ENTRY_TYPE_LOCKED'; end if;
    if e.entry_limit is not null and e.entry_limit<(select count(*) from public.entries where event_id=p_id and status='confirmed') then raise exception 'LIMIT_BELOW_ROSTER'; end if;
    update public.events set name=e.name,visibility=e.visibility,link_signup_enabled=e.link_signup_enabled,match_type=e.match_type,format=e.format,best_of=e.best_of,scoring_type=e.scoring_type,custom_games_target=e.custom_games_target,tiebreak_trigger=e.tiebreak_trigger,level=e.level,entry_limit=e.entry_limit,event_date=e.event_date,event_time=e.event_time,city=e.city,venue=e.venue,fee_type=e.fee_type,venue_fee_total=e.venue_fee_total,ball_fee_total=e.ball_fee_total,other_fee_total=e.other_fee_total,fixed_fee_per_entry=e.fixed_fee_per_entry,group_count=e.group_count,qualifiers_per_group=e.qualifiers_per_group,version=version+1 where id=p_id returning * into e;
    with queue as(select id,row_number() over(order by joined_at,id) as position from public.entries where event_id=p_id and status='waitlist')
    update public.entries target set status='confirmed',waitlist_order=null from queue q where target.id=q.id and q.position<=coalesce(e.entry_limit,2147483647)-(select count(*) from public.entries where event_id=p_id and status='confirmed');
    with queue as(select id,row_number() over(order by joined_at,id) as position from public.entries where event_id=p_id and status='waitlist')
    update public.entries target set waitlist_order=q.position from queue q where target.id=q.id;
  else
    insert into public.events(owner_user_id,name,visibility,link_signup_enabled,match_type,format,best_of,scoring_type,custom_games_target,tiebreak_trigger,level,entry_limit,event_date,event_time,city,venue,fee_type,venue_fee_total,ball_fee_total,other_fee_total,fixed_fee_per_entry,group_count,qualifiers_per_group)
    values(me,e.name,e.visibility,e.link_signup_enabled,e.match_type,e.format,e.best_of,e.scoring_type,e.custom_games_target,e.tiebreak_trigger,e.level,e.entry_limit,e.event_date,e.event_time,e.city,e.venue,e.fee_type,e.venue_fee_total,e.ball_fee_total,e.other_fee_total,e.fixed_fee_per_entry,e.group_count,e.qualifiers_per_group) returning * into e;
  end if;
  return e;
end $$;

create or replace function public.get_managed_player_profile(p_player_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
with me as (select public.current_profile_id() as id),
player as (
  select p.id as player_id,p.name,p.avatar_url,p.level,p.city,p.play_times,p.play_preference
  from public.players p, me
  where me.id is not null and p.id=p_player_id and p.owner_user_id=me.id and p.player_type='manual' and p.linked_user_id is null
),
my_entries as (
  select distinct e.id as entry_id
  from player p
  join public.entry_players ep on ep.player_id=p.player_id and ep.active=true
  join public.entries e on e.id=ep.entry_id
),
finished as (
  select m.id as match_id,m.event_id,ev.name as event_name,ev.event_date,ev.match_type,m.stage,m.round_no,m.winner_entry_id,
         me.entry_id as my_entry_id,
         case when m.entry_a_id=me.entry_id then m.entry_b_id else m.entry_a_id end as opponent_entry_id
  from my_entries me
  join public.matches m on me.entry_id in (m.entry_a_id,m.entry_b_id)
  join public.events ev on ev.id=m.event_id
  where m.status='finished' and not m.is_bye
),
recent as (
  select f.*,coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'avatar_url',p.avatar_url) order by ep.slot)
    from public.entry_players ep join public.players p on p.id=ep.player_id
    where ep.entry_id=f.opponent_entry_id and ep.active=true),'[]'::jsonb) as opponents
  from finished f order by f.event_date desc nulls last,f.match_id desc limit 3
),
summary as (
  select count(*)::int as played,
         count(*) filter(where winner_entry_id=my_entry_id)::int as wins,
         count(*) filter(where winner_entry_id is not null and winner_entry_id<>my_entry_id)::int as losses
  from finished
)
select case when not exists(select 1 from player) then null else jsonb_build_object(
  'profile',(select jsonb_build_object('player_id',player_id,'name',name,'avatar_url',avatar_url,'level',level,'city',city,'play_times',coalesce(play_times,'{}'::text[]),'play_preference',play_preference) from player),
  'summary',(select jsonb_build_object('played',played,'wins',wins,'losses',losses) from summary),
  'recent_matches',coalesce((select jsonb_agg(jsonb_build_object('match_id',match_id,'event_id',event_id,'event_name',event_name,'event_date',event_date,'match_type',match_type,'stage',stage,'round_no',round_no,'won',(winner_entry_id=my_entry_id),'opponents',opponents) order by event_date desc nulls last,match_id desc) from recent),'[]'::jsonb)
) end;
$$;
revoke all on function public.get_managed_player_profile(uuid) from public, anon;
grant execute on function public.get_managed_player_profile(uuid) to authenticated, service_role;