create or replace function public.list_events(p_mine boolean default false, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare result jsonb;
begin
 if p_mine and public.current_profile_id() is null then raise exception 'AUTH_REQUIRED'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
   select e.*,
     owner.nickname as owner_nickname,
     owner.avatar_url as owner_avatar_url,
     (select count(*) from public.entries en where en.event_id=e.id and en.status='confirmed') as confirmed_count,
     (select count(*) from public.entries en where en.event_id=e.id and en.status='waitlist') as waitlist_count
   from public.events e
   join public.profiles owner on owner.id=e.owner_user_id
   where (
     case when p_mine then
       case when p_filters->>'scope'='joined' then
         exists(
           select 1 from public.entries own_entry
           where own_entry.event_id=e.id
             and own_entry.signup_user_id=public.current_profile_id()
             and own_entry.status!='withdrawn'
         )
       else e.owner_user_id=public.current_profile_id() end
     else e.visibility='public' and e.status!='finished' end
   )
   and (coalesce(p_filters->>'match_type','')='' or e.match_type=p_filters->>'match_type')
   and (coalesce(p_filters->>'level','')='' or e.level=p_filters->>'level')
   and (coalesce(p_filters->>'event_date','')='' or e.event_date::text=p_filters->>'event_date')
   and (coalesce(p_filters->>'status','')='' or e.status=p_filters->>'status')
   order by e.event_date asc nulls last,e.created_at desc,e.id
   limit 200
 ) t;
 return result;
end
$$;

revoke execute on function public.list_events(boolean,jsonb) from public, anon;
grant execute on function public.list_events(boolean,jsonb) to authenticated, service_role;
