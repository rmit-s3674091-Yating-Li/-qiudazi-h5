update public.players set level='≤2.0' where level='2.0-';
update public.events set level='≤2.0' where level='2.0-';
update public.players set level='≥4.5' where level='4.5+';
update public.events set level='≥4.5' where level='4.5+';
alter table public.events drop constraint if exists events_level_check;
alter table public.events add constraint events_level_check check (level is null or level = any(array['≤2.0'::text,'2.5'::text,'3.0'::text,'3.5'::text,'4.0'::text,'≥4.5'::text]));
create or replace function public.save_my_tennis_profile(p_level text default null,p_city text default null,p_play_times text[] default '{}'::text[],p_play_preference text default null)
returns public.players language plpgsql security definer set search_path=''
as $$
declare me uuid:=public.current_profile_id(); result public.players;
begin
 if me is null then raise exception 'PROFILE_REQUIRED'; end if;
 if p_level is not null and nullif(trim(p_level),'') is not null and trim(p_level) not in ('≤2.0','2.5','3.0','3.5','4.0','≥4.5') then raise exception 'INVALID_LEVEL'; end if;
 select * into result from public.players where linked_user_id=me and player_type='self' for update;
 if result.id is null then raise exception 'SELF_PLAYER_REQUIRED'; end if;
 if p_play_preference is not null and p_play_preference not in ('singles','doubles','both') then raise exception 'INVALID_PLAY_PREFERENCE'; end if;
 update public.players set level=nullif(trim(p_level),''),city=nullif(trim(p_city),''),play_times=coalesce(p_play_times,'{}'::text[]),play_preference=p_play_preference,version=version+1 where id=result.id returning * into result;
 return result;
end $$;