create or replace function public.accept_player_claim_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  inv public.player_claim_invites;
  source_player public.players;
  target_player public.players;
  conflict_count integer;
begin
  select * into me from public.profiles where auth_user_id = auth.uid();
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
$$;
