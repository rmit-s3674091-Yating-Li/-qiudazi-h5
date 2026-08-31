create or replace function public.list_connections()
returns jsonb
language sql
security definer
set search_path=''
as $function$
  with me as (
    select public.current_profile_id() as id
  ),
  rows as (
    select
      c.id as connection_id,
      c.status,
      c.created_at,
      p.id,
      p.nickname,
      case when coalesce(pp.avatar_visible,true) then p.avatar_url else null end as avatar_url
    from public.connections c
    cross join me
    join public.profiles p
      on p.id = case
        when c.requester_user_id = me.id then c.addressee_user_id
        else c.requester_user_id
      end
    left join public.profile_preferences pp on pp.profile_id=p.id
    where me.id is not null
      and c.status='accepted'
      and (c.requester_user_id=me.id or c.addressee_user_id=me.id)
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by created_at desc),'[]'::jsonb)
  from rows;
$function$;