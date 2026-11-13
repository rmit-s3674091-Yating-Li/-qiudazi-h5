-- V8 P2 Platform Admin: private report intake and bounded metadata-only triage.
-- This does not expose user-facing submission or report resolution.
-- Only a trusted Edge caller may supply the verified auth.users actor to the
-- service-role-only directory RPC; browser-provided actor IDs are forbidden.
create table platform_ops.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_auth_user_id uuid not null references auth.users(id) on delete restrict,
  target_kind text not null check (target_kind in ('user','event','match','photo')),
  target_id uuid not null,
  category text not null check (category in ('safety','conduct','spam','privacy','other')),
  summary text not null check (length(btrim(summary)) between 10 and 2000),
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index moderation_reports_created_idx
  on platform_ops.moderation_reports(created_at desc, id desc);
create index moderation_reports_status_created_idx
  on platform_ops.moderation_reports(status, created_at desc, id desc);

-- No authenticated/anon grants and no RLS policies. The service role may
-- insert intake records but cannot directly update/delete moderation state.
alter table platform_ops.moderation_reports enable row level security;
revoke all on platform_ops.moderation_reports from public, anon, authenticated, service_role;
grant select, insert on platform_ops.moderation_reports to service_role;

create function public.platform_admin_list_reports(
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
      and m.active is true
      and m.role in ('reviewer', 'operator', 'super_admin')
  ) then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'INVALID_REPORT_PAGE_SIZE';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'INVALID_REPORT_CURSOR';
  end if;
  if p_status is not null and p_status not in
      ('open','in_review','resolved','dismissed') then
    raise exception 'INVALID_REPORT_STATUS_FILTER';
  end if;

  for v_row in
    select r.id, r.target_kind, r.target_id, r.category,
           r.status, r.version, r.created_at
    from platform_ops.moderation_reports r
    where (p_status is null or r.status = p_status)
      and (p_before_created_at is null
           or (r.created_at, r.id) < (p_before_created_at, p_before_id))
    order by r.created_at desc, r.id desc
    limit p_page_size + 1
  loop
    if v_count = p_page_size then
      v_more := true;
      exit;
    end if;
    -- Deliberately exclude reporter identity, raw report summary and updates.
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'target_kind', v_row.target_kind,
      'target_id', v_row.target_id,
      'category', v_row.category,
      'status', v_row.status,
      'version', v_row.version,
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

revoke all on function public.platform_admin_list_reports(
  uuid, integer, timestamptz, uuid, text
) from public, anon, authenticated;
grant execute on function public.platform_admin_list_reports(
  uuid, integer, timestamptz, uuid, text
) to service_role;
