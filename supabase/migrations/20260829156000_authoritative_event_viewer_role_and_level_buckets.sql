-- Use server-authoritative viewer role for event management UI and simplify social-amateur level buckets.

-- Existing test data uses 2.0 as the lowest level; fold it into the new lower bucket.
update public.players set level='2.0-' where level='2.0';
update public.events set level='2.0-' where level='2.0';
update public.players set level='4.5+' where level in ('4.5','5.0','5.0+');
update public.events set level='4.5+' where level in ('4.5','5.0','5.0+');

alter table public.events drop constraint if exists events_level_check;
alter table public.events add constraint events_level_check check (
  level is null or level = any(array['2.0-'::text,'2.5'::text,'3.0'::text,'3.5'::text,'4.0'::text,'4.5+'::text])
);

create or replace function public.save_my_tennis_profile(
  p_level text default null,
  p_city text default null,
  p_play_times text[] default '{}'::text[],
  p_play_preference text default null
)
returns public.players
language plpgsql
security definer
set search_path=''
as $$
declare me uuid:=public.current_profile_id(); result public.players;
begin
 if me is null then raise exception 'PROFILE_REQUIRED'; end if;
 if p_level is not null and nullif(trim(p_level),'') is not null and trim(p_level) not in ('2.0-','2.5','3.0','3.5','4.0','4.5+') then raise exception 'INVALID_LEVEL'; end if;
 select * into result from public.players where linked_user_id=me and player_type='self' for update;
 if result.id is null then raise exception 'SELF_PLAYER_REQUIRED'; end if;
 if p_play_preference is not null and p_play_preference not in ('singles','doubles','both') then raise exception 'INVALID_PLAY_PREFERENCE'; end if;
 update public.players
 set level=nullif(trim(p_level),''), city=nullif(trim(p_city),''), play_times=coalesce(p_play_times,'{}'::text[]), play_preference=p_play_preference, version=version+1
 where id=result.id returning * into result;
 return result;
end $$;

create or replace function public.get_event_snapshot(p_event_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare e public.events; me uuid:=public.current_profile_id(); result jsonb; viewer_role text;
begin
 select * into e from public.events where id=p_event_id;
 if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;

 viewer_role := case
   when me is not null and e.owner_user_id=me then 'owner'
   when me is not null and exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in ('pending','accepted')) then 'invited'
   when me is not null and exists(select 1 from public.entries en where en.event_id=e.id and en.signup_user_id=me and en.status<>'withdrawn') then 'participant'
   else 'viewer'
 end;

 if e.visibility<>'public' and viewer_role='viewer' then raise exception 'EVENT_NOT_FOUND'; end if;

 select jsonb_build_object(
 'viewer_role',viewer_role,
 'event',to_jsonb(e),
 'entries',coalesce((select jsonb_agg(to_jsonb(en)||jsonb_build_object('players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'avatar_url',p.avatar_url,'slot',ep.slot,'linked_user_id',p.linked_user_id,'player_type',p.player_type) order by ep.slot) from public.entry_players ep join public.players p on p.id=ep.player_id where ep.entry_id=en.id),'[]'::jsonb)) order by en.joined_at,en.id) from public.entries en where en.event_id=p_event_id),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.stage,m.group_no,m.round_no,m.bracket_position,m.id) from public.matches m where m.event_id=p_event_id),'[]'::jsonb),
 'set_scores',coalesce((select jsonb_agg(to_jsonb(s) order by s.set_no) from public.set_scores s join public.matches m on m.id=s.match_id where m.event_id=p_event_id),'[]'::jsonb),
 'point_logs',coalesce((select jsonb_agg(to_jsonb(l) order by l.point_no) from public.point_logs l join public.matches m on m.id=l.match_id where m.event_id=p_event_id),'[]'::jsonb),
 'photo',(select to_jsonb(p) from public.event_photos p where p.event_id=p_event_id)
 ) into result;
 return result;
end $$;
