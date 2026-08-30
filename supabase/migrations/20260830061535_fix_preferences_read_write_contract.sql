create or replace function public.get_my_preferences()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  me uuid:=public.current_profile_id();
  p public.profile_preferences;
begin
  if me is null then raise exception 'PROFILE_REQUIRED'; end if;
  insert into public.profile_preferences(profile_id) values(me) on conflict(profile_id) do nothing;
  select * into p from public.profile_preferences where profile_id=me;
  return jsonb_build_object(
    'avatar_visible',p.avatar_visible,
    'level_visible',p.level_visible,
    'city_visible',p.city_visible,
    'play_times_visible',p.play_times_visible,
    'play_preference_visible',p.play_preference_visible,
    'allow_event_invites',p.allow_event_invites,
    'allow_doubles_invites',p.allow_doubles_invites,
    'participant_album_visibility',p.participant_album_visibility
  );
end
$$;

create or replace function public.save_my_preferences(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  me uuid:=public.current_profile_id();
  p public.profile_preferences;
  allowed text[]:=array['avatar_visible','level_visible','city_visible','play_times_visible','play_preference_visible','allow_event_invites','allow_doubles_invites','participant_album_visibility'];
  v text;
begin
  if me is null then raise exception 'PROFILE_REQUIRED'; end if;
  if p_settings-allowed!='{}'::jsonb then raise exception 'INVALID_FIELDS'; end if;
  v:=p_settings->>'participant_album_visibility';
  if v is not null and v not in ('private','partners') then raise exception 'INVALID_VISIBILITY'; end if;
  insert into public.profile_preferences(profile_id) values(me) on conflict(profile_id) do nothing;
  update public.profile_preferences set
    avatar_visible=coalesce((p_settings->>'avatar_visible')::boolean,avatar_visible),
    level_visible=coalesce((p_settings->>'level_visible')::boolean,level_visible),
    city_visible=coalesce((p_settings->>'city_visible')::boolean,city_visible),
    play_times_visible=coalesce((p_settings->>'play_times_visible')::boolean,play_times_visible),
    play_preference_visible=coalesce((p_settings->>'play_preference_visible')::boolean,play_preference_visible),
    allow_event_invites=coalesce((p_settings->>'allow_event_invites')::boolean,allow_event_invites),
    allow_doubles_invites=coalesce((p_settings->>'allow_doubles_invites')::boolean,allow_doubles_invites),
    participant_album_visibility=coalesce(v,participant_album_visibility),
    updated_at=now()
  where profile_id=me
  returning * into p;
  return jsonb_build_object(
    'avatar_visible',p.avatar_visible,
    'level_visible',p.level_visible,
    'city_visible',p.city_visible,
    'play_times_visible',p.play_times_visible,
    'play_preference_visible',p.play_preference_visible,
    'allow_event_invites',p.allow_event_invites,
    'allow_doubles_invites',p.allow_doubles_invites,
    'participant_album_visibility',p.participant_album_visibility
  );
end
$$;
