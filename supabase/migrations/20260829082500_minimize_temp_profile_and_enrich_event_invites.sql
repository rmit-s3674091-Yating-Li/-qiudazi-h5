create or replace function public.get_managed_player_profile(p_player_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $function$
with me as (select public.current_profile_id() as id),
player as (
  select p.id as player_id,p.name,p.avatar_url,p.level,p.city,p.play_times,p.play_preference
  from public.players p, me
  where me.id is not null
    and p.id=p_player_id
    and p.owner_user_id=me.id
    and p.player_type='manual'
    and p.linked_user_id is null
),
history as (
  select exists(
    select 1
    from player p
    join public.entry_players ep on ep.player_id=p.player_id and ep.active=true
    join public.matches m on m.status='finished' and not m.is_bye
      and ep.entry_id in (m.entry_a_id,m.entry_b_id)
  ) as has_history
)
select case when not exists(select 1 from player) then null else jsonb_build_object(
  'profile',(select jsonb_build_object(
    'player_id',player_id,'name',name,'avatar_url',avatar_url,'level',level,'city',city,
    'play_times',coalesce(play_times,'{}'::text[]),'play_preference',play_preference
  ) from player),
  'has_history',(select has_history from history)
) end;
$function$;

create or replace function public.list_my_event_invites()
returns jsonb
language sql
security definer
set search_path=''
as $function$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',i.id,
   'event_id',i.event_id,
   'event_name',e.name,
   'event_date',e.event_date,
   'city',e.city,
   'venue',e.venue,
   'level',e.level,
   'match_type',e.match_type,
   'invite_kind',i.invite_kind,
   'inviter_user_id',i.inviter_user_id,
   'inviter_nickname',p.nickname,
   'status',i.status,
   'created_at',i.created_at
 ) order by (i.status='pending') desc,i.created_at desc),'[]'::jsonb)
 from public.event_invites i
 join public.events e on e.id=i.event_id
 join public.profiles p on p.id=i.inviter_user_id
 where i.invitee_user_id=public.current_profile_id();
$function$;
