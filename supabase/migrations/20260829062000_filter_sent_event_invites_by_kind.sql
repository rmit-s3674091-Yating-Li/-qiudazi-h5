create or replace function public.list_sent_event_invites(p_event_id uuid)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
 select coalesce(jsonb_agg(jsonb_build_object('invitee_user_id',i.invitee_user_id,'status',i.status,'created_at',i.created_at) order by i.created_at desc),'[]'::jsonb)
 from public.event_invites i
 where i.event_id=p_event_id
   and i.inviter_user_id=public.current_profile_id()
   and i.invite_kind='event';
$function$;

revoke all on function public.list_sent_event_invites(uuid) from public, anon;
grant execute on function public.list_sent_event_invites(uuid) to authenticated, service_role;
