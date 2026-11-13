#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('a1111111-1111-4111-8111-111111111111','it-v8-scoring-owner@example.invalid'),
  ('a2222222-2222-4222-8222-222222222222','it-v8-scoring-player@example.invalid');
insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code) values
  ('a3333333-3333-4333-8333-333333333333','a1111111-1111-4111-8111-111111111111','IT V8 score owner',null,'completed','ITV8SA01'),
  ('a4444444-4444-4444-8444-444444444444','a2222222-2222-4222-8222-222222222222','IT V8 score player',null,'completed','ITV8SA02');
insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type) values
  ('a5555555-5555-4555-8555-555555555555','a3333333-3333-4333-8333-333333333333','a3333333-3333-4333-8333-333333333333','IT active owner',null,'self'),
  ('a6666666-6666-4666-8666-666666666666','a4444444-4444-4444-8444-444444444444','a4444444-4444-4444-8444-444444444444','IT inactive player',null,'self');
insert into public.events(id,owner_user_id,name,visibility,match_type,format,best_of,scoring_type,fee_type,status,version,draw_generated)
values ('a7777777-7777-4777-8777-777777777777','a3333333-3333-4333-8333-333333333333',
  'IT V8 active membership snapshot','public','singles','knockout',1,'games_4','free','ongoing',1,true);
insert into public.entries(id,event_id,entry_type,status) values
  ('a8888888-8888-4888-8888-888888888888','a7777777-7777-4777-8777-777777777777','singles','confirmed'),
  ('a9999999-9999-4999-8999-999999999999','a7777777-7777-4777-8777-777777777777','singles','confirmed');
insert into public.entry_players(entry_id,event_id,player_id,slot,active) values
  ('a8888888-8888-4888-8888-888888888888','a7777777-7777-4777-8777-777777777777','a5555555-5555-4555-8555-555555555555',1,true),
  ('a9999999-9999-4999-8999-999999999999','a7777777-7777-4777-8777-777777777777','a6666666-6666-4666-8666-666666666666',1,false);

do $test$
declare
  owner_snapshot jsonb;
  actor_snapshot jsonb;
  participant_snapshot jsonb;
  blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
  owner_snapshot := public.get_event_snapshot('a7777777-7777-4777-8777-777777777777');
  actor_snapshot := public.get_event_snapshot_for_actor('a7777777-7777-4777-8777-777777777777',
    'a1111111-1111-4111-8111-111111111111');

  if owner_snapshot->>'viewer_role' <> 'owner'
    or actor_snapshot->>'viewer_role' <> 'owner'
    or jsonb_array_length(owner_snapshot->'entries') <> 2
    or (select count(*) from jsonb_array_elements(owner_snapshot->'entries') en,
        jsonb_array_elements(en->'players') p where p->>'active'='true') <> 1
    or (select count(*) from jsonb_array_elements(owner_snapshot->'entries') en,
        jsonb_array_elements(en->'players') p where p->>'active'='false') <> 1
    or (select count(*) from jsonb_array_elements(actor_snapshot->'entries') en,
        jsonb_array_elements(en->'players') p where p->>'active'='false') <> 1
  then raise exception 'ACTIVE_PLAYER_SNAPSHOT_MISSING_OR_INCORRECT'; end if;

  perform set_config('request.jwt.claim.sub','a2222222-2222-4222-8222-222222222222',true);
  participant_snapshot := public.get_event_snapshot('a7777777-7777-4777-8777-777777777777');
  if participant_snapshot->>'viewer_role' <> 'viewer' then
    raise exception 'INACTIVE_PLAYER_GRANTED_PARTICIPANT_ROLE';
  end if;
  begin
    perform public.get_event_snapshot_for_actor('a7777777-7777-4777-8777-777777777777',
      'a2222222-2222-4222-8222-222222222222');
  exception when others then blocked := (sqlerrm='FORBIDDEN'); end;
  if not blocked then raise exception 'ACTOR_SNAPSHOT_OWNER_GUARD_REGRESSION'; end if;

  update public.entry_players set active=true where player_id='a6666666-6666-4666-8666-666666666666';
  participant_snapshot := public.get_event_snapshot('a7777777-7777-4777-8777-777777777777');
  if participant_snapshot->>'viewer_role' <> 'participant' then
    raise exception 'ACTIVE_PLAYER_PARTICIPANT_ROLE_MISSING';
  end if;
  if has_function_privilege('authenticated', 'public.get_event_snapshot_for_actor(uuid,uuid)', 'EXECUTE') then
    raise exception 'ACTOR_SNAPSHOT_EXECUTE_PRIVILEGE_LEAK';
  end if;
end;
$test$;
select 'ok';
rollback;
SQL
)"

if [ "$result" != "ok" ]; then
  echo "FAIL: V8 active player snapshot and participant eligibility contract (actual=$result)"
  exit 1
fi

echo "PASS: V8 active player snapshot and participant eligibility contract"
