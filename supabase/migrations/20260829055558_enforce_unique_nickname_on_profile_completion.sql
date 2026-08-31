create or replace function public.complete_profile(p_name text, p_avatar_path text default null)
returns public.profiles
language plpgsql
security definer
set search_path to ''
as $function$
declare
  me public.profiles;
  normalized_name text;
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

  if exists (
    select 1
    from public.profiles p
    where p.id <> me.id
      and p.profile_status = 'completed'
      and p.nickname is not null
      and lower(trim(p.nickname)) = lower(normalized_name)
  ) then
    raise exception 'NICKNAME_TAKEN';
  end if;

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
$function$;