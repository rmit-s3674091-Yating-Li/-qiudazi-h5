create or replace function public.clear_cancelled_partner_invites()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid:=public.current_profile_id();
  v_connection_count integer:=0;
  v_claim_count integer:=0;
begin
  if v_me is null then raise exception 'PROFILE_REQUIRED'; end if;

  delete from public.connection_invites
  where inviter_user_id=v_me
    and status='cancelled';
  get diagnostics v_connection_count = row_count;

  delete from public.player_claim_invites
  where inviter_user_id=v_me
    and status='cancelled';
  get diagnostics v_claim_count = row_count;

  return jsonb_build_object(
    'connection_invites',v_connection_count,
    'claim_invites',v_claim_count,
    'total',v_connection_count+v_claim_count
  );
end;
$$;

revoke all on function public.clear_cancelled_partner_invites() from public, anon;
grant execute on function public.clear_cancelled_partner_invites() to authenticated;
