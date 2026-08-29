create or replace function public.complete_profile(p_name text, p_avatar_path text default null::text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  target public.profiles;
  normalized_name text;
  target_profile_id uuid;
begin
  me := public.ensure_profile();
  select * into me from public.profiles where id = me.id for update;

  normalized_name := trim(p_name);
  if p_name is null or length(normalized_name) not between 1 and 40 then
    raise exception 'NICKNAME_REQUIRED';
  end if;

  perform public.validate_avatar(p_avatar_path);

  if me.profile_status = 'completed' then
    return me;
  end if;

  -- MVP TEST MODE ONLY: an existing nickname acts as the test identity selector.
  -- The registry chooses one canonical historical profile for each normalized nickname.
  select pn.profile_id into target_profile_id
  from private.profile_nicknames pn
  where pn.normalized_nickname = lower(normalized_name)
  for update;

  if target_profile_id is not null and target_profile_id <> me.id then
    select * into target from public.profiles where id = target_profile_id for update;
    if target.id is null or target.profile_status <> 'completed' then
      raise exception 'TEST_IDENTITY_UNAVAILABLE';
    end if;

    delete from public.profiles where id = me.id and profile_status = 'pending';

    update public.profiles
    set auth_user_id = auth.uid()
    where id = target.id
    returning * into target;

    return target;
  end if;

  begin
    insert into private.profile_nicknames(normalized_nickname, profile_id)
    values(lower(normalized_name), me.id);
  exception when unique_violation then
    raise exception 'TEST_IDENTITY_RETRY';
  end;

  insert into public.players(owner_user_id, linked_user_id, name, avatar_url, player_type)
  values(me.id, me.id, normalized_name, p_avatar_path, 'self');

  update public.profiles
  set nickname = normalized_name,
      avatar_url = p_avatar_path,
      profile_status = 'completed'
  where id = me.id
  returning * into me;

  return me;
end
$$;

create or replace function public.list_sent_event_invites(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'invitee_user_id',i.invitee_user_id,
   'status',i.status,
   'created_at',i.created_at
 ) order by i.created_at desc),'[]'::jsonb)
 from public.event_invites i
 where i.event_id=p_event_id
   and i.inviter_user_id=public.current_profile_id()
   and i.invite_kind='event';
$$;

revoke execute on function public.complete_profile(text,text) from public, anon;
grant execute on function public.complete_profile(text,text) to authenticated, service_role;
revoke execute on function public.list_sent_event_invites(uuid) from public, anon;
grant execute on function public.list_sent_event_invites(uuid) to authenticated, service_role;
