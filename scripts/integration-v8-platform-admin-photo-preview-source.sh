#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('f1111111-1111-4111-8111-111111111111','it-v8-photo-preview-reviewer@example.invalid'),
  ('f2222222-2222-4222-8222-222222222222','it-v8-photo-preview-operator@example.invalid'),
  ('f3333333-3333-4333-8333-333333333333','it-v8-photo-preview-super@example.invalid'),
  ('f4444444-4444-4444-8444-444444444444','it-v8-photo-preview-outsider@example.invalid'),
  ('f5555555-5555-4555-8555-555555555555','it-v8-photo-preview-owner@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('f1111111-1111-4111-8111-111111111111','reviewer'),
  ('f2222222-2222-4222-8222-222222222222','operator'),
  ('f3333333-3333-4333-8333-333333333333','super_admin');
insert into public.profiles(id,auth_user_id,nickname,profile_status) values
  ('f6666666-6666-4666-8666-666666666666',
   'f5555555-5555-4555-8555-555555555555','V8 preview fixture owner','completed');
insert into public.events
  (id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,
   fee_type,status,version) values
  ('f7777777-7777-4777-8777-777777777770',
   'f6666666-6666-4666-8666-666666666666','V8 preview private event','private',
   'singles','round_robin',1,'games_4','free','finished',2),
  ('f7777777-7777-4777-8777-777777777771',
   'f6666666-6666-4666-8666-666666666666','V8 preview second event','private',
   'singles','round_robin',1,'games_4','free','finished',2);
insert into public.event_photos
  (id,event_id,original_url,watermarked_url,version) values
  ('f8888888-8888-4888-8888-888888888888',
   'f7777777-7777-4777-8777-777777777770',
   'owner/event/private-original.jpg','owner/event/watermarked-preview.jpg',3);

do $test$
declare
  v_reviewer uuid := 'f1111111-1111-4111-8111-111111111111';
  v_operator uuid := 'f2222222-2222-4222-8222-222222222222';
  v_super uuid := 'f3333333-3333-4333-8333-333333333333';
  v_event uuid := 'f7777777-7777-4777-8777-777777777770';
  v_photo uuid := 'f8888888-8888-4888-8888-888888888888';
  v_result jsonb;
  v_blocked boolean;
begin
  if has_function_privilege('anon',
       'public.platform_admin_get_photo_preview_source(uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated',
       'public.platform_admin_get_photo_preview_source(uuid,uuid,uuid)','EXECUTE')
    or not has_function_privilege('service_role',
       'public.platform_admin_get_photo_preview_source(uuid,uuid,uuid)','EXECUTE')
  then raise exception 'PHOTO_PREVIEW_RPC_ACL_LEAK'; end if;

  v_result := public.platform_admin_get_photo_preview_source(v_reviewer,v_event,v_photo);
  if v_result->>'watermarked_path' <> 'owner/event/watermarked-preview.jpg'
    or v_result->>'photo_id' <> v_photo::text
    or (v_result->>'version')::integer <> 3
    or v_result ? 'original_url'
    or v_result ? 'original_path'
    or v_result ? 'signed_url'
  then raise exception 'PHOTO_PREVIEW_RESPONSE_UNSAFE'; end if;

  v_result := public.platform_admin_get_photo_preview_source(v_operator,v_event,v_photo);
  if v_result->>'watermarked_path' <> 'owner/event/watermarked-preview.jpg'
  then raise exception 'PHOTO_PREVIEW_OPERATOR_DENIED'; end if;
  v_result := public.platform_admin_get_photo_preview_source(v_super,v_event,v_photo);
  if v_result->>'watermarked_path' <> 'owner/event/watermarked-preview.jpg'
  then raise exception 'PHOTO_PREVIEW_SUPER_DENIED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_get_photo_preview_source(
      'f4444444-4444-4444-8444-444444444444',v_event,v_photo);
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'PHOTO_PREVIEW_OUTSIDER_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_get_photo_preview_source(
      v_reviewer,'f7777777-7777-4777-8777-777777777771',v_photo);
  exception when others then v_blocked := sqlerrm='PHOTO_NOT_FOUND'; end;
  if not v_blocked then raise exception 'PHOTO_PREVIEW_CROSS_EVENT_ALLOWED'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_get_photo_preview_source(v_reviewer,v_event,null);
  exception when others then v_blocked := sqlerrm='INVALID_PHOTO_PREVIEW_REQUEST'; end;
  if not v_blocked then raise exception 'PHOTO_PREVIEW_NULL_ID_ALLOWED'; end if;

  update platform_ops.admin_members set active=false where auth_user_id=v_reviewer;
  v_blocked := false;
  begin
    perform public.platform_admin_get_photo_preview_source(v_reviewer,v_event,v_photo);
  exception when others then v_blocked := sqlerrm='PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'PHOTO_PREVIEW_REVOKED_ALLOWED'; end if;

  if (select count(*) from public.event_photos where id=v_photo and version=3)<>1
    or (select count(*) from platform_ops.admin_action_audit
        where action='PHOTO_REMOVE' and target_id=v_photo::text)<>0
  then raise exception 'PHOTO_PREVIEW_READ_MUTATED_DATA'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin photo preview source contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin photo preview source contract"
