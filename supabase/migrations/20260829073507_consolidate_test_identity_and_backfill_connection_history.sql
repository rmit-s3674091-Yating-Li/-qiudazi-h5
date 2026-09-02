do $$
declare
  r record;
  d record;
  canonical_self uuid;
  duplicate_self uuid;
  latest_auth uuid;
begin
  for r in
    select pn.normalized_nickname, pn.profile_id as canonical_id
    from private.profile_nicknames pn
    where (select count(*) from public.profiles p where p.profile_status='completed' and lower(trim(p.nickname))=pn.normalized_nickname) > 1
  loop
    select p.auth_user_id into latest_auth
    from public.profiles p
    where p.profile_status='completed' and lower(trim(p.nickname))=r.normalized_nickname
    order by p.created_at desc
    limit 1;

    select p.id into canonical_self
    from public.players p
    where p.linked_user_id=r.canonical_id and p.player_type='self'
    limit 1;

    for d in
      select p.id
      from public.profiles p
      where p.profile_status='completed'
        and lower(trim(p.nickname))=r.normalized_nickname
        and p.id<>r.canonical_id
      order by p.created_at
    loop
      select p.id into duplicate_self
      from public.players p
      where p.linked_user_id=d.id and p.player_type='self'
      limit 1;

      if duplicate_self is not null and canonical_self is not null then
        update public.entry_players set player_id=canonical_self where player_id=duplicate_self;
        update public.player_claim_invites set player_id=canonical_self where player_id=duplicate_self;
        delete from public.players where id=duplicate_self;
      end if;

      update public.players set owner_user_id=r.canonical_id where owner_user_id=d.id;
      update public.events set owner_user_id=r.canonical_id where owner_user_id=d.id;
      update public.entries set signup_user_id=r.canonical_id where signup_user_id=d.id;
      update public.event_invites set inviter_user_id=r.canonical_id where inviter_user_id=d.id;
      update public.event_invites set invitee_user_id=r.canonical_id where invitee_user_id=d.id;
      update public.player_claim_invites set inviter_user_id=r.canonical_id where inviter_user_id=d.id;
      update public.player_claim_invites set claimed_by_user_id=r.canonical_id where claimed_by_user_id=d.id;
      update public.connection_invites set inviter_user_id=r.canonical_id where inviter_user_id=d.id;
      update public.connection_invites set accepted_by_user_id=r.canonical_id where accepted_by_user_id=d.id;
      update public.connections set requester_user_id=r.canonical_id where requester_user_id=d.id;
      update public.connections set addressee_user_id=r.canonical_id where addressee_user_id=d.id;

      delete from public.profiles where id=d.id;
      duplicate_self := null;
    end loop;

    if latest_auth is not null then
      update public.profiles set auth_user_id=latest_auth where id=r.canonical_id;
    end if;
  end loop;
end
$$;

insert into public.connection_invites(token, inviter_user_id, accepted_by_user_id, status, created_at, responded_at)
select gen_random_uuid(), c.requester_user_id, c.addressee_user_id, 'accepted', c.created_at, coalesce(c.responded_at,c.created_at)
from public.connections c
where c.status='accepted'
  and not exists (
    select 1 from public.connection_invites i
    where i.inviter_user_id=c.requester_user_id
      and i.accepted_by_user_id=c.addressee_user_id
      and i.status='accepted'
  );