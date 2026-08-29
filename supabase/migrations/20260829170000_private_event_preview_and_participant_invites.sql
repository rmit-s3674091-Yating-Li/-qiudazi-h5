-- Private events are discoverable in the hall, but hall/detail preview responses are privacy-redacted.
-- Public-event participants may invite their existing connections to join; private ordinary invites remain owner-controlled.

create or replace function public.list_events(p_mine boolean default false,p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if p_mine and public.current_profile_id() is null then raise exception 'AUTH_REQUIRED'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
   select
     e.id,e.name,
     case when p_mine or e.visibility='public' then e.owner_user_id else null end as owner_user_id,
     e.status,e.visibility,e.match_type,e.format,e.level,e.city,
     case when p_mine or e.visibility='public' then e.event_date else null end as event_date,
     case when p_mine or e.visibility='public' then e.event_time else null end as event_time,
     case when p_mine or e.visibility='public' then e.venue else null end as venue,
     case when p_mine or e.visibility='public' then e.best_of else null end as best_of,
     case when p_mine or e.visibility='public' then e.entry_limit else null end as entry_limit,
     case when p_mine or e.visibility='public' then e.fee_type else null end as fee_type,
     case when p_mine or e.visibility='public' then e.fixed_fee_per_entry else null end as fixed_fee_per_entry,
     case when p_mine or e.visibility='public' then e.venue_fee_total else null end as venue_fee_total,
     case when p_mine or e.visibility='public' then e.ball_fee_total else null end as ball_fee_total,
     case when p_mine or e.visibility='public' then e.other_fee_total else null end as other_fee_total,
     case when p_mine or e.visibility='public' then owner.nickname else null end as owner_nickname,
     case when p_mine or e.visibility='public' then owner.avatar_url else null end as owner_avatar_url,
     case when p_mine or e.visibility='public' then (select count(*) from public.entries en where en.event_id=e.id and en.status='confirmed') else null end as confirmed_count,
     case when p_mine or e.visibility='public' then (select count(*) from public.entries en where en.event_id=e.id and en.status='waitlist') else null end as waitlist_count
   from public.events e join public.profiles owner on owner.id=e.owner_user_id
   where (case when p_mine then case when p_filters->>'scope'='joined' then exists(select 1 from public.entries own_entry where own_entry.event_id=e.id and own_entry.signup_user_id=public.current_profile_id() and own_entry.status!='withdrawn') else e.owner_user_id=public.current_profile_id() end else e.status!='finished' end)
   and (coalesce(p_filters->>'match_type','')='' or e.match_type=p_filters->>'match_type')
   and (coalesce(p_filters->>'level','')='' or e.level=p_filters->>'level')
   and (coalesce(p_filters->>'event_date','')='' or (e.visibility='public' and e.event_date::text=p_filters->>'event_date'))
   and (coalesce(p_filters->>'status','')='' or e.status=p_filters->>'status')
   order by e.event_date asc nulls last,e.created_at desc,e.id limit 200
 ) t;
 return result;
end $$;

create or replace function public.get_private_event_preview(p_event_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare e public.events; me uuid:=public.current_profile_id(); allowed boolean:=false;
begin
 select * into e from public.events where id=p_event_id and visibility='private';
 if e.id is null then return null; end if;
 allowed:=me is not null and (
   e.owner_user_id=me
   or exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in ('pending','accepted'))
   or exists(select 1 from public.entries en where en.event_id=e.id and en.signup_user_id=me and en.status<>'withdrawn')
 );
 return jsonb_build_object('id',e.id,'name',e.name,'visibility',e.visibility,'status',e.status,'match_type',e.match_type,'format',e.format,'level',e.level,'city',e.city,'can_view_full',allowed);
end $$;
revoke all on function public.get_private_event_preview(uuid) from public,anon;
grant execute on function public.get_private_event_preview(uuid) to authenticated,service_role;

create or replace function public.get_event_snapshot(p_event_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare e public.events; me uuid:=public.current_profile_id(); result jsonb; viewer_role text;
begin
 select * into e from public.events where id=p_event_id;
 if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
 viewer_role := case
   when me is not null and e.owner_user_id=me then 'owner'
   when me is not null and exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in ('pending','accepted')) then 'invited'
   when me is not null and exists(select 1 from public.entries en where en.event_id=e.id and en.signup_user_id=me and en.status<>'withdrawn') then 'participant'
   else 'viewer' end;
 if e.visibility<>'public' and viewer_role='viewer' then raise exception 'EVENT_NOT_FOUND'; end if;
 select jsonb_build_object(
 'viewer_role',viewer_role,'event',to_jsonb(e),
 'entries',coalesce((select jsonb_agg(to_jsonb(en)||jsonb_build_object('players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'avatar_url',p.avatar_url,'slot',ep.slot,'linked_user_id',p.linked_user_id,'player_type',p.player_type) order by ep.slot) from public.entry_players ep join public.players p on p.id=ep.player_id where ep.entry_id=en.id),'[]'::jsonb)) order by en.joined_at,en.id) from public.entries en where en.event_id=p_event_id),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.stage,m.group_no,m.round_no,m.bracket_position,m.id) from public.matches m where m.event_id=p_event_id),'[]'::jsonb),
 'set_scores',coalesce((select jsonb_agg(to_jsonb(s) order by s.set_no) from public.set_scores s join public.matches m on m.id=s.match_id where m.event_id=p_event_id),'[]'::jsonb),
 'point_logs',coalesce((select jsonb_agg(to_jsonb(l) order by l.point_no) from public.point_logs l join public.matches m on m.id=l.match_id where m.event_id=p_event_id),'[]'::jsonb),
 'photo',(select to_jsonb(p) from public.event_photos p where p.event_id=p_event_id)) into result;
 return result;
end $$;

create or replace function public.invite_connection_to_event(p_event_id uuid,p_invitee_user_id uuid)
returns public.event_invites
language plpgsql security definer set search_path=''
as $$
declare me uuid:=public.current_profile_id(); e public.events; result public.event_invites; participant boolean:=false;
begin
 if me is null then raise exception 'PROFILE_REQUIRED'; end if;
 select * into e from public.events where id=p_event_id;
 if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
 participant:=exists(select 1 from public.entries en join public.entry_players ep on ep.entry_id=en.id and ep.active join public.players p on p.id=ep.player_id where en.event_id=e.id and en.status!='withdrawn' and p.linked_user_id=me and p.player_type='self');
 if e.visibility='private' and e.owner_user_id<>me then raise exception 'NOT_EVENT_OWNER'; end if;
 if e.visibility='public' and e.owner_user_id<>me and not participant then raise exception 'JOIN_EVENT_BEFORE_INVITING'; end if;
 if e.status!='signup' then raise exception 'ROSTER_LOCKED'; end if;
 if p_invitee_user_id=me then raise exception 'CANNOT_INVITE_SELF'; end if;
 if not exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me and c.addressee_user_id=p_invitee_user_id) or (c.requester_user_id=p_invitee_user_id and c.addressee_user_id=me))) then raise exception 'NOT_CONNECTION'; end if;
 if exists(select 1 from public.entry_players ep join public.players p on p.id=ep.player_id join public.entries en on en.id=ep.entry_id where ep.event_id=p_event_id and ep.active and en.status!='withdrawn' and p.linked_user_id=p_invitee_user_id and p.player_type='self') then raise exception 'ALREADY_JOINED'; end if;
 insert into public.event_invites(event_id,inviter_user_id,invitee_user_id,status,invite_kind) values(p_event_id,me,p_invitee_user_id,'pending','event')
 on conflict(event_id,invitee_user_id) where invite_kind='event' do update set inviter_user_id=excluded.inviter_user_id,status='pending',responded_at=null,created_at=now() returning * into result;
 return result;
end $$;
