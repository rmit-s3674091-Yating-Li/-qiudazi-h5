-- Authoritative V6 function sync for clean-environment replay.
-- These definitions mirror the shared Supabase test schema after the 2026-08-29 V6 migrations.

create or replace function public.save_event(p_id uuid, p_config jsonb, p_version integer default null::integer)
returns public.events
language plpgsql
security definer
set search_path to ''
as $$
declare
  me uuid:=public.current_profile_id();
  e public.events;
  old public.events;
  allowed text[]:=array['name','visibility','link_signup_enabled','match_type','format','best_of','scoring_type','custom_games_target','tiebreak_trigger','level','suggested_level_min','suggested_level_max','entry_limit','event_date','event_time','registration_deadline','city','venue','fee_type','venue_fee_total','ball_fee_total','other_fee_total','fixed_fee_per_entry','group_count','qualifiers_per_group'];
  levels text[]:=array['≤2.0','2.5','3.0','3.5','4.0','≥4.5'];
  start_at timestamp;
begin
  if me is null or not exists(select 1 from public.profiles where id=me and profile_status='completed') then raise exception 'PROFILE_REQUIRED'; end if;
  if p_config-allowed!='{}'::jsonb then raise exception 'INVALID_FIELDS'; end if;
  e:=jsonb_populate_record(null::public.events,p_config);
  e.city:=nullif(trim(e.city),''); e.venue:=nullif(trim(e.venue),'');
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
    if not public.event_registration_open(old) then raise exception 'ROSTER_LOCKED'; end if;
    if old.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
    if exists(select 1 from public.entries where event_id=p_id and status!='withdrawn') and e.match_type!=old.match_type then raise exception 'ENTRY_TYPE_LOCKED'; end if;
    if e.entry_limit is not null and e.entry_limit<(select count(*) from public.entries where event_id=p_id and status='confirmed') then raise exception 'LIMIT_BELOW_ROSTER'; end if;
    update public.events set name=e.name,visibility=e.visibility,link_signup_enabled=true,match_type=e.match_type,format=e.format,best_of=e.best_of,scoring_type=e.scoring_type,custom_games_target=e.custom_games_target,tiebreak_trigger=e.tiebreak_trigger,level=null,suggested_level_min=e.suggested_level_min,suggested_level_max=e.suggested_level_max,entry_limit=e.entry_limit,event_date=e.event_date,event_time=e.event_time,registration_deadline=e.registration_deadline,city=e.city,venue=e.venue,fee_type=e.fee_type,venue_fee_total=e.venue_fee_total,ball_fee_total=e.ball_fee_total,other_fee_total=e.other_fee_total,fixed_fee_per_entry=e.fixed_fee_per_entry,group_count=e.group_count,qualifiers_per_group=e.qualifiers_per_group,version=version+1 where id=p_id returning * into e;
  else
    insert into public.events(owner_user_id,name,visibility,link_signup_enabled,match_type,format,best_of,scoring_type,custom_games_target,tiebreak_trigger,level,suggested_level_min,suggested_level_max,entry_limit,event_date,event_time,registration_deadline,city,venue,fee_type,venue_fee_total,ball_fee_total,other_fee_total,fixed_fee_per_entry,group_count,qualifiers_per_group)
    values(me,e.name,e.visibility,true,e.match_type,e.format,e.best_of,e.scoring_type,e.custom_games_target,e.tiebreak_trigger,null,e.suggested_level_min,e.suggested_level_max,e.entry_limit,e.event_date,e.event_time,e.registration_deadline,e.city,e.venue,e.fee_type,e.venue_fee_total,e.ball_fee_total,e.other_fee_total,e.fixed_fee_per_entry,e.group_count,e.qualifiers_per_group) returning * into e;
  end if;
  return e;
end $$;

create or replace function public.join_event(p_event_id uuid, p_player_ids uuid[], p_team_name text default null::text, p_manual boolean default false)
returns public.entries
language plpgsql security definer set search_path to ''
as $$
declare e public.events; me uuid:=public.current_profile_id(); result public.entries; confirmed integer; waiting integer; target_status text; self_id uuid;
begin
  if me is null or not exists(select 1 from public.profiles where id=me and profile_status='completed') then raise exception 'PROFILE_REQUIRED'; end if;
  select * into e from public.events where id=p_event_id for update;
  if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if not public.event_registration_open(e) then raise exception 'REGISTRATION_CLOSED'; end if;
  p_manual:=coalesce(p_manual,false);
  if p_manual and e.owner_user_id!=me then raise exception 'FORBIDDEN'; end if;
  if cardinality(p_player_ids) is distinct from(case when e.match_type='doubles' then 2 else 1 end) or array_position(p_player_ids,null) is not null then raise exception 'ENTRY_SIZE'; end if;
  if(select count(distinct x) from unnest(p_player_ids)x)!=cardinality(p_player_ids) then raise exception 'DUPLICATE_PLAYER'; end if;
  select id into self_id from public.players where linked_user_id=me and player_type='self' order by created_at limit 1;
  if not p_manual and(self_id is null or not self_id=any(p_player_ids)) then raise exception 'SELF_REQUIRED'; end if;
  if p_manual then
    if(select count(*) from public.players where id=any(p_player_ids) and owner_user_id=me)!=cardinality(p_player_ids) then raise exception 'PLAYER_FORBIDDEN'; end if;
  else
    if exists(select 1 from public.players p where p.id=any(p_player_ids) and p.owner_user_id<>me and not(p.player_type='self' and p.linked_user_id is not null and exists(select 1 from public.event_invites i where i.event_id=p_event_id and i.inviter_user_id=me and i.invitee_user_id=p.linked_user_id and i.invite_kind='doubles_partner' and i.status='accepted'))) then raise exception 'PLAYER_FORBIDDEN'; end if;
  end if;
  if exists(select 1 from public.entry_players where event_id=p_event_id and active and player_id=any(p_player_ids)) then raise exception 'DUPLICATE_PLAYER'; end if;
  select count(*) into confirmed from public.entries where event_id=p_event_id and status='confirmed';
  select count(*) into waiting from public.entries where event_id=p_event_id and status='waitlist';
  target_status:=case when e.entry_limit is null or confirmed<e.entry_limit then 'confirmed' else 'waitlist' end;
  if target_status='waitlist' and waiting>=2 then raise exception 'WAITLIST_FULL'; end if;
  insert into public.entries(event_id,entry_type,team_name,signup_user_id,status,waitlist_order) values(p_event_id,e.match_type,nullif(trim(p_team_name),''),case when p_manual then null else me end,target_status,case when target_status='waitlist' then waiting+1 else null end) returning * into result;
  insert into public.entry_players(entry_id,event_id,player_id,slot) select result.id,p_event_id,x.id,x.slot::integer from unnest(p_player_ids) with ordinality as x(id,slot);
  update public.events set version=version+1 where id=p_event_id;
  return result;
end $$;

create or replace function public.withdraw_entry(p_event_id uuid, p_entry_id uuid)
returns void language plpgsql security definer set search_path to ''
as $$
declare e public.events; en public.entries; me uuid:=public.current_profile_id(); candidate uuid;
begin
  if me is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into e from public.events where id=p_event_id for update;
  select * into en from public.entries where id=p_entry_id and event_id=p_event_id for update;
  if e.id is null or en.id is null then raise exception 'ENTRY_NOT_FOUND'; end if;
  if e.owner_user_id!=me and en.signup_user_id is distinct from me and not exists(select 1 from public.entry_players ep join public.players p on p.id=ep.player_id where ep.entry_id=en.id and ep.active and p.linked_user_id=me and p.player_type='self') then raise exception 'FORBIDDEN'; end if;
  if not public.event_registration_open(e) then raise exception 'REGISTRATION_CLOSED'; end if;
  if en.status='withdrawn' then return; end if;
  update public.entries set status='withdrawn',waitlist_order=null where id=en.id;
  update public.entry_players set active=false where entry_id=en.id;
  if en.status='confirmed' then select id into candidate from public.entries where event_id=p_event_id and status='waitlist' order by joined_at,id limit 1; if candidate is not null then update public.entries set status='confirmed',waitlist_order=null where id=candidate; end if; end if;
  with ordered as(select id,row_number() over(order by joined_at,id)n from public.entries where event_id=p_event_id and status='waitlist') update public.entries target set waitlist_order=o.n from ordered o where target.id=o.id;
  update public.events set version=version+1 where id=p_event_id;
end $$;

create or replace function public.invite_connection_to_event(p_event_id uuid, p_invitee_user_id uuid)
returns public.event_invites language plpgsql security definer set search_path to ''
as $$
declare me uuid:=public.current_profile_id(); e public.events; result public.event_invites; participant boolean:=false;
begin
  if me is null then raise exception 'PROFILE_REQUIRED'; end if;
  select * into e from public.events where id=p_event_id;
  if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  participant:=exists(select 1 from public.entries en join public.entry_players ep on ep.entry_id=en.id and ep.active join public.players p on p.id=ep.player_id where en.event_id=e.id and en.status!='withdrawn' and p.linked_user_id=me and p.player_type='self');
  if e.visibility='private' and e.owner_user_id<>me then raise exception 'NOT_EVENT_OWNER'; end if;
  if e.visibility='public' and e.owner_user_id<>me and not participant then raise exception 'JOIN_EVENT_BEFORE_INVITING'; end if;
  if not public.event_registration_open(e) then raise exception 'REGISTRATION_CLOSED'; end if;
  if p_invitee_user_id=me then raise exception 'CANNOT_INVITE_SELF'; end if;
  if not coalesce((select allow_event_invites from public.profile_preferences where profile_id=p_invitee_user_id),true) then raise exception 'EVENT_INVITES_DISABLED'; end if;
  if not exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me and c.addressee_user_id=p_invitee_user_id) or(c.requester_user_id=p_invitee_user_id and c.addressee_user_id=me))) then raise exception 'NOT_CONNECTION'; end if;
  if exists(select 1 from public.entry_players ep join public.players p on p.id=ep.player_id join public.entries en on en.id=ep.entry_id where ep.event_id=p_event_id and ep.active and en.status!='withdrawn' and p.linked_user_id=p_invitee_user_id and p.player_type='self') then raise exception 'ALREADY_JOINED'; end if;
  insert into public.event_invites(event_id,inviter_user_id,invitee_user_id,status,invite_kind) values(p_event_id,me,p_invitee_user_id,'pending','event') on conflict(event_id,invitee_user_id) where invite_kind='event' do update set inviter_user_id=excluded.inviter_user_id,status='pending',responded_at=null,created_at=now() returning * into result;
  return result;
end $$;

create or replace function public.invite_doubles_partner(p_event_id uuid, p_invitee_user_id uuid)
returns public.event_invites language plpgsql security definer set search_path to ''
as $$
declare me uuid:=public.current_profile_id(); e public.events; result public.event_invites;
begin
  if me is null then raise exception 'PROFILE_REQUIRED'; end if;
  select * into e from public.events where id=p_event_id;
  if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if e.visibility='private' and not(e.owner_user_id=me or exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in('pending','accepted')) or exists(select 1 from public.entries en join public.entry_players ep on ep.entry_id=en.id and ep.active join public.players p on p.id=ep.player_id where en.event_id=e.id and en.status!='withdrawn' and p.linked_user_id=me and p.player_type='self')) then raise exception 'EVENT_NOT_FOUND'; end if;
  if not public.event_registration_open(e) then raise exception 'REGISTRATION_CLOSED'; end if;
  if e.match_type!='doubles' then raise exception 'DOUBLES_ONLY'; end if;
  if p_invitee_user_id=me then raise exception 'CANNOT_INVITE_SELF'; end if;
  if not coalesce((select allow_doubles_invites from public.profile_preferences where profile_id=p_invitee_user_id),true) then raise exception 'DOUBLES_INVITES_DISABLED'; end if;
  if not exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me and c.addressee_user_id=p_invitee_user_id) or(c.requester_user_id=p_invitee_user_id and c.addressee_user_id=me))) then raise exception 'NOT_CONNECTION'; end if;
  if not exists(select 1 from public.players p where p.linked_user_id=me and p.player_type='self') or not exists(select 1 from public.players p where p.linked_user_id=p_invitee_user_id and p.player_type='self') then raise exception 'SELF_PLAYER_REQUIRED'; end if;
  if exists(select 1 from public.entry_players ep join public.players p on p.id=ep.player_id join public.entries en on en.id=ep.entry_id where ep.event_id=p_event_id and ep.active and en.status!='withdrawn' and p.linked_user_id in(me,p_invitee_user_id)) then raise exception 'ALREADY_JOINED'; end if;
  insert into public.event_invites(event_id,inviter_user_id,invitee_user_id,status,invite_kind) values(p_event_id,me,p_invitee_user_id,'pending','doubles_partner') on conflict(event_id,inviter_user_id,invitee_user_id) where invite_kind='doubles_partner' do update set status='pending',responded_at=null,created_at=now() returning * into result;
  return result;
end $$;

create or replace function public.respond_event_invite(p_invite_id uuid, p_accept boolean)
returns public.event_invites language plpgsql security definer set search_path to ''
as $$
declare me uuid:=public.current_profile_id(); result public.event_invites; e public.events;
begin
  if me is null then raise exception 'PROFILE_REQUIRED'; end if;
  if p_accept then select ev.* into e from public.event_invites i join public.events ev on ev.id=i.event_id where i.id=p_invite_id and i.invitee_user_id=me; if e.id is null then raise exception 'INVITE_NOT_FOUND'; end if; if not public.event_registration_open(e) then raise exception 'REGISTRATION_CLOSED'; end if; end if;
  update public.event_invites set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now() where id=p_invite_id and invitee_user_id=me and status='pending' returning * into result;
  if result.id is null then raise exception 'INVITE_NOT_FOUND'; end if;
  return result;
end $$;

create or replace function public.list_my_event_invites()
returns jsonb language sql security definer set search_path to ''
as $$
select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'event_id',i.event_id,'event_name',e.name,'event_date',e.event_date,'event_time',e.event_time,'registration_deadline',e.registration_deadline,'city',e.city,'venue',e.venue,'suggested_level_min',e.suggested_level_min,'suggested_level_max',e.suggested_level_max,'match_type',e.match_type,'invite_kind',i.invite_kind,'inviter_user_id',i.inviter_user_id,'inviter_nickname',p.nickname,'status',i.status,'registration_open',public.event_registration_open(e),'created_at',i.created_at) order by(i.status='pending') desc,i.created_at desc),'[]'::jsonb) from public.event_invites i join public.events e on e.id=i.event_id join public.profiles p on p.id=i.inviter_user_id where i.invitee_user_id=public.current_profile_id()
$$;

create or replace function public.get_private_event_preview(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare e public.events; me uuid:=public.current_profile_id(); allowed boolean:=false;
begin
  select * into e from public.events where id=p_event_id and visibility='private';
  if e.id is null then return null; end if;
  allowed:=me is not null and(e.owner_user_id=me or exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in('pending','accepted')) or exists(select 1 from public.entries en where en.event_id=e.id and en.signup_user_id=me and en.status<>'withdrawn'));
  return jsonb_build_object('id',e.id,'name',e.name,'visibility',e.visibility,'status',case when e.status='signup' and not public.event_registration_open(e) then 'locked' else e.status end,'match_type',e.match_type,'format',e.format,'suggested_level_min',e.suggested_level_min,'suggested_level_max',e.suggested_level_max,'city',e.city,'can_view_full',allowed);
end $$;

create or replace function public.get_connected_partner_profile(p_profile_id uuid)
returns jsonb language sql security definer set search_path to ''
as $$
with me as(select public.current_profile_id() id), allowed as(select p_profile_id id from me where me.id is not null and exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me.id and c.addressee_user_id=p_profile_id) or (c.addressee_user_id=me.id and c.requester_user_id=p_profile_id)))), prefs as(select coalesce(pp.avatar_visible,true) avatar_visible,coalesce(pp.level_visible,true) level_visible,coalesce(pp.city_visible,true) city_visible,coalesce(pp.play_times_visible,true) play_times_visible,coalesce(pp.play_preference_visible,true) play_preference_visible from allowed a left join public.profile_preferences pp on pp.profile_id=a.id), partner as(select pr.id profile_id,pr.nickname,case when pf.avatar_visible then pr.avatar_url else null end avatar_url,pl.id player_id,case when pf.level_visible then pl.level else null end level,case when pf.city_visible then pl.city else null end city,case when pf.play_times_visible then pl.play_times else '{}'::text[] end play_times,case when pf.play_preference_visible then pl.play_preference else null end play_preference from allowed a join public.profiles pr on pr.id=a.id and pr.profile_status='completed' cross join prefs pf left join public.players pl on pl.linked_user_id=pr.id and pl.player_type='self' limit 1), partner_entries as(select distinct e.id entry_id from partner p join public.entry_players ep on ep.player_id=p.player_id and ep.active=true join public.entries e on e.id=ep.entry_id), finished as(select m.id match_id,m.event_id,ev.name event_name,ev.event_date,ev.match_type,m.stage,m.round_no,m.winner_entry_id,pe.entry_id my_entry_id,case when m.entry_a_id=pe.entry_id then m.entry_b_id else m.entry_a_id end opponent_entry_id from partner_entries pe join public.matches m on pe.entry_id in(m.entry_a_id,m.entry_b_id) join public.events ev on ev.id=m.event_id where m.status='finished' and not m.is_bye), recent as(select f.*,coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'avatar_url',p.avatar_url) order by ep.slot) from public.entry_players ep join public.players p on p.id=ep.player_id where ep.entry_id=f.opponent_entry_id and ep.active=true),'[]'::jsonb) opponents from finished f order by f.event_date desc nulls last,f.match_id desc limit 3), summary as(select count(*)::int played,count(*) filter(where winner_entry_id=my_entry_id)::int wins,count(*) filter(where winner_entry_id is not null and winner_entry_id<>my_entry_id)::int losses from finished) select case when not exists(select 1 from partner) then null else jsonb_build_object('profile',(select jsonb_build_object('id',profile_id,'nickname',nickname,'avatar_url',avatar_url,'player_id',player_id,'level',level,'city',city,'play_times',coalesce(play_times,'{}'::text[]),'play_preference',play_preference) from partner),'summary',(select jsonb_build_object('played',played,'wins',wins,'losses',losses) from summary),'recent_matches',coalesce((select jsonb_agg(jsonb_build_object('match_id',match_id,'event_id',event_id,'event_name',event_name,'event_date',event_date,'match_type',match_type,'stage',stage,'round_no',round_no,'won',(winner_entry_id=my_entry_id),'opponents',opponents) order by event_date desc nulls last,match_id desc) from recent),'[]'::jsonb)) end
$$;
