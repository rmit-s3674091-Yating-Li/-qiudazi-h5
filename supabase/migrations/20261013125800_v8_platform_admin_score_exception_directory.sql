-- V8 P2: bounded, read-only score/result exception triage for one event.
-- Trusted Edge must verify the JWT and derive p_actor_auth_user_id server-side.
-- This service-role RPC does not correct results or expose player identities.
create function public.platform_admin_list_score_exceptions(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_page_size integer default 20,
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
  v_row record;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_more boolean := false;
  v_last_created_at timestamptz;
  v_last_id uuid;
begin
  if not exists (
    select 1 from platform_ops.admin_members a
    where a.auth_user_id = p_actor_auth_user_id
      and a.active is true
      and a.role in ('reviewer', 'operator', 'super_admin')
  ) then raise exception 'PLATFORM_ADMIN_FORBIDDEN'; end if;
  if p_event_id is null then raise exception 'INVALID_EXCEPTION_EVENT'; end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'INVALID_EXCEPTION_PAGE_SIZE';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'INVALID_EXCEPTION_CURSOR';
  end if;

  for v_row in
    select m.id, m.event_id, m.stage, m.round_no, m.status,
           m.scoring_mode, m.version, m.created_at, a.anomaly_code
    from public.matches m
    cross join lateral (
      select case
        when m.status = 'finished' and m.winner_entry_id is null then 'FINISHED_WITHOUT_WINNER'
        when m.status <> 'finished' and m.winner_entry_id is not null then 'UNFINISHED_WITH_WINNER'
        when m.status = 'finished' and m.winner_entry_id is not null
          and m.winner_entry_id is distinct from m.entry_a_id
          and m.winner_entry_id is distinct from m.entry_b_id then 'WINNER_NOT_IN_MATCH'
        when m.scoring_mode = 'direct' and exists (
          select 1 from public.point_logs p where p.match_id = m.id and p.voided_at is null
        ) then 'DIRECT_WITH_ACTIVE_POINTS'
        else null
      end as anomaly_code
    ) a
    where m.event_id = p_event_id and m.is_bye is false and a.anomaly_code is not null
      and (p_before_created_at is null or (m.created_at, m.id) < (p_before_created_at, p_before_id))
    order by m.created_at desc, m.id desc
    limit p_page_size + 1
  loop
    if v_count = p_page_size then v_more := true; exit; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'match_id', v_row.id, 'event_id', v_row.event_id, 'stage', v_row.stage,
      'round_no', v_row.round_no, 'status', v_row.status, 'scoring_mode', v_row.scoring_mode,
      'version', v_row.version, 'anomaly_code', v_row.anomaly_code, 'created_at', v_row.created_at
    ));
    v_count := v_count + 1;
    v_last_created_at := v_row.created_at;
    v_last_id := v_row.id;
  end loop;
  return jsonb_build_object('items', v_items, 'next_cursor', case when v_more then
    jsonb_build_object('created_at', v_last_created_at, 'id', v_last_id) else 'null'::jsonb end);
end;
$fn$;
revoke all on function public.platform_admin_list_score_exceptions(
  uuid, uuid, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.platform_admin_list_score_exceptions(
  uuid, uuid, integer, timestamptz, uuid) to service_role;
