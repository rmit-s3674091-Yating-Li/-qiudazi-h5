#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-54322}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1 -At)

result="$("${PSQL[@]}" <<'SQL' | grep -E '^(ok|bad)$' | tail -n 1
begin;
insert into auth.users(id,email) values
  ('81111111-1111-4111-8111-111111111111','it-v8-quick-group@example.invalid');
insert into public.profiles(id,auth_user_id,nickname,avatar_url,profile_status,public_code)
values ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','81111111-1111-4111-8111-111111111111','IT V8 quick group',null,'completed','ITV8QG01');
insert into public.players(id,owner_user_id,linked_user_id,name,avatar_url,player_type) values
  ('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IT quick owner',null,'self'),
  ('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',null,'IT quick temp 2',null,'manual'),
  ('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',null,'IT quick temp 3',null,'manual'),
  ('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4','8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',null,'IT quick temp 4',null,'manual');
select set_config('request.jwt.claim.sub','81111111-1111-4111-8111-111111111111',true);

do $$
declare
  config jsonb := jsonb_build_object('name','IT V8 quick group','match_type','singles','format','group_knockout','scoring_type','games_4','group_count',2,'qualifiers_per_group',1);
  roster jsonb := jsonb_build_array(
    jsonb_build_array('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::text),
    jsonb_build_array('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::text),
    jsonb_build_array('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'::text),
    jsonb_build_array('8bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'::text)
  );
  ev public.events;
  blocked boolean;
begin
  ev:=public.create_quick_event(config,roster);
  if ev.format<>'group_knockout' or ev.group_count<>2 or ev.qualifiers_per_group<>1
    or ev.event_mode<>'quick' or ev.status<>'locked' or ev.visibility<>'public' or ev.city<>''
    or (select count(*) from public.entries where event_id=ev.id and status='confirmed')<>4
  then raise exception 'QUICK_GROUP_PERSISTENCE_BAD'; end if;

  -- Standard event parity: a single round-robin group may advance >=2 entries.
  ev:=public.create_quick_event(config||'{"group_count":1,"qualifiers_per_group":2}'::jsonb,roster);
  if ev.group_count<>1 or ev.qualifiers_per_group<>2
    or (select count(*) from public.entries where event_id=ev.id and status='confirmed')<>4
  then raise exception 'QUICK_SINGLE_GROUP_PERSISTENCE_BAD'; end if;
  ev:=public.create_quick_event(config||'{"group_count":1,"qualifiers_per_group":2}'::jsonb,
    jsonb_build_array(roster->0,roster->1,roster->2));
  if ev.group_count<>1 or ev.entry_limit<>3 then raise exception 'QUICK_SINGLE_GROUP_THREE_ENTRIES_BAD'; end if;

  blocked:=false;
  begin perform public.create_quick_event(config||'{"group_count":1,"qualifiers_per_group":1}'::jsonb,roster);
  exception when others then blocked:=(sqlerrm='GROUP_CONFIG'); end;
  if not blocked then raise exception 'QUICK_SINGLE_GROUP_ONE_QUALIFIER_ACCEPTED'; end if;

  blocked:=false;
  begin perform public.create_quick_event(config||'{"group_count":0}'::jsonb,roster);
  exception when others then blocked:=(sqlerrm='GROUP_CONFIG'); end;
  if not blocked then raise exception 'QUICK_GROUP_ZERO_GROUP_NOT_VALIDATED'; end if;

  blocked:=false;
  begin perform public.create_quick_event(config||'{"qualifiers_per_group":2}'::jsonb,roster);
  exception when others then blocked:=(sqlerrm='GROUP_CONFIG'); end;
  if not blocked then raise exception 'QUICK_GROUP_TOO_MANY_QUALIFIERS_ACCEPTED'; end if;

  blocked:=false;
  begin perform public.create_quick_event(config - 'group_count',roster);
  exception when others then blocked:=(sqlerrm='GROUP_CONFIG'); end;
  if not blocked then raise exception 'QUICK_GROUP_MISSING_CONFIG_ACCEPTED'; end if;

  blocked:=false;
  begin perform public.create_quick_event(config||'{"group_count":"1.5"}'::jsonb,roster);
  exception when others then blocked:=(sqlerrm='GROUP_CONFIG'); end;
  if not blocked then raise exception 'QUICK_GROUP_NON_INTEGER_ACCEPTED'; end if;

  blocked:=false;
  begin perform public.create_quick_event(config,jsonb_build_array(roster->0,roster->1,roster->2));
  exception when others then blocked:=(sqlerrm='GROUP_CONFIG'); end;
  if not blocked then raise exception 'QUICK_GROUP_TOO_FEW_ENTRIES_ACCEPTED'; end if;

  ev:=public.create_quick_event(jsonb_build_object('name','IT V8 quick legacy round','match_type','singles','format','round_robin','scoring_type','games_4'),roster);
  if ev.format<>'round_robin' or ev.group_count is not null or ev.qualifiers_per_group is not null then
    raise exception 'QUICK_GROUP_LEGACY_ROUND_REGRESSION'; end if;
  ev:=public.create_quick_event(jsonb_build_object('name','IT V8 quick legacy knockout','match_type','singles','format','knockout','scoring_type','games_4'),roster);
  if ev.format<>'knockout' or ev.group_count is not null or ev.qualifiers_per_group is not null then
    raise exception 'QUICK_GROUP_LEGACY_KNOCKOUT_REGRESSION'; end if;
end $$;
select 'ok';
rollback;
SQL
)"

if [ "$result" != "ok" ]; then
  echo "FAIL: V8 quick group + knockout creation and guard contract (actual=$result)"
  exit 1
fi

echo "PASS: V8 quick group + knockout creation and guard contract"
