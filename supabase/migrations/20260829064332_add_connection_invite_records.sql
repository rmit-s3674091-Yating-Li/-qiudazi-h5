create table if not exists public.connection_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  accepted_by_user_id uuid null references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz null
);

alter table public.connection_invites enable row level security;

create or replace function public.create_connection_invite()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid:=public.current_profile_id();
  v_row public.connection_invites%rowtype;
begin
  if v_me is null then raise exception 'PROFILE_REQUIRED'; end if;
  insert into public.connection_invites(inviter_user_id) values(v_me) returning * into v_row;
  return jsonb_build_object('id',v_row.id,'token',v_row.token,'status',v_row.status,'created_at',v_row.created_at);
end $$;

create or replace function public.get_connection_invite_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid:=public.current_profile_id();
  v_inv public.connection_invites%rowtype;
  v_profile public.profiles%rowtype;
  v_relationship text:='none';
begin
  if v_me is null then raise exception 'PROFILE_REQUIRED'; end if;
  select * into v_inv from public.connection_invites where token=p_token;
  if not found then return null; end if;
  if v_inv.status='pending' and v_inv.created_at < now()-interval '30 days' then
    update public.connection_invites set status='expired',responded_at=coalesce(responded_at,now()) where id=v_inv.id;
    v_inv.status:='expired';
  end if;
  select * into v_profile from public.profiles where id=v_inv.inviter_user_id;
  if v_inv.inviter_user_id=v_me then v_relationship:='self';
  elsif exists(select 1 from public.connections c where c.status='accepted' and ((c.requester_user_id=v_inv.inviter_user_id and c.addressee_user_id=v_me) or (c.requester_user_id=v_me and c.addressee_user_id=v_inv.inviter_user_id))) then v_relationship:='accepted';
  end if;
  return jsonb_build_object('invite_id',v_inv.id,'inviter_id',v_inv.inviter_user_id,'nickname',v_profile.nickname,'avatar_url',v_profile.avatar_url,'invite_status',v_inv.status,'relationship_status',v_relationship);
end $$;

create or replace function public.accept_connection_invite_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid:=public.current_profile_id();
  v_inv public.connection_invites%rowtype;
  v_connection jsonb;
begin
  if v_me is null then raise exception 'PROFILE_REQUIRED'; end if;
  select * into v_inv from public.connection_invites where token=p_token for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inv.inviter_user_id=v_me then raise exception 'CANNOT_CONNECT_SELF'; end if;
  if v_inv.status='pending' and v_inv.created_at < now()-interval '30 days' then
    update public.connection_invites set status='expired',responded_at=now() where id=v_inv.id;
    raise exception 'INVITE_EXPIRED';
  end if;
  if v_inv.status='cancelled' or v_inv.status='expired' then raise exception 'INVITE_UNAVAILABLE'; end if;
  if v_inv.status='accepted' and v_inv.accepted_by_user_id is distinct from v_me then raise exception 'INVITE_ALREADY_USED'; end if;
  v_connection:=public.accept_connection_invite(v_inv.inviter_user_id);
  update public.connection_invites set status='accepted',accepted_by_user_id=v_me,responded_at=coalesce(responded_at,now()) where id=v_inv.id;
  return v_connection;
end $$;

create or replace function public.cancel_connection_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
as $$
declare v_me uuid:=public.current_profile_id();
begin
  if v_me is null then raise exception 'PROFILE_REQUIRED'; end if;
  update public.connection_invites set status='cancelled',responded_at=now() where id=p_invite_id and inviter_user_id=v_me and status='pending';
end $$;

create or replace function public.list_my_connection_invites()
returns jsonb
language sql
security definer
set search_path='public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ci.id,'token',ci.token,'status',case when ci.status='pending' and ci.created_at < now()-interval '30 days' then 'expired' else ci.status end,
    'created_at',ci.created_at,'responded_at',ci.responded_at,
    'accepted_by_nickname',p.nickname,'accepted_by_avatar_url',p.avatar_url
  ) order by ci.created_at desc),'[]'::jsonb)
  from public.connection_invites ci
  left join public.profiles p on p.id=ci.accepted_by_user_id
  where ci.inviter_user_id=public.current_profile_id();
$$;

revoke all on function public.create_connection_invite() from public,anon;
revoke all on function public.get_connection_invite_by_token(uuid) from public,anon;
revoke all on function public.accept_connection_invite_token(uuid) from public,anon;
revoke all on function public.cancel_connection_invite(uuid) from public,anon;
revoke all on function public.list_my_connection_invites() from public,anon;
grant execute on function public.create_connection_invite() to authenticated;
grant execute on function public.get_connection_invite_by_token(uuid) to authenticated;
grant execute on function public.accept_connection_invite_token(uuid) to authenticated;
grant execute on function public.cancel_connection_invite(uuid) to authenticated;
grant execute on function public.list_my_connection_invites() to authenticated;