-- Require event city and enforce private-event visibility.
-- Controlled test data predates city; assign Beijing to those legacy events.
update public.events set city='北京' where city is null;

alter table public.events drop constraint if exists events_visibility_check;
update public.events set visibility='private', link_signup_enabled=true where visibility='link_only';
alter table public.events add constraint events_visibility_check check (visibility = any(array['public'::text,'private'::text]));
alter table public.events alter column city set not null;

-- Align database level constraint with the UI/player level set.
alter table public.events drop constraint if exists events_level_check;
alter table public.events add constraint events_level_check check (level is null or level = any(array['2.0'::text,'2.5'::text,'3.0'::text,'3.5'::text,'4.0'::text,'4.5'::text,'5.0+'::text]));

create or replace function public.get_event_snapshot(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare e public.events; me uuid:=public.current_profile_id(); result jsonb;
begin
 select * into e from public.events where id=p_event_id;
 if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
 if e.visibility<>'public' and (me is null or (e.owner_user_id<>me
   and not exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in ('pending','accepted'))
   and not exists(select 1 from public.entries en where en.event_id=e.id and en.signup_user_id=me and en.status<>'withdrawn'))) then
   raise exception 'EVENT_NOT_FOUND';
 end if;
 select jsonb_build_object(
 'event',to_jsonb(e),
 'entries',coalesce((select jsonb_agg(to_jsonb(en)||jsonb_build_object('players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'avatar_url',p.avatar_url,'slot',ep.slot,'linked_user_id',p.linked_user_id,'player_type',p.player_type) order by ep.slot) from public.entry_players ep join public.players p on p.id=ep.player_id where ep.entry_id=en.id),'[]'::jsonb)) order by en.joined_at,en.id) from public.entries en where en.event_id=p_event_id),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.stage,m.group_no,m.round_no,m.bracket_position,m.id) from public.matches m where m.event_id=p_event_id),'[]'::jsonb),
 'set_scores',coalesce((select jsonb_agg(to_jsonb(s) order by s.set_no) from public.set_scores s join public.matches m on m.id=s.match_id where m.event_id=p_event_id),'[]'::jsonb),
 'point_logs',coalesce((select jsonb_agg(to_jsonb(l) order by l.point_no) from public.point_logs l join public.matches m on m.id=l.match_id where m.event_id=p_event_id),'[]'::jsonb),
 'photo',(select to_jsonb(p) from public.event_photos p where p.event_id=p_event_id)) into result;
 return result;
end $$;

create or replace function public.save_event(p_id uuid,p_config jsonb,p_version integer default null)
returns public.events language plpgsql security definer set search_path=''
as $$
declare me uuid:=public.current_profile_id(); e public.events; old public.events;
allowed text[]:=array['name','visibility','link_signup_enabled','match_type','format','best_of','scoring_type','custom_games_target','tiebreak_trigger','level','entry_limit','event_date','event_time','city','venue','fee_type','venue_fee_total','ball_fee_total','other_fee_total','fixed_fee_per_entry','group_count','qualifiers_per_group'];
begin
 if me is null or not exists(select 1 from public.profiles where id=me and profile_status='completed') then raise exception 'PROFILE_REQUIRED'; end if;
 if p_config-allowed!='{}'::jsonb then raise exception 'INVALID_FIELDS'; end if;
 e:=jsonb_populate_record(null::public.events,p_config);
 e.city:=nullif(trim(e.city),''); e.venue:=nullif(trim(e.venue),'');
 if e.city is null then raise exception 'CITY_REQUIRED'; end if;
 if e.visibility not in ('public','private') then raise exception 'VISIBILITY'; end if;
 e.link_signup_enabled:=true;
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
