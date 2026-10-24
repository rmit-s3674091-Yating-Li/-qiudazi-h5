-- V8 Platform Admin: return only the authenticated caller's active admin role.
-- This is a narrow read-only identity check, not a management capability.
-- Never accept an actor id as an RPC argument: auth.uid() is JWT-derived.
create or replace function public.platform_admin_my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.role
  from platform_ops.admin_members as m
  where m.auth_user_id = auth.uid()
    and m.active = true
  limit 1
$fn$;

-- PostgreSQL functions default to PUBLIC EXECUTE: explicitly close that door.
revoke all on function public.platform_admin_my_role() from public, anon, authenticated;
grant execute on function public.platform_admin_my_role() to authenticated;
