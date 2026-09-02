create or replace function public.get_private_event_preview(p_event_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare e public.events; me uuid:=public.current_profile_id(); allowed boolean:=false;
begin
 select * into e from public.events where id=p_event_id and visibility='private';
 if e.id is null then return null; end if;
 allowed:=me is not null and (
   e.owner_user_id=me
   or exists(select 1 from public.event_invites i where i.event_id=e.id and i.invitee_user_id=me and i.status in ('pending','accepted'))
   or exists(select 1 from public.entries en where en.event_id=e.id and en.signup_user_id=me and en.status<>'withdrawn')
 );
 return jsonb_build_object('id',e.id,'name',e.name,'visibility',e.visibility,'status',e.status,'match_type',e.match_type,'format',e.format,'level',e.level,'city',e.city,'can_view_full',allowed);
end $$;