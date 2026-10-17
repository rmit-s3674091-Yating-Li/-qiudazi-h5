#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)
result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('d1111111-1111-4111-8111-111111111111','v8-admin-cancel-super@example.invalid'),
  ('d2222222-2222-4222-8222-222222222222','v8-admin-cancel-operator@example.invalid'),
  ('d3333333-3333-4333-8333-333333333333','v8-admin-cancel-outsider@example.invalid');
insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code) values
  ('d4444444-4444-4444-8444-444444444444','d3333333-3333-4333-8333-333333333333','V8 cancel owner',null,'completed','V8CAN01');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('d1111111-1111-4111-8111-111111111111','super_admin'),
  ('d2222222-2222-4222-8222-222222222222','operator');
insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,fee_type,status,version,draw_generated) values
  ('d5555555-5555-4555-8555-555555555551','d4444444-4444-4444-8444-444444444444','V8 admin cancel target','public','singles','round_robin',1,'games_4','free','locked',1,true),
  ('d5555555-5555-4555-8555-555555555552','d4444444-4444-4444-8444-444444444444','V8 admin started target','public','singles','round_robin',1,'games_4','free','locked',1,true),
  ('d5555555-5555-4555-8555-555555555553','d4444444-4444-4444-8444-444444444444','V8 admin stale target','public','singles','round_robin',1,'games_4','free','signup',2,false);
insert into public.matches(id,event_id,stage,round_no,status,is_bye,version) values
  ('d6666666-6666-4666-8666-666666666666','d5555555-5555-4555-8555-555555555552','round_robin',1,'ongoing',false,1);

do $test$
declare
  v_actor uuid := 'd1111111-1111-4111-8111-111111111111';
  v_target uuid := 'd5555555-5555-4555-8555-555555555551';
  v_request uuid := 'd7777777-7777-4777-8777-777777777777';
  v_reason text := 'Confirmed organizer misconduct, pre-start cancellation approved';
  v_result jsonb;
  blocked boolean;
begin
  if has_function_privilege('anon',
      'public.platform_admin_cancel_unstarted_event(uuid,uuid,integer,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.platform_admin_cancel_unstarted_event(uuid,uuid,integer,uuid,text)','EXECUTE')
    or not has_function_privilege('service_role',
      'public.platform_admin_cancel_unstarted_event(uuid,uuid,integer,uuid,text)','EXECUTE')
  then raise exception 'ADMIN_CANCEL_RPC_ACL_LEAK'; end if;

  v_result := public.platform_admin_cancel_unstarted_event(v_actor,v_target,1,v_request,v_reason);
  if v_result->>'status'<>'cancelled' or (v_result->>'version')::integer<>2
    or v_result->>'replayed'<>'false'
    or not exists(select 1 from public.events where id=v_target and cancelled_at is not null)
    or (select count(*) from platform_ops.admin_action_audit where request_id=v_request)<>1
  then raise exception 'ADMIN_CANCEL_NOT_ATOMIC'; end if;

  v_result := public.platform_admin_cancel_unstarted_event(v_actor,v_target,1,v_request,v_reason);
  if v_result->>'replayed'<>'true' or (v_result->>'version')::integer<>2
    or (select count(*) from platform_ops.admin_action_audit where request_id=v_request)<>1
  then raise exception 'ADMIN_CANCEL_REPLAY_BAD'; end if;

  blocked := false;
  begin
    perform public.platform_admin_cancel_unstarted_event(v_actor,v_target,1,v_request,
      'Different reason cannot reuse an operation request identifier');
  exception when others then blocked := sqlerrm='ADMIN_REQUEST_CONFLICT'; end;
  if not blocked then raise exception 'ADMIN_CANCEL_REPLAY_MISMATCH_ACCEPTED'; end if;

  blocked := false;
  begin
    perform public.platform_admin_cancel_unstarted_event(
      'd2222222-2222-4222-8222-222222222222',v_target,1,
      'd7777777-7777-4777-8777-777777777771',v_reason);
  exception when others then blocked := sqlerrm='PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'; end;
  if not blocked then raise exception 'ADMIN_OPERATOR_CANCEL_ACCEPTED'; end if;

  blocked := false;
  begin
    perform public.platform_admin_cancel_unstarted_event(
      'd3333333-3333-4333-8333-333333333333',v_target,1,
      'd7777777-7777-4777-8777-777777777772',v_reason);
  exception when others then blocked := sqlerrm='PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'; end;
  if not blocked then raise exception 'ADMIN_OUTSIDER_CANCEL_ACCEPTED'; end if;

  blocked := false;
  begin
    perform public.platform_admin_cancel_unstarted_event(v_actor,
      'd5555555-5555-4555-8555-555555555552',1,
      'd7777777-7777-4777-8777-777777777773',v_reason);
  exception when others then blocked := sqlerrm='ADMIN_EVENT_CANCEL_STARTED'; end;
  if not blocked then raise exception 'ADMIN_STARTED_EVENT_CANCEL_ACCEPTED'; end if;

  blocked := false;
  begin
    perform public.platform_admin_cancel_unstarted_event(v_actor,
      'd5555555-5555-4555-8555-555555555553',1,
      'd7777777-7777-4777-8777-777777777774',v_reason);
  exception when others then blocked := sqlerrm='VERSION_CONFLICT'; end;
  if not blocked then raise exception 'ADMIN_STALE_EVENT_CANCEL_ACCEPTED'; end if;

  update platform_ops.admin_members set active=false where auth_user_id=v_actor;
  blocked := false;
  begin
    perform public.platform_admin_cancel_unstarted_event(v_actor,v_target,1,v_request,v_reason);
  exception when others then blocked := sqlerrm='PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'; end;
  if not blocked then raise exception 'ADMIN_REVOKED_REPLAY_ACCEPTED'; end if;

  if (select count(*) from platform_ops.admin_action_audit where action='EVENT_CANCEL')<>1
    or (select status from public.events where id='d5555555-5555-4555-8555-555555555552')<>'locked'
    or (select version from public.events where id='d5555555-5555-4555-8555-555555555553')<>2
  then raise exception 'ADMIN_FAILED_COMMAND_LEFT_PARTIAL_WRITES'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: V8 Platform Admin event cancellation transaction (actual=$result)"
  exit 1
fi
echo "PASS: V8 Platform Admin event cancellation transaction"
