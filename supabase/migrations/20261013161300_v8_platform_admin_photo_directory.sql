-- V8 P2: event-scoped, metadata-only photo moderation triage.
-- Trusted Edge must verify the JWT and derive the actor's auth.users.id.
-- No photo Storage paths, signed URLs, user IDs or personal album assets are returned.
create function public.platform_admin_list_event_photo_metadata(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_page_size integer default 20,
  p_before_uploaded_at timestamptz default null,
  p_before_id uuid default null
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
  v_last_uploaded_at timestamptz;
  v_last_id uuid;
begin
  if not exists (
    select 1 from platform_ops.admin_members a
    where a.auth_user_id = p_actor_auth_user_id
      and a.active is true
      and a.role in ('reviewer', 'operator', 'super_admin')
  ) then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;
  if p_event_id is null then
    raise exception 'INVALID_PHOTO_EVENT';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'INVALID_PHOTO_PAGE_SIZE';
  end if;
  if (p_before_uploaded_at is null) <> (p_before_id is null) then
    raise exception 'INVALID_PHOTO_CURSOR';
  end if;

  for v_row in
    select ph.id, ph.event_id, ph.version, ph.uploaded_at
    from public.event_photos ph
    where ph.event_id = p_event_id
      and (p_before_uploaded_at is null
           or (ph.uploaded_at, ph.id) < (p_before_uploaded_at, p_before_id))
    order by ph.uploaded_at desc, ph.id desc
    limit p_page_size + 1
  loop
    if v_count = p_page_size then
      v_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'event_id', v_row.event_id,
      'version', v_row.version,
      'uploaded_at', v_row.uploaded_at
    ));
    v_count := v_count + 1;
    v_last_uploaded_at := v_row.uploaded_at;
    v_last_id := v_row.id;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then jsonb_build_object(
      'uploaded_at', v_last_uploaded_at,
      'id', v_last_id
    ) else 'null'::jsonb end
  );
end;
$fn$;

revoke all on function public.platform_admin_list_event_photo_metadata(
  uuid, uuid, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.platform_admin_list_event_photo_metadata(
  uuid, uuid, integer, timestamptz, uuid
) to service_role;
