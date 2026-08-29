-- RPC dependencies that existed before the repository's incremental migration history.

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path=''
as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.profiles(auth_user_id)
  values(auth.uid())
  on conflict(auth_user_id) do nothing;
  select * into result from public.profiles where auth_user_id=auth.uid();
  return result;
end $$;

create or replace function public.validate_avatar(p_path text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_path is not null and (
    split_part(p_path,'/',1) != auth.uid()::text
    or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_path)
  ) then
    raise exception 'INVALID_AVATAR';
  end if;
end $$;

create or replace function public.accept_connection_invite(p_inviter_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_me uuid := public.current_profile_id();
  v_existing public.connections%rowtype;
  v_row public.connections%rowtype;
begin
  if v_me is null then raise exception 'PROFILE_REQUIRED'; end if;
  if p_inviter_profile_id = v_me then raise exception 'CANNOT_CONNECT_SELF'; end if;
  if not exists(select 1 from public.profiles where id=p_inviter_profile_id) then raise exception 'INVITER_NOT_FOUND'; end if;

  select * into v_existing
  from public.connections c
  where (c.requester_user_id=p_inviter_profile_id and c.addressee_user_id=v_me)
     or (c.requester_user_id=v_me and c.addressee_user_id=p_inviter_profile_id)
  order by c.created_at desc limit 1;

  if found then
    if v_existing.status='accepted' then
      v_row := v_existing;
    else
      update public.connections
      set status='accepted',responded_at=now()
      where id=v_existing.id
      returning * into v_row;
    end if;
  else
    insert into public.connections(requester_user_id,addressee_user_id,status,responded_at)
    values(p_inviter_profile_id,v_me,'accepted',now())
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end $$;
