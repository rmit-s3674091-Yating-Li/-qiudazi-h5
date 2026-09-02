create or replace function public.list_my_player_claim_invites()
returns table(
  id uuid,
  token uuid,
  player_id uuid,
  player_name text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.token, i.player_id, i.player_name_snapshot, i.status, i.created_at, i.responded_at
  from public.player_claim_invites i
  where i.inviter_user_id = public.current_profile_id()
  order by i.created_at desc;
$$;

create or replace function public.cancel_player_claim_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.player_claim_invites
  set status = 'cancelled', responded_at = now()
  where id = p_invite_id
    and inviter_user_id = public.current_profile_id()
    and status = 'pending';
end;
$$;

revoke all on function public.list_my_player_claim_invites() from public, anon;
grant execute on function public.list_my_player_claim_invites() to authenticated;
revoke all on function public.cancel_player_claim_invite(uuid) from public, anon;
grant execute on function public.cancel_player_claim_invite(uuid) to authenticated;
