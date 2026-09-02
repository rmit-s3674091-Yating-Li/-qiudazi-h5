#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -Atc)

result="$("${PSQL[@]}" "begin;
  insert into auth.users(id,email)
  values
    ('51111111-1111-4111-8111-111111111111','it-photo-copy-owner@example.invalid'),
    ('52222222-2222-4222-8222-222222222222','it-photo-copy-participant@example.invalid');

  insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code)
  values
    ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','51111111-1111-4111-8111-111111111111','IT photo copy owner',null,'completed','ITPHCP01'),
    ('5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','52222222-2222-4222-8222-222222222222','IT photo copy participant',null,'completed','ITPHCP02');

  insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,tiebreak_trigger,fee_type,city,status,version)
  values ('5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT photo copy','private','singles','knockout',1,'games_4',3,'free','Test City','finished',1);

  insert into public.event_photos(id,event_id,original_url,watermarked_url,version,event_visible)
  values ('5fffffff-ffff-4fff-8fff-fffffffffff1','5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','source/it/original.jpg','source/it/preview.jpg',1,true);

  insert into public.participant_album_photos(
    id,profile_id,source_event_photo_id,source_event_id,event_name_snapshot,event_date_snapshot,original_url,watermarked_url
  ) values (
    '5ddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '5fffffff-ffff-4fff-8fff-fffffffffff1',
    '5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
    'IT photo copy',null,
    'personal/5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/original.jpg',
    'personal/5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/preview.jpg'
  );

  select set_config('request.jwt.claim.sub','51111111-1111-4111-8111-111111111111',true);
  select (public.delete_event_photo_metadata('5fffffff-ffff-4fff-8fff-fffffffffff1',1)).id;

  select case
    when not exists (
      select 1 from public.event_photos where id='5fffffff-ffff-4fff-8fff-fffffffffff1'
    )
    and exists (
      select 1
      from public.participant_album_photos
      where id='5ddddddd-dddd-4ddd-8ddd-ddddddddddd1'
        and source_event_photo_id is null
        and source_event_id='5eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
        and original_url='personal/5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/original.jpg'
        and watermarked_url='personal/5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/preview.jpg'
    )
    then 'ok' else 'bad' end;
  rollback;" | grep -E '^(ok|bad)$' | tail -n 1)"

if [ "$result" != "ok" ]; then
  echo "FAIL: source event-photo deletion must preserve independent participant personal copy (actual=$result)"
  exit 1
fi

echo "PASS: source event-photo deletion preserves independent participant personal copy"
