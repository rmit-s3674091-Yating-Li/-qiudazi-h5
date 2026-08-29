create or replace function public.get_connected_partner_profile(p_profile_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
with me as (
  select public.current_profile_id() as id
), allowed as (
  select p_profile_id as id
  from me
  where me.id is not null
    and exists (
      select 1 from public.connections c
      where c.status='accepted'
        and ((c.requester_user_id=me.id and c.addressee_user_id=p_profile_id)
          or (c.addressee_user_id=me.id and c.requester_user_id=p_profile_id))
    )
), partner as (
  select pr.id as profile_id, pr.nickname, pr.avatar_url,
         pl.id as player_id, pl.level, pl.city, pl.play_times, pl.play_preference
  from allowed a
  join public.profiles pr on pr.id=a.id and pr.profile_status='completed'
  left join public.players pl on pl.linked_user_id=pr.id and pl.player_type='self'
  limit 1
), partner_entries as (
  select distinct e.id as entry_id
  from partner p
  join public.entry_players ep on ep.player_id=p.player_id and ep.active=true
  join public.entries e on e.id=ep.entry_id
), finished as (
  select m.id as match_id, m.event_id, ev.name as event_name, ev.event_date, ev.match_type,
         m.stage, m.round_no, m.winner_entry_id,
         pe.entry_id as my_entry_id,
         case when m.entry_a_id=pe.entry_id then m.entry_b_id else m.entry_a_id end as opponent_entry_id
  from partner_entries pe
  join public.matches m on pe.entry_id in (m.entry_a_id,m.entry_b_id)
  join public.events ev on ev.id=m.event_id
  where m.status='finished' and not m.is_bye
), recent as (
  select f.*,
    coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'avatar_url',p.avatar_url) order by ep.slot)
      from public.entry_players ep join public.players p on p.id=ep.player_id
      where ep.entry_id=f.opponent_entry_id and ep.active=true),'[]'::jsonb) as opponents
  from finished f
  order by f.event_date desc nulls last, f.match_id desc
  limit 3
), summary as (
  select count(*)::int as played,
         count(*) filter (where winner_entry_id=my_entry_id)::int as wins,
         count(*) filter (where winner_entry_id is not null and winner_entry_id<>my_entry_id)::int as losses
  from finished
)
select case when not exists(select 1 from partner) then null else jsonb_build_object(
  'profile', (select jsonb_build_object(
    'id',profile_id,'nickname',nickname,'avatar_url',avatar_url,
    'player_id',player_id,'level',level,'city',city,
    'play_times',coalesce(play_times,'{}'::text[]),'play_preference',play_preference
  ) from partner),
  'summary', (select jsonb_build_object('played',played,'wins',wins,'losses',losses) from summary),
  'recent_matches', coalesce((select jsonb_agg(jsonb_build_object(
    'match_id',match_id,'event_id',event_id,'event_name',event_name,'event_date',event_date,
    'match_type',match_type,'stage',stage,'round_no',round_no,
    'won',(winner_entry_id=my_entry_id),'opponents',opponents
  ) order by event_date desc nulls last, match_id desc) from recent),'[]'::jsonb)
) end;
$$;

revoke execute on function public.get_connected_partner_profile(uuid) from public, anon;
grant execute on function public.get_connected_partner_profile(uuid) to authenticated, service_role;
