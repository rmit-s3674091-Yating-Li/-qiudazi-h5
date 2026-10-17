-- V8 P2: event-submitted venue candidates for platform triage.
-- These are unverified Event fields, NOT a canonical venue registry or
-- commercial-organization record. Do not infer verified coverage from them.
-- Trusted Edge must validate JWT and supply the verified auth.users.id.
-- No direct browser RPC, precise address, coordinates, or private event detail.
create function public.platform_admin_list_event_venue_candidates(
  p_actor_auth_user_id uuid,
  p_page_size integer default 25,
  p_before_created_at timestamptz default null,
  p_before_event_id uuid default null
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
  v_last_event_id uuid;
begin
  if not exists (
    select 1 from platform_ops.admin_members m
    where m.auth_user_id = p_actor_auth_user_id
      and m.active is true
      and m.role in ('reviewer', 'operator', 'super_admin')
  ) then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'INVALID_VENUE_CANDIDATE_PAGE_SIZE';
  end if;
  if (p_before_created_at is null) <> (p_before_event_id is null) then
    raise exception 'INVALID_VENUE_CANDIDATE_CURSOR';
  end if;

  for v_row in
    select e.id, e.venue_name, e.city, e.version, e.created_at
    from public.events e
    where nullif(btrim(e.venue_name), '') is not null
      and e.status <> 'cancelled'
      and (p_before_created_at is null
           or (e.created_at, e.id) < (p_before_created_at, p_before_event_id))
    order by e.created_at desc, e.id desc
    limit p_page_size + 1
  loop
    if v_count = p_page_size then
      v_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'event_id', v_row.id,
      'venue_name', v_row.venue_name,
      'city', v_row.city,
      'event_version', v_row.version,
      'created_at', v_row.created_at,
      'verification_status', 'not_verified'
    ));
    v_count := v_count + 1;
    v_last_created_at := v_row.created_at;
    v_last_event_id := v_row.id;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then jsonb_build_object(
      'created_at', v_last_created_at,
      'event_id', v_last_event_id
    ) else 'null'::jsonb end
  );
end;
$fn$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
revoke all on function public.platform_admin_list_event_venue_candidates(
  uuid, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.platform_admin_list_event_venue_candidates(
  uuid, integer, timestamptz, uuid
) to service_role;
