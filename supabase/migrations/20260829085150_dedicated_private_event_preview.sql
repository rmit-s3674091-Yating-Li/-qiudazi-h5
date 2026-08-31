create or replace function public.get_private_event_preview(p_event_id uuid)
returns jsonb
language sql stable security definer set search_path=''
as $$
 select case when e.id is null or e.visibility<>'private' then null else jsonb_build_object(
   'id',e.id,'name',e.name,'visibility',e.visibility,'status',e.status,'match_type',e.match_type,'format',e.format,'level',e.level,'city',e.city
 ) end
 from (select * from public.events where id=p_event_id) e;
$$;
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