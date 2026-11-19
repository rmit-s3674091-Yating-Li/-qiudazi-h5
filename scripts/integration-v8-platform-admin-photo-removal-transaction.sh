#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)
result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('f1111111-1111-4111-8111-111111111111','v8-remove-super@example.invalid'),
  ('f2222222-2222-4222-8222-222222222222','v8-remove-operator@example.invalid'),
  ('f3333333-3333-4333-8333-333333333333','v8-remove-outsider@example.invalid'),
  ('f4444444-4444-4444-8444-444444444444','v8-remove-owner@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('f1111111-1111-4111-8111-111111111111','super_admin'),
  ('f2222222-2222-4222-8222-222222222222','operator');
insert into public.profiles(id,auth_user_id,nickname,profile_status) values
  ('f5555555-5555-4555-8555-555555555555',
   'f4444444-4444-4444-8444-444444444444','V8 removal owner','completed');
insert into public.events
  (id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,
   fee_type,status,version) values
  ('f6666666-6666-4666-8666-666666666661',
   'f5555555-5555-4555-8555-555555555555','V8 removal event','private',
   'singles','round_robin',1,'games_4','free','finished',2),
  ('f6666666-6666-4666-8666-666666666662',
   'f5555555-5555-4555-8555-555555555555','V8 other event','public',
   'singles','round_robin',1,'games_4','free','finished',2);
insert into public.event_photos
  (id,event_id,original_url,watermarked_url,uploaded_at,version) values
  ('f7777777-7777-4777-8777-777777777771',
   'f6666666-6666-4666-8666-666666666661',
   'f4444444-4444-4444-8444-444444444444/f6666666-6666-4666-8666-666666666661/original.jpg',
   'f4444444-4444-4444-8444-444444444444/f6666666-6666-4666-8666-666666666661/preview.jpg',
   '2099-01-01 10:00:00+00',3),
  ('f7777777-7777-4777-8777-777777777772',
   'f6666666-6666-4666-8666-666666666662',
   'f4444444-4444-4444-8444-444444444444/f6666666-6666-4666-8666-666666666662/original.jpg',
   'f4444444-4444-4444-8444-444444444444/f6666666-6666-4666-8666-666666666662/preview.jpg',
   '2099-01-01 11:00:00+00',1);

do $test$
declare
  v_super uuid := 'f1111111-1111-4111-8111-111111111111';
  v_operator uuid := 'f2222222-2222-4222-8222-222222222222';
  v_outsider uuid := 'f3333333-3333-4333-8333-333333333333';
  v_event uuid := 'f6666666-6666-4666-8666-666666666661';
  v_other_event uuid := 'f6666666-6666-4666-8666-666666666662';
  v_photo uuid := 'f7777777-7777-4777-8777-777777777771';
  v_other_photo uuid := 'f7777777-7777-4777-8777-777777777772';
  v_request uuid := 'f8888888-8888-4888-8888-888888888888';
  v_reason text := 'Photo violates published event content rules';
  v_result jsonb;
  v_blocked boolean;
begin
  if has_function_privilege('anon',
       'public.platform_admin_remove_event_photo(uuid,uuid,uuid,integer,uuid,text,boolean)', 'EXECUTE')
    or has_function_privilege('authenticated',
       'public.platform_admin_remove_event_photo(uuid,uuid,uuid,integer,uuid,text,boolean)', 'EXECUTE')
    or not has_function_privilege('service_role',
       'public.platform_admin_remove_event_photo(uuid,uuid,uuid,integer,uuid,text,boolean)', 'EXECUTE')
    or has_table_privilege('authenticated','platform_ops.photo_removal_cleanup','SELECT')
    or has_table_privilege('anon','platform_ops.photo_removal_cleanup','SELECT')
  then raise exception 'PHOTO_REMOVE_ACL_LEAK'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_super,v_event,v_photo,3,v_request,v_reason,false);
  exception when others then v_blocked:=(sqlerrm='INVALID_PHOTO_REMOVAL_REQUEST'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_NO_CONFIRM_ALLOWED'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_operator,v_event,v_photo,3,v_request,v_reason,true);
  exception when others then v_blocked:=(sqlerrm='PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_OPERATOR_ALLOWED'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_outsider,v_event,v_photo,3,v_request,v_reason,true);
  exception when others then v_blocked:=(sqlerrm='PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_OUTSIDER_ALLOWED'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_super,v_event,v_photo,2,v_request,v_reason,true);
  exception when others then v_blocked:=(sqlerrm='VERSION_CONFLICT'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_STALE_VERSION_ALLOWED'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_super,v_other_event,v_photo,3,v_request,v_reason,true);
  exception when others then v_blocked:=(sqlerrm='PHOTO_NOT_FOUND'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_CROSS_EVENT_ALLOWED'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_super,v_event,v_photo,3,v_request,'too short',true);
  exception when others then v_blocked:=(sqlerrm='INVALID_ADMIN_REASON'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_SHORT_REASON_ALLOWED'; end if;

  if (select count(*) from public.event_photos where id=v_photo) <> 1
    or exists(select 1 from platform_ops.admin_action_audit where request_id=v_request)
    or exists(select 1 from platform_ops.photo_removal_cleanup where request_id=v_request)
  then raise exception 'PHOTO_REMOVE_FAILED_ATTEMPT_MUTATED'; end if;

  v_result:=public.platform_admin_remove_event_photo(
    v_super,v_event,v_photo,3,v_request,v_reason,true);
  if v_result->>'replayed' <> 'false'
    or v_result->>'cleanup_pending' <> 'true'
    or exists(select 1 from public.event_photos where id=v_photo)
    or (select count(*) from platform_ops.admin_action_audit
        where request_id=v_request and action='PHOTO_REMOVE'
          and actor_auth_user_id=v_super and target_kind='photo'
          and target_id=v_photo::text and reason=v_reason) <> 1
    or (select count(*) from platform_ops.photo_removal_cleanup
        where request_id=v_request and photo_id=v_photo and event_id=v_event
          and source_version=3 and completed_at is null
          and original_path like '%/original.jpg'
          and watermarked_path like '%/preview.jpg') <> 1
    or not exists(select 1 from public.event_photos where id=v_other_photo)
  then raise exception 'PHOTO_REMOVE_ATOMIC_COMMIT_BAD'; end if;

  v_result:=public.platform_admin_remove_event_photo(
    v_super,v_event,v_photo,3,v_request,v_reason,true);
  if v_result->>'replayed' <> 'true'
    or (select count(*) from platform_ops.admin_action_audit where request_id=v_request)<>1
    or (select count(*) from platform_ops.photo_removal_cleanup where request_id=v_request)<>1
  then raise exception 'PHOTO_REMOVE_REPLAY_NOT_IDEMPOTENT'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_super,v_event,v_photo,4,v_request,v_reason,true);
  exception when others then v_blocked:=(sqlerrm='ADMIN_REQUEST_CONFLICT'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_VERSION_REBIND_ALLOWED'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_super,v_other_event,v_other_photo,1,v_request,v_reason,true);
  exception when others then v_blocked:=(sqlerrm='ADMIN_REQUEST_CONFLICT'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_REQUEST_REUSE_ALLOWED'; end if;

  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_super,v_event,v_photo,3,'f9999999-9999-4999-8999-999999999999',v_reason,true);
  exception when others then v_blocked:=(sqlerrm='PHOTO_NOT_FOUND'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_MISSING_AS_NEW_SUCCESS'; end if;

  update platform_ops.admin_members set active=false where auth_user_id=v_super;
  v_blocked:=false;
  begin perform public.platform_admin_remove_event_photo(
    v_super,v_event,v_photo,3,v_request,v_reason,true);
  exception when others then v_blocked:=(sqlerrm='PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN'); end;
  if not v_blocked then raise exception 'PHOTO_REMOVE_REVOKED_REPLAY_ALLOWED'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin photo removal transaction (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin photo removal transaction"
