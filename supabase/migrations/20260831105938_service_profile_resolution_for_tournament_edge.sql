create or replace function public.resolve_profile_for_auth_user(p_auth_user_id uuid)
returns table(id uuid, profile_status text)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.id, p.profile_status
  from public.profiles p
  where p.id = coalesce(
    (select direct.id from public.profiles direct where direct.auth_user_id = p_auth_user_id limit 1),
    (select a.profile_id from private.profile_auth_aliases a where a.auth_user_id = p_auth_user_id limit 1)
  )
  limit 1;
$function$;
revoke all on function public.resolve_profile_for_auth_user(uuid) from public, anon, authenticated;
grant execute on function public.resolve_profile_for_auth_user(uuid) to service_role;
