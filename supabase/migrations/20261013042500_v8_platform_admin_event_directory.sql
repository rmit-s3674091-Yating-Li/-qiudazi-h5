-- V8 Platform Admin: narrow, bounded event directory for moderation triage.
-- This read-only RPC is service-role only. The trusted Edge caller MUST verify
-- JWT and pass the verified auth.users.id; never accept a browser actor id.
create function public.platform_admin_list_events(
  p_actor_auth_user_id uuid,
  p_page_size integer default 25,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_row record;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_more boolean := false;
  v_last_created_at timestamptz;
  v_last_id uuid;
begin
  if not exists (
    select 1 from platform_ops.admin_members m
    where m.auth_user_id = p_actor_auth_user_id
      and m.active = true
      and m.role in ('reviewer', 'operator', 'super_admin')
  ) then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'INVALID_EVENT_PAGE_SIZE';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'INVALID_EVENT_CURSOR';
  end if;
  if p_status is not null and p_status not in
      ('signup', 'locked', 'ongoing', 'finished', 'cancelled') then
    raise exception 'INVALID_EVENT_STATUS_FILTER';
  end if;

  for v_row in
    select e.id, e.name, e.owner_user_id, e.status, e.version,
           e.visibility, e.event_mode, e.match_type, e.format,
           e.city, e.event_date, e.created_at
    from public.events e
    where (p_status is null or e.status = p_status)
      and (p_before_created_at is null
           or (e.created_at, e.id) < (p_before_created_at, p_before_id))
    order by e.created_at desc, e.id desc
    limit p_page_size + 1
  loop
    if v_count = p_page_size then
      v_more := true;
      exit;
    end if;
    -- Explicit allowlist: no signup contact details, venue coordinates,
    -- payments, participant rosters or full Event snapshots.
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'name', v_row.name,
      'owner_user_id', v_row.owner_user_id,
      'status', v_row.status,
      'version', v_row.version,
      'visibility', v_row.visibility,
      'event_mode', v_row.event_mode,
      'match_type', v_row.match_type,
      'format', v_row.format,
      'city', v_row.city,
      'event_date', v_row.event_date,
      'created_at', v_row.created_at
    ));
    v_count := v_count + 1;
    v_last_created_at := v_row.created_at;
    v_last_id := v_row.id;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then jsonb_build_object(
      'created_at', v_last_created_at, 'id', v_last_id
    ) else 'null'::jsonb end
  );
end;
$fn$;

revoke all on function public.platform_admin_list_events(uuid, integer, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.platform_admin_list_events(uuid, integer, timestamptz, uuid, text)
  to service_role;
