create table if not exists private.profile_auth_aliases (
  auth_user_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists profile_auth_aliases_profile_idx on private.profile_auth_aliases(profile_id);

create or replace function public.current_profile_id()
returns uuid
language sql
stable security definer
set search_path=''
as $$
  select coalesce(
    (select p.id from public.profiles p where p.auth_user_id=(select auth.uid()) limit 1),
    (select a.profile_id from private.profile_auth_aliases a where a.auth_user_id=(select auth.uid()) limit 1)
  )
$$;

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path=''
as $$
declare result public.profiles; aliased uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select a.profile_id into aliased from private.profile_auth_aliases a where a.auth_user_id=auth.uid();
 if aliased is not null then
   select * into result from public.profiles where id=aliased;
   return result;
 end if;
 insert into public.profiles(auth_user_id) values(auth.uid()) on conflict(auth_user_id) do nothing;
 select * into result from public.profiles where auth_user_id=auth.uid();
 return result;
end $$;

create or replace function public.complete_profile(p_name text, p_avatar_path text default null::text)
returns public.profiles
language plpgsql
security definer
set search_path=''
as $$
declare
  me public.profiles;
  target public.profiles;
  normalized_name text;
  target_profile_id uuid;
begin
  me := public.ensure_profile();
  normalized_name := trim(p_name);
  if p_name is null or length(normalized_name) not between 1 and 40 then raise exception 'NICKNAME_REQUIRED'; end if;
  perform public.validate_avatar(p_avatar_path);

  if me.profile_status = 'completed' then return me; end if;

  select pn.profile_id into target_profile_id
  from private.profile_nicknames pn
  where pn.normalized_nickname = lower(normalized_name)
  for update;

  if target_profile_id is not null and target_profile_id <> me.id then
    select * into target from public.profiles where id=target_profile_id for update;
    if target.id is null or target.profile_status <> 'completed' then raise exception 'TEST_IDENTITY_UNAVAILABLE'; end if;
    delete from public.profiles where id=me.id and profile_status='pending';
    insert into private.profile_auth_aliases(auth_user_id,profile_id)
    values(auth.uid(),target.id)
    on conflict(auth_user_id) do update set profile_id=excluded.profile_id;
    return target;
  end if;

  begin
    insert into private.profile_nicknames(normalized_nickname,profile_id)
    values(lower(normalized_name),me.id);
  exception when unique_violation then
    raise exception 'TEST_IDENTITY_RETRY';
  end;

  insert into public.players(owner_user_id,linked_user_id,name,avatar_url,player_type)
  values(me.id,me.id,normalized_name,p_avatar_path,'self');

  update public.profiles set nickname=normalized_name,avatar_url=p_avatar_path,profile_status='completed'
  where id=me.id returning * into me;
  return me;
end $$;

revoke execute on function public.current_profile_id() from public, anon;
grant execute on function public.current_profile_id() to authenticated, service_role;
revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated, service_role;
revoke execute on function public.complete_profile(text,text) from public, anon;
grant execute on function public.complete_profile(text,text) to authenticated, service_role;
