#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('a1111111-1111-4111-8111-111111111111','it-v8-venue-reviewer@example.invalid'),
  ('a2222222-2222-4222-8222-222222222222','it-v8-venue-super@example.invalid'),
  ('a3333333-3333-4333-8333-333333333333','it-v8-venue-outsider@example.invalid'),
  ('a4444444-4444-4444-8444-444444444444','it-v8-venue-owner@example.invalid');
insert into platform_ops.admin_members(auth_user_id,role) values
  ('a1111111-1111-4111-8111-111111111111','reviewer'),
  ('a2222222-2222-4222-8222-222222222222','super_admin');
insert into public.profiles(id,auth_user_id,nickname,profile_status) values
  ('a5555555-5555-4555-8555-555555555555',
   'a4444444-4444-4444-8444-444444444444','V8 venue candidate owner','completed');
insert into public.events
  (id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,
   fee_type,status,version,venue_name,venue_address,venue_latitude,
   venue_longitude,city,created_at) values
  ('a6666666-6666-4666-8666-666666666661',
   'a5555555-5555-4555-8555-555555555555','V8 private venue A','private',
   'singles','round_robin',1,'games_4','free','signup',3,'Court A','Secret address A',
   39.9,116.4,'Beijing','2099-01-01 00:00:00+00'),
  ('a6666666-6666-4666-8666-666666666662',
   'a5555555-5555-4555-8555-555555555555','V8 public venue B','public',
   'singles','round_robin',1,'games_4','free','ongoing',4,'Court B','Secret address B',
   31.2,121.5,'Shanghai','2099-01-01 00:00:00+00'),
  ('a6666666-6666-4666-8666-666666666663',
   'a5555555-5555-4555-8555-555555555555','V8 older venue','public',
   'singles','round_robin',1,'games_4','free','finished',2,'Court C','Secret address C',
   null,null,'Chengdu','2098-01-01 00:00:00+00'),
  ('a6666666-6666-4666-8666-666666666664',
   'a5555555-5555-4555-8555-555555555555','V8 no venue','public',
   'singles','round_robin',1,'games_4','free','signup',1,null,null,
   null,null,'Beijing','2099-01-01 00:00:00+00'),
  ('a6666666-6666-4666-8666-666666666665',
   'a5555555-5555-4555-8555-555555555555','V8 cancelled venue','public',
   'singles','round_robin',1,'games_4','free','cancelled',1,'Court X',null,
   null,null,'Beijing','2099-01-01 00:00:00+00');

do $test$
declare
  v_reviewer uuid := 'a1111111-1111-4111-8111-111111111111';
  v_super uuid := 'a2222222-2222-4222-8222-222222222222';
  v_page jsonb;
  v_next jsonb;
  v_row jsonb;
  v_blocked boolean;
begin
  if has_function_privilege('anon',
       'public.platform_admin_list_event_venue_candidates(uuid,integer,timestamptz,uuid)','EXECUTE')
    or has_function_privilege('authenticated',
       'public.platform_admin_list_event_venue_candidates(uuid,integer,timestamptz,uuid)','EXECUTE')
    or not has_function_privilege('service_role',
       'public.platform_admin_list_event_venue_candidates(uuid,integer,timestamptz,uuid)','EXECUTE')
  then raise exception 'VENUE_CANDIDATE_GRANT_LEAK'; end if;

  v_page := public.platform_admin_list_event_venue_candidates(v_reviewer, 2);
  if jsonb_array_length(v_page->'items') <> 2
    or v_page->'items'->0->>'event_id' <> 'a6666666-6666-4666-8666-666666666662'
    or v_page->'items'->1->>'event_id' <> 'a6666666-6666-4666-8666-666666666661'
    or jsonb_typeof(v_page->'next_cursor') <> 'object'
  then raise exception 'VENUE_CANDIDATE_PAGE_OR_ORDER_BAD'; end if;
  v_row := v_page->'items'->1;
  if (select count(*) from jsonb_object_keys(v_row)) <> 6
    or not (v_row ?& array['event_id','venue_name','city','event_version',
                            'created_at','verification_status'])
    or v_row->>'verification_status' <> 'not_verified'
    or v_row ?| array['venue_address','venue_latitude','venue_longitude',
                       'venue_place_id','owner_user_id','event_date','visibility']
  then raise exception 'VENUE_CANDIDATE_PRIVATE_FIELD_LEAK'; end if;

  v_next := public.platform_admin_list_event_venue_candidates(
    v_reviewer, 2,
    (v_page->'next_cursor'->>'created_at')::timestamptz,
    (v_page->'next_cursor'->>'event_id')::uuid);
  if jsonb_array_length(v_next->'items') <> 1
    or v_next->'items'->0->>'event_id' <> 'a6666666-6666-4666-8666-666666666663'
    or jsonb_typeof(v_next->'next_cursor') <> 'null'
  then raise exception 'VENUE_CANDIDATE_NEXT_PAGE_BAD'; end if;

  v_blocked := false;
  begin
    perform public.platform_admin_list_event_venue_candidates(
      'a3333333-3333-4333-8333-333333333333', 5);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'VENUE_CANDIDATE_OUTSIDER_ALLOWED'; end if;
  update platform_ops.admin_members set active = false where auth_user_id = v_reviewer;
  v_blocked := false;
  begin perform public.platform_admin_list_event_venue_candidates(v_reviewer, 5);
  exception when others then v_blocked := sqlerrm = 'PLATFORM_ADMIN_FORBIDDEN'; end;
  if not v_blocked then raise exception 'VENUE_CANDIDATE_REVOKED_ALLOWED'; end if;

  v_blocked := false;
  begin perform public.platform_admin_list_event_venue_candidates(v_super, 0);
  exception when others then v_blocked := sqlerrm = 'INVALID_VENUE_CANDIDATE_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'VENUE_CANDIDATE_ZERO_SIZE_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_event_venue_candidates(v_super, 51);
  exception when others then v_blocked := sqlerrm = 'INVALID_VENUE_CANDIDATE_PAGE_SIZE'; end;
  if not v_blocked then raise exception 'VENUE_CANDIDATE_OVERSIZE_ALLOWED'; end if;
  v_blocked := false;
  begin perform public.platform_admin_list_event_venue_candidates(v_super, 5, now(), null);
  exception when others then v_blocked := sqlerrm = 'INVALID_VENUE_CANDIDATE_CURSOR'; end;
  if not v_blocked then raise exception 'VENUE_CANDIDATE_PARTIAL_CURSOR_ALLOWED'; end if;

  if (select count(*) from public.events
      where id::text like 'a6666666-6666-4666-8666-66666666666%') <> 5
  then raise exception 'VENUE_CANDIDATE_READ_CHANGED_EVENTS'; end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"
if [ "$result" != "ok" ]; then
  echo "FAIL: Platform Admin venue candidate permissions/pagination (actual=$result)"
  exit 1
fi
echo "PASS: Platform Admin venue candidate permissions/pagination"
