#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('e1111111-1111-4111-8111-111111111111','it-v8-photo-reviewer@example.invalid'),
  ('e2222222-2222-4222-8222-222222222222','it-v8-photo-operator@example.invalid'),
  ('e3333333-3333-4333-8333-333333333333','it-v8-photo-super@example.invalid'),
  ('e4444444-4444-4444-8444-444444444444','it-v8-photo-outsider@example.invalid'),
  ('e5555555-5555-4555-8555-555555555555','it-v8-photo-owner@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('e1111111-1111-4111-8111-111111111111','reviewer'),
  ('e2222222-2222-4222-8222-222222222222','operator'),
  ('e3333333-3333-4333-8333-333333333333','super_admin');
insert into public.profiles(id,auth_user_id,nickname,profile_status) values
  ('e6666666-6666-4666-8666-666666666666',
   'e5555555-5555-4555-8555-555555555555','V8 photo directory owner','completed');
insert into public.events
  (id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,
   fee_type,status,version) values
  ('e7777777-7777-4777-8777-777777777771',
   'e6666666-6666-4666-8666-666666666666','V8 private photo event','private',
   'singles','round_robin',1,'games_4','free','finished',2),
  ('e7777777-7777-4777-8777-777777777772',
   'e6666666-6666-4666-8666-666666666666','V8 other photo event','public',
   'singles','round_robin',1,'games_4','free','finished',2);
insert into public.event_photos
  (id,event_id,original_url,watermarked_url,uploaded_at,version) values
  ('e8888888-8888-4888-8888-888888888891',
   'e7777777-7777-4777-8777-777777777771','private/first-original','private/first-preview',
   '2099-01-01 10:00:00+00',1),
  ('e8888888-8888-4888-8888-888888888892',
   'e7777777-7777-4777-8777-777777777771','private/second-original','private/second-preview',
   '2099-01-01 10:00:00+00',2),
  ('e8888888-8888-4888-8888-888888888893',
   'e7777777-7777-4777-8777-777777777771','private/third-original','private/third-preview',
   '2099-01-01 09:00:00+00',3),
  ('e8888888-8888-4888-8888-888888888894',
   'e7777777-7777-4777-8777-777777777772','public/other-original','public/other-preview',
   '2099-01-01 11:00:00+00',4);

do $test$
declare
  v_reviewer uuid := 'e1111111-1111-4111-8111-111111111111';
  v_operator uuid := 'e2222222-2222-4222-8222-222222222222';
  v_super uuid := 'e3333333-3333-4333-8333-333333333333';
  v_private uuid := 'e7777777-7777-4777-8777-777777777771';
  v_other uuid := 'e7777777-7777-4777-8777-777777777772';
  v_page jsonb;
  v_next jsonb;
  v_row jsonb;
  v_blocked boolean;
begin
  if has_function_privilege('anon',
       'public.platform_admin_list_event_photo_metadata(uuid,uuid,integer,timestamptz,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated',
       'public.platform_admin_list_event_photo_metadata(uuid,uuid,integer,timestamptz,uuid)', 'EXECUTE')
    or not has_function_privilege('service_role',
       'public.platform_admin_list_event_photo_metadata(uuid,uuid,integer,timestamptz,uuid)', 'EXECUTE')
  then raise exception 'PHOTO_DIRECTORY_RPC_GRANT_LEAK'; end if;

  v_page := public.platform_admin_list_event_photo_metadata(v_reviewer,v_private,2);
  if jsonb_array_length(v_page->'items') <> 2
    or v_page->'items'->0->>'id' <> 'e8888888-8888-4888-8888-888888888892'
    or v_page->'items'->1->>'id' <> 'e8888888-8888-4888-8888-888888888891'
    or jsonb_typeof(v_page->'next_cursor') <> 'object'
  then raise exception 'PHOTO_DIRECTORY_PAGE_OR_TIEBREAK_BAD'; end if;
  v_row := v_page->'items'->0;
  if (select count(*) from jsonb_object_keys(v_row)) <> 4
    or not (v_row ?& array['id','event_id','version','uploaded_at'])
    or v_row ?| array['original_url','watermarked_url','signed_url','owner_user_id','profile_id']
  then raise exception 'PHOTO_DIRECTORY_PRIVATE_FIELD_LEAK'; end if;

  v_next := public.platform_admin_list_event_photo_metadata(
    v_reviewer,v_private,2,
    (v_page->'next_cursor'->>'uploaded_at')::timestamptz,
    (v_page->'next_cursor'->>'id')::uuid);
  if jsonb_array_length(v_next->'items') <> 1
    or v_next->'items'->0->>'id' <> 'e8888888-8888-4888-8888-888888888893'
    or jsonb_typeof(v_next->'next_cursor') <> 'null'
  then raise exception 'PHOTO_DIRECTORY_NEXT_PAGE_BAD'; end if;
  v_page := public.platform_admin_list_event_photo_metadata(v_operator,v_other,10);
  if jsonb_array_length(v_page->'items') <> 1
    or v_page->'items'->0->>'id' <> 'e8888888-8888-4888-8888-888888888894'
  then raise exception 'PHOTO_DIRECTORY_CROSS_EVENT_LEAK'; end if;
  v_page := public.platform_admin_list_event_photo_metadata(
    v_super,'e7777777-7777-4777-8777-777777777779',10);
  if jsonb_array_length(v_page->'items') <> 0
  then raise exception 'PHOTO_DIRECTORY_MISSING_EVENT_LEAK'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_list_event_photo_metadata(
      'e4444444-4444-4444-8444-444444444444',v_private);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'PHOTO_DIRECTORY_OUTSIDER_ALLOWED'; end if;
  update platform_ops.admin_members set active=false where auth_user_id=v_reviewer;
  v_blocked := false;
  begin perform public.platform_admin_list_event_photo_metadata(v_reviewer,v_private);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'PHOTO_DIRECTORY_REVOKED_ALLOWED'; end if;

  v_blocked := false;
  begin perform public.platform_admin_list_event_photo_metadata(v_super,null);
  exception when others then v_blocked := sqlerrm = 'INVALID_PHOTO_EVENT'; end;
  if not v_blocked then raise exception 'PHOTO_DIRECTORY_NULL_EVENT_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_event_photo_metadata(v_super,v_private,0);
  exception when others then v_blocked := sqlerrm = 'INVALID_PHOTO_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'PHOTO_DIRECTORY_ZERO_PAGE_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_event_photo_metadata(v_super,v_private,51);
  exception when others then v_blocked := sqlerrm = 'INVALID_PHOTO_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'PHOTO_DIRECTORY_OVERSIZE_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_event_photo_metadata(v_super,v_private,10,now(),null);
  exception when others then v_blocked := sqlerrm = 'INVALID_PHOTO_CURSOR'; end;
  if not v_blocked then raise exception 'PHOTO_DIRECTORY_PARTIAL_CURSOR_ALLOWED'; end if;
  if (select count(*) from public.event_photos
      where id::text like 'e8888888-8888-4888-8888-88888888889%') <> 4
  then raise exception 'PHOTO_DIRECTORY_READ_CHANGED_PHOTOS'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin photo directory permission/pagination contract (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin photo directory permission/pagination contract"
