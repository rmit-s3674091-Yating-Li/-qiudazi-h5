update public.events e
set visibility='public'
from public.profiles owner
where e.owner_user_id=owner.id
  and e.event_mode='quick'
  and e.visibility='private'
  and not (e.name like 'QA %' and coalesce(owner.nickname,'') like 'QA%');
