create or replace function public.list_events(p_mine boolean default false,p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if p_mine and public.current_profile_id() is null then raise exception 'AUTH_REQUIRED'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
   select
     e.id,e.name,e.owner_user_id,e.status,e.visibility,e.match_type,e.format,e.level,e.city,
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
