alter table public.event_invites drop constraint if exists event_invites_event_id_invitee_user_id_key;

create unique index if not exists event_invites_event_unique
on public.event_invites(event_id, invitee_user_id)
where invite_kind='event';

create unique index if not exists event_invites_partner_unique
on public.event_invites(event_id, inviter_user_id, invitee_user_id)
where invite_kind='doubles_partner';

create or replace function public.invite_connection_to_event(p_event_id uuid, p_invitee_user_id uuid)
returns public.event_invites
language plpgsql
security definer
set search_path=''
as $function$
declare me uuid:=public.current_profile_id(); e public.events; result public.event_invites;
begin
 if me is null then raise exception 'PROFILE_REQUIRED'; end if;
 select * into e from public.events where id=p_event_id;
 if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
 if e.owner_user_id<>me then raise exception 'NOT_EVENT_OWNER'; end if;
 if e.status!='signup' then raise exception 'ROSTER_LOCKED'; end if;
 if p_invitee_user_id=me then raise exception 'CANNOT_INVITE_SELF'; end if;
 if not exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me and c.addressee_user_id=p_invitee_user_id) or (c.requester_user_id=p_invitee_user_id and c.addressee_user_id=me))) then raise exception 'NOT_CONNECTION'; end if;
 if exists(
   select 1 from public.entry_players ep
   join public.players p on p.id=ep.player_id
   join public.entries en on en.id=ep.entry_id
   where ep.event_id=p_event_id and ep.active and en.status!='withdrawn' and p.linked_user_id=p_invitee_user_id and p.player_type='self'
 ) then raise exception 'ALREADY_JOINED'; end if;
 insert into public.event_invites(event_id,inviter_user_id,invitee_user_id,status,invite_kind)
 values(p_event_id,me,p_invitee_user_id,'pending','event')
 on conflict(event_id,invitee_user_id) where invite_kind='event'
 do update set inviter_user_id=excluded.inviter_user_id,status='pending',responded_at=null,created_at=now()
 returning * into result;
 return result;
end $function$;

create or replace function public.invite_doubles_partner(p_event_id uuid, p_invitee_user_id uuid)
returns public.event_invites
language plpgsql
security definer
set search_path=''
as $function$
declare me uuid:=public.current_profile_id(); e public.events; result public.event_invites;
begin
 if me is null then raise exception 'PROFILE_REQUIRED'; end if;
 select * into e from public.events where id=p_event_id;
 if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
 if e.visibility='private' and not (
   e.owner_user_id=me
   or exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in ('pending','accepted'))
   or exists(
     select 1 from public.entries en
     join public.entry_players ep on ep.entry_id=en.id and ep.active
     join public.players p on p.id=ep.player_id
     where en.event_id=e.id and en.status!='withdrawn' and p.linked_user_id=me and p.player_type='self'
   )
 ) then raise exception 'EVENT_NOT_FOUND'; end if;
 if e.status!='signup' then raise exception 'ROSTER_LOCKED'; end if;
 if e.match_type!='doubles' then raise exception 'DOUBLES_ONLY'; end if;
 if p_invitee_user_id=me then raise exception 'CANNOT_INVITE_SELF'; end if;
 if not exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=me and c.addressee_user_id=p_invitee_user_id) or (c.requester_user_id=p_invitee_user_id and c.addressee_user_id=me))) then raise exception 'NOT_CONNECTION'; end if;
 if not exists(select 1 from public.players p where p.linked_user_id=me and p.player_type='self') then raise exception 'SELF_PLAYER_REQUIRED'; end if;
 if not exists(select 1 from public.players p where p.linked_user_id=p_invitee_user_id and p.player_type='self') then raise exception 'PARTNER_PLAYER_REQUIRED'; end if;
 if exists(select 1 from public.entry_players ep join public.players p on p.id=ep.player_id join public.entries en on en.id=ep.entry_id where ep.event_id=p_event_id and ep.active and en.status!='withdrawn' and p.linked_user_id in (me,p_invitee_user_id)) then raise exception 'ALREADY_JOINED'; end if;
 insert into public.event_invites(event_id,inviter_user_id,invitee_user_id,status,invite_kind)
 values(p_event_id,me,p_invitee_user_id,'pending','doubles_partner')
 on conflict(event_id,inviter_user_id,invitee_user_id) where invite_kind='doubles_partner'
 do update set status='pending',responded_at=null,created_at=now()
 returning * into result;
 return result;
end $function$;
