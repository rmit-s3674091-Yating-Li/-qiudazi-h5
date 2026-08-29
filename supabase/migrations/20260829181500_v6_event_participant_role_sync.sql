-- AUD-20260829-012
-- Event access and viewer_role use actual active Player membership in an Entry.

create or replace function public.get_private_event_preview(p_event_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare e public.events; me uuid:=public.current_profile_id(); allowed boolean:=false;
begin
  select * into e from public.events where id=p_event_id and visibility='private';
  if e.id is null then return null; end if;
  allowed:=me is not null and(
    e.owner_user_id=me
    or exists(
      select 1
      from public.entries en
      join public.entry_players ep on ep.entry_id=en.id and ep.active
      join public.players p on p.id=ep.player_id
      where en.event_id=e.id and en.status<>'withdrawn' and p.linked_user_id=me
    )
    or exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in('pending','accepted'))
  );
  return jsonb_build_object(
    'id',e.id,
    'name',e.name,
    'visibility',e.visibility,
    'status',case when e.status='signup' and not public.event_registration_open(e) then 'locked' else e.status end,
    'match_type',e.match_type,
    'format',e.format,
    'suggested_level_min',e.suggested_level_min,
    'suggested_level_max',e.suggested_level_max,
    'city',e.city,
    'can_view_full',allowed
  );
end $$;

create or replace function public.get_event_snapshot(p_event_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare e public.events; me uuid:=public.current_profile_id(); result jsonb; viewer_role text;
begin
  select * into e from public.events where id=p_event_id;
  if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;

  viewer_role := case
    when me is not null and e.owner_user_id=me then 'owner'
    when me is not null and exists(
      select 1
      from public.entries en
      join public.entry_players ep on ep.entry_id=en.id and ep.active
      join public.players p on p.id=ep.player_id
      where en.event_id=e.id and en.status<>'withdrawn' and p.linked_user_id=me
    ) then 'participant'
    when me is not null and exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in('pending','accepted')) then 'invited'
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
