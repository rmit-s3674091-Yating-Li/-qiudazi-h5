-- V8 Platform Admin: minimal, paginated user directory for trusted management UI.
-- A future Edge handler MUST validate the caller JWT and supply auth.users.id.
-- The browser must never invoke this service-role-only RPC or choose its actor.
-- No email, phone, avatar URL, auth metadata, or private profile fields returned.
create or replace function public.platform_admin_list_users(
  p_actor_auth_user_id uuid,
  p_page_size integer default 25,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_role text;
  v_row record;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_more boolean := false;
  v_last_created_at timestamptz;
  v_last_id uuid;
begin
  -- User directory is more sensitive than the general audit viewer.
  select m.role into v_role
  from platform_ops.admin_members m
  where m.auth_user_id = p_actor_auth_user_id and m.active = true;
  if v_role is distinct from 'super_admin' then
    raise exception 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'INVALID_USER_PAGE_SIZE';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'INVALID_USER_CURSOR';
  end if;

  for v_row in
    select p.id, p.nickname, p.profile_status, p.created_at
    from public.profiles p
    where p_before_created_at is null
       or (p.created_at, p.id) < (p_before_created_at, p_before_id)
    order by p.created_at desc, p.id desc
    limit p_page_size + 1
  loop
    if v_count = p_page_size then
      v_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'nickname', v_row.nickname,
      'profile_status', v_row.profile_status,
      'created_at', v_row.created_at
    ));
    v_count := v_count + 1;
    v_last_created_at := v_row.created_at;
    v_last_id := v_row.id;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then jsonb_build_object(
      'created_at', v_last_created_at,
      'id', v_last_id
    ) else 'null'::jsonb end
  );
end;
$fn$;

-- Postgres functions default to PUBLIC EXECUTE. Deny direct client RPC.
revoke all on function public.platform_admin_list_users(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.platform_admin_list_users(uuid, integer, timestamptz, uuid)
  to service_role;
