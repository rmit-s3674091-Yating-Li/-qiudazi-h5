-- Service-role-only lookup used by the test identity exchange Edge Function.
create or replace function public.lookup_test_identity_by_nickname(p_nickname text)
returns table(auth_user_id uuid, nickname text)
language sql
stable
security definer
set search_path = public
as $$
  select p.auth_user_id, p.nickname
  from public.profiles p
  where p.profile_status = 'completed'
    and public.normalize_test_nickname(p.nickname) = public.normalize_test_nickname(p_nickname)
  limit 2;
$$;

revoke all on function public.lookup_test_identity_by_nickname(text) from public, anon, authenticated;
grant execute on function public.lookup_test_identity_by_nickname(text) to service_role;

comment on function public.lookup_test_identity_by_nickname(text) is
  'V7 TEST-ONLY. Service-role-only nickname to auth-user lookup for controlled Edge identity exchange; never expose through anon/authenticated RPC.';
