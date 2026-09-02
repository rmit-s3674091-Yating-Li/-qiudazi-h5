create or replace function public.list_events(p_mine boolean default false, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare result jsonb;
begin
  if p_mine and public.current_profile_id() is null then raise exception 'AUTH_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result
  from(
    select e.id,e.name,e.event_mode,
      case when p_mine or e.visibility='public' then e.owner_user_id else null end owner_user_id,
      case when e.status='signup' and not public.event_registration_open(e) then 'locked' else e.status end status,
      e.visibility,e.match_type,e.format,e.suggested_level_min,e.suggested_level_max,e.city,
      case when p_mine or e.visibility='public' then e.event_date else null end event_date,
      case when p_mine or e.visibility='public' then e.event_time else null end event_time,
      case when p_mine or e.visibility='public' then e.registration_deadline else null end registration_deadline,
      case when p_mine or e.visibility='public' then e.venue else null end venue,
      case when p_mine or e.visibility='public' then e.best_of else null end best_of,
      case when p_mine or e.visibility='public' then e.entry_limit else null end entry_limit,
      case when p_mine or e.visibility='public' then e.fee_type else null end fee_type,
      case when p_mine or e.visibility='public' then e.fixed_fee_per_entry else null end fixed_fee_per_entry,
      case when p_mine or e.visibility='public' then e.venue_fee_total else null end venue_fee_total,
      case when p_mine or e.visibility='public' then e.ball_fee_total else null end ball_fee_total,
      case when p_mine or e.visibility='public' then e.other_fee_total else null end other_fee_total,
      case when p_mine or e.visibility='public' then owner.nickname else null end owner_nickname,
      case when p_mine or e.visibility='public' then owner.avatar_url else null end owner_avatar_url,
      case when p_mine or e.visibility='public' then(select count(*) from public.entries en where en.event_id=e.id and en.status='confirmed') else null end confirmed_count,
      case when p_mine or e.visibility='public' then(select count(*) from public.entries en where en.event_id=e.id and en.status='waitlist') else null end waitlist_count
    from public.events e join public.profiles owner on owner.id=e.owner_user_id
    where(
      case when p_mine then
        case when p_filters->>'scope'='joined' then exists(select 1 from public.entries own_entry join public.entry_players ep on ep.entry_id=own_entry.id and ep.active join public.players p on p.id=ep.player_id where own_entry.event_id=e.id and own_entry.status!='withdrawn' and p.linked_user_id=public.current_profile_id())
        else e.owner_user_id=public.current_profile_id() end
      else e.status!='finished' and (coalesce(e.event_mode,'standard')='standard' or (coalesce(e.event_mode,'standard')='quick' and e.visibility='public')) end
    )
    and (p_mine or not (coalesce(owner.nickname,'') like 'TST-%' or coalesce(owner.nickname,'') like 'QA-%' or coalesce(owner.nickname,'') like 'QA15-%' or coalesce(owner.nickname,'') like 'EXP-%'))
    and(coalesce(p_filters->>'match_type','')='' or e.match_type=p_filters->>'match_type')
    and(coalesce(p_filters->>'level','')='' or (public.qiudazi_level_rank(p_filters->>'level') is not null and (e.suggested_level_min is null or public.qiudazi_level_rank(e.suggested_level_min)<=public.qiudazi_level_rank(p_filters->>'level')) and (e.suggested_level_max is null or public.qiudazi_level_rank(e.suggested_level_max)>=public.qiudazi_level_rank(p_filters->>'level'))))
    and(coalesce(p_filters->>'event_date','')='' or(e.visibility='public' and e.event_date::text=p_filters->>'event_date'))
    and(coalesce(p_filters->>'status','')='' or(case when e.status='signup' and not public.event_registration_open(e) then 'locked' else e.status end)=p_filters->>'status')
    order by e.event_date asc nulls last,e.created_at desc,e.id limit 200
  ) t;
  return result;
end $function$;
