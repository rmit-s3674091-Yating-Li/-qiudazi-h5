-- V8 Platform Admin: bounded, deterministic, read-only audit browsing.
-- The trusted Edge layer must verify the caller's access token and pass the
-- verified auth.users.id. No browser-facing role may invoke this function.
create or replace function public.platform_admin_list_audit(
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
  select m.role into v_role
  from platform_ops.admin_members m
  where m.auth_user_id = p_actor_auth_user_id and m.active;
  if v_role is null then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'INVALID_AUDIT_PAGE_SIZE';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'INVALID_AUDIT_CURSOR';
  end if;

  for v_row in
    select a.id, a.actor_auth_user_id, a.action, a.target_kind,
           a.target_id, a.reason, a.risk_level, a.created_at
    from platform_ops.admin_action_audit a
    where p_before_created_at is null
       or (a.created_at, a.id) < (p_before_created_at, p_before_id)
    order by a.created_at desc, a.id desc
    limit p_page_size + 1
  loop
    if v_count = p_page_size then
      v_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'actor_auth_user_id', v_row.actor_auth_user_id,
      'action', v_row.action,
      'target_kind', v_row.target_kind,
      'target_id', v_row.target_id,
      'reason', v_row.reason,
      'risk_level', v_row.risk_level,
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

revoke all on function public.platform_admin_list_audit(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.platform_admin_list_audit(uuid, integer, timestamptz, uuid)
  to service_role;
