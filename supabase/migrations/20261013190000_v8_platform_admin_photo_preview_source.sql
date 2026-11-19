-- V8 Platform Admin: narrowly scoped watermarked photo preview source.
create or replace function public.platform_admin_get_photo_preview_source(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_photo_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_photo record;
begin
  if p_actor_auth_user_id is null or p_event_id is null or p_photo_id is null then
    raise exception 'INVALID_PHOTO_PREVIEW_REQUEST';
  end if;

  if not exists (
    select 1 from platform_ops.admin_members m
    where m.auth_user_id = p_actor_auth_user_id
      and m.active = true
      and m.role in ('reviewer', 'operator', 'super_admin')
  ) then
    raise exception 'PLATFORM_ADMIN_FORBIDDEN';
  end if;

  select ph.id, ph.event_id, ph.version, ph.watermarked_url
    into v_photo
  from public.event_photos ph
  where ph.id = p_photo_id and ph.event_id = p_event_id;

  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  if v_photo.watermarked_url is null or btrim(v_photo.watermarked_url) = '' then
    raise exception 'PHOTO_PREVIEW_UNAVAILABLE';
  end if;

  return jsonb_build_object(
    'photo_id', v_photo.id,
    'event_id', v_photo.event_id,
    'version', v_photo.version,
    'watermarked_path', v_photo.watermarked_url
  );
end;
$fn$;

revoke all on function public.platform_admin_get_photo_preview_source(
  uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.platform_admin_get_photo_preview_source(
  uuid, uuid, uuid) to service_role;
