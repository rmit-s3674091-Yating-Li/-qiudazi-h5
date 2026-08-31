create or replace function public.create_player_claim_invite(p_player_id uuid)
returns table(token uuid, player_id uuid, player_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me public.profiles;
  p public.players;
  existing public.player_claim_invites;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  if me.id is null or me.profile_status <> 'completed' then raise exception 'PROFILE_REQUIRED'; end if;

  select * into p from public.players where id = p_player_id;
  if p.id is null or p.owner_user_id <> me.id or p.player_type <> 'manual' or p.linked_user_id is not null then
    raise exception 'PLAYER_FORBIDDEN';
  end if;

  select * into existing
  from public.player_claim_invites
  where player_claim_invites.player_id = p.id and status = 'pending'
  order by created_at desc
  limit 1;

  if existing.id is null then
    insert into public.player_claim_invites(player_id, inviter_user_id, player_name_snapshot)
    values (p.id, me.id, p.name)
    returning * into existing;
  end if;

  return query select existing.token, p.id, p.name;
end;
$function$;

create or replace function public.get_player_claim_invite(p_token uuid)
returns table(token uuid, player_name text, inviter_nickname text, inviter_avatar_url text, invite_status text, is_self_inviter boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  if me.id is null or me.profile_status <> 'completed' then raise exception 'PROFILE_REQUIRED'; end if;

  return query
  select i.token,
         i.player_name_snapshot,
         inviter.nickname,
         inviter.avatar_url,
         i.status,
         i.inviter_user_id = me.id
  from public.player_claim_invites i
  join public.profiles inviter on inviter.id = i.inviter_user_id
  where i.token = p_token;
end;
$function$;

create or replace function public.accept_player_claim_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me public.profiles;
  inv public.player_claim_invites;
  source_player public.players;
  target_player public.players;
  conflict_count integer;
begin
  select * into me from public.profiles where id = public.current_profile_id();
  if me.id is null or me.profile_status <> 'completed' then raise exception 'PROFILE_REQUIRED'; end if;

  select * into inv from public.player_claim_invites where token = p_token for update;
  if inv.id is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if inv.status = 'accepted' and inv.claimed_by_user_id = me.id then
    return jsonb_build_object('status','accepted');
  end if;
  if inv.status <> 'pending' then raise exception 'INVITE_CLOSED'; end if;
  if inv.inviter_user_id = me.id then raise exception 'SELF_INVITE'; end if;

  select * into source_player from public.players where id = inv.player_id for update;
  if source_player.id is null or source_player.player_type <> 'manual' or source_player.linked_user_id is not null then
    raise exception 'PLAYER_ALREADY_CLAIMED';
  end if;

  select * into target_player
  from public.players
  where linked_user_id = me.id and player_type = 'self'
  for update;
  if target_player.id is null then raise exception 'SELF_PLAYER_REQUIRED'; end if;

  select count(*) into conflict_count
  from (
    select distinct ep1.event_id
    from public.entry_players ep1
    join public.entry_players ep2 on ep2.event_id = ep1.event_id
    where ep1.player_id = source_player.id
      and ep2.player_id = target_player.id
      and ep1.active and ep2.active
  ) conflicts;
  if conflict_count > 0 then raise exception 'PLAYER_CLAIM_CONFLICT'; end if;

  update public.entry_players
  set player_id = target_player.id
  where player_id = source_player.id;

  update public.players
  set level = coalesce(target_player.level, source_player.level),
      city = coalesce(target_player.city, source_player.city),
      play_times = case when cardinality(target_player.play_times) = 0 then source_player.play_times else target_player.play_times end,
      play_preference = coalesce(target_player.play_preference, source_player.play_preference),
      version = target_player.version + 1
  where id = target_player.id;

  update public.player_claim_invites
  set status = 'accepted', claimed_by_user_id = me.id, responded_at = now()
  where id = inv.id;

  update public.player_claim_invites
  set status = 'cancelled', responded_at = now()
  where player_id = source_player.id and id <> inv.id and status = 'pending';

  perform public.accept_connection_invite(inv.inviter_user_id);

  delete from public.players where id = source_player.id;

  return jsonb_build_object('status','accepted','player_id',target_player.id);
end;
$function$;
