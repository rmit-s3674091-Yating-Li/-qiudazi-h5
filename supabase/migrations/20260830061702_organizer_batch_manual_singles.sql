create or replace function public.join_event_manual_batch(p_event_id uuid, p_player_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.events;
  me uuid:=public.current_profile_id();
  confirmed integer;
  remaining integer;
  pid uuid;
  inserted public.entries;
  result jsonb:='[]'::jsonb;
begin
  if me is null or not exists(select 1 from public.profiles where id=me and profile_status='completed') then raise exception 'PROFILE_REQUIRED'; end if;
  select * into e from public.events where id=p_event_id for update;
  if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if e.owner_user_id<>me then raise exception 'FORBIDDEN'; end if;
  if e.match_type<>'singles' then raise exception 'SINGLES_ONLY'; end if;
  if not public.event_registration_open(e) then raise exception 'REGISTRATION_CLOSED'; end if;
  if cardinality(p_player_ids) is null or cardinality(p_player_ids)=0 or array_position(p_player_ids,null) is not null then raise exception 'ENTRY_SIZE'; end if;
  if (select count(distinct x) from unnest(p_player_ids)x)<>cardinality(p_player_ids) then raise exception 'DUPLICATE_PLAYER'; end if;
  if (select count(*) from public.players where id=any(p_player_ids) and owner_user_id=me and player_type='manual' and linked_user_id is null)<>cardinality(p_player_ids) then raise exception 'PLAYER_FORBIDDEN'; end if;
  if exists(select 1 from public.entry_players where event_id=p_event_id and active and player_id=any(p_player_ids)) then raise exception 'DUPLICATE_PLAYER'; end if;
  select count(*) into confirmed from public.entries where event_id=p_event_id and status='confirmed';
  if e.entry_limit is not null then
    remaining:=greatest(e.entry_limit-confirmed,0);
    if cardinality(p_player_ids)>remaining then raise exception 'CONFIRMED_CAPACITY_EXCEEDED'; end if;
  end if;
  foreach pid in array p_player_ids loop
    inserted:=public.join_event(p_event_id,array[pid],null,true);
    if inserted.status<>'confirmed' then raise exception 'CONFIRMED_CAPACITY_EXCEEDED'; end if;
    result:=result||jsonb_build_array(to_jsonb(inserted));
  end loop;
  return result;
end
$$;

revoke all on function public.join_event_manual_batch(uuid,uuid[]) from public,anon;
grant execute on function public.join_event_manual_batch(uuid,uuid[]) to authenticated,service_role;
