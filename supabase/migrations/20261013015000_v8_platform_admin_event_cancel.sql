-- V8 Platform Admin: narrowly scoped, audited cancellation of unstarted events.
-- Trusted Edge must verify JWT and supply its authenticated auth.users.id.
-- This service-role-only RPC does not expose a generic event editor.
create or replace function public.platform_admin_cancel_unstarted_event(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_role text;
  v_event public.events;
  v_prior platform_ops.admin_action_audit;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_actor_auth_user_id is null or p_event_id is null or p_request_id is null
    or p_expected_version is null or p_expected_version < 1 then
    raise exception 'INVALID_ADMIN_CANCEL_COMMAND';
  end if;
  if length(v_reason) not between 10 and 1000 then
    raise exception 'ADMIN_REASON_INVALID';
  end if;

  select m.role into v_role from platform_ops.admin_members m
  where m.auth_user_id = p_actor_auth_user_id and m.active = true
  for share;
  if v_role is distinct from 'super_admin' then
    raise exception 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if v_event.id is null then raise exception 'EVENT_NOT_FOUND'; end if;

  select * into v_prior from platform_ops.admin_action_audit
  where request_id = p_request_id;
  if found then
    if v_prior.actor_auth_user_id is distinct from p_actor_auth_user_id
      or v_prior.action is distinct from 'EVENT_CANCEL'
      or v_prior.target_kind is distinct from 'event'
      or v_prior.target_id is distinct from p_event_id::text
      or v_prior.reason is distinct from v_reason then
      raise exception 'ADMIN_REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('id', v_event.id, 'status', v_event.status,
      'version', v_event.version, 'cancelled_at', v_event.cancelled_at,
      'replayed', true);
  end if;

  if v_event.version is distinct from p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if v_event.status not in ('signup', 'locked') then
    raise exception 'ADMIN_EVENT_CANCEL_STATE';
  end if;
  if exists (select 1 from public.matches
    where event_id = p_event_id and status <> 'not_started') then
    raise exception 'ADMIN_EVENT_CANCEL_STARTED';
  end if;

  update public.events set status = 'cancelled', cancelled_at = now(),
    version = version + 1 where id = p_event_id returning * into v_event;

  begin
    insert into platform_ops.admin_action_audit
      (request_id, actor_auth_user_id, action, target_kind, target_id, reason)
    values (p_request_id, p_actor_auth_user_id, 'EVENT_CANCEL',
      'event', p_event_id::text, v_reason);
  exception when unique_violation then
    raise exception 'ADMIN_REQUEST_CONFLICT';
  end;

  return jsonb_build_object('id', v_event.id, 'status', v_event.status,
    'version', v_event.version, 'cancelled_at', v_event.cancelled_at,
    'replayed', false);
end;
$fn$;

revoke all on function public.platform_admin_cancel_unstarted_event(
  uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_admin_cancel_unstarted_event(
  uuid,uuid,integer,uuid,text) to service_role;
