-- V8 P2: event-photo metadata removal + immutable admin audit + durable Storage cleanup handoff.
-- This transaction removes the source photo from event metadata, NOT the Storage object.
-- The private cleanup queue must be processed by a separately reviewed trusted worker.
-- Existing signed URLs may remain valid until expiry; participant-owned album copies
-- are independent assets and are intentionally NOT affected by event-photo removal.
create table platform_ops.photo_removal_cleanup (
  photo_id uuid primary key,
  event_id uuid not null,
  request_id uuid not null unique references platform_ops.admin_action_audit(request_id) on delete restrict,
  source_version integer not null check (source_version > 0),
  original_path text not null,
  watermarked_path text not null,
  queued_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint photo_removal_paths_distinct check (original_path <> watermarked_path),
  constraint photo_removal_paths_present check (
    length(btrim(original_path)) > 0 and length(btrim(watermarked_path)) > 0
  )
);
create index photo_removal_cleanup_pending_idx
  on platform_ops.photo_removal_cleanup(queued_at, photo_id)
  where completed_at is null;
alter table platform_ops.photo_removal_cleanup enable row level security;
revoke all on platform_ops.photo_removal_cleanup from public, anon, authenticated, service_role;
-- The trusted cleanup worker will require narrow service-role access; no client grants.
grant select, update on platform_ops.photo_removal_cleanup to service_role;

create function public.platform_admin_remove_event_photo(
  p_actor_auth_user_id uuid,
  p_event_id uuid,
  p_photo_id uuid,
  p_expected_version integer,
  p_request_id uuid,
  p_reason text,
  p_confirm boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_photo public.event_photos;
  v_audit platform_ops.admin_action_audit;
  v_role text;
  v_cleanup_pending boolean;
begin
  if p_actor_auth_user_id is null or p_event_id is null or p_photo_id is null
    or p_expected_version is null or p_expected_version < 1
    or p_request_id is null or p_confirm is distinct from true then
    raise exception 'INVALID_PHOTO_REMOVAL_REQUEST';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 10 and 1000 then
    raise exception 'INVALID_ADMIN_REASON';
  end if;

  -- Serialize retries of the same request_id, including across different events.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  -- Use the same event lock as ordinary photo uploads and organizer deletes.
  perform 1 from public.events where id=p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  -- Reauthorize after acquiring the event lock, and hold membership stable
  -- through both business deletion and immutable audit insert.
  select m.role into v_role from platform_ops.admin_members m
  where m.auth_user_id=p_actor_auth_user_id and m.active is true
  for share;
  if v_role is distinct from 'super_admin' then
    raise exception 'PLATFORM_ADMIN_HIGH_RISK_FORBIDDEN';
  end if;

  select * into v_audit from platform_ops.admin_action_audit
  where request_id=p_request_id;
  if found then
    if v_audit.actor_auth_user_id is distinct from p_actor_auth_user_id
      or v_audit.action <> 'PHOTO_REMOVE'
      or v_audit.target_kind <> 'photo'
      or v_audit.target_id <> p_photo_id::text
      or v_audit.reason <> btrim(p_reason)
      or not exists (
        select 1 from platform_ops.photo_removal_cleanup q
        where q.request_id=p_request_id
          and q.event_id=p_event_id and q.photo_id=p_photo_id
          and q.source_version=p_expected_version
      ) then
      raise exception 'ADMIN_REQUEST_CONFLICT';
    end if;
    select q.completed_at is null into v_cleanup_pending
    from platform_ops.photo_removal_cleanup q where q.request_id=p_request_id;
    return jsonb_build_object(
      'photo_id',p_photo_id,'event_id',p_event_id,
      'cleanup_pending',v_cleanup_pending,'replayed',true
    );
  end if;

  select * into v_photo from public.event_photos ph
  where ph.id=p_photo_id and ph.event_id=p_event_id for update;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  if v_photo.version is distinct from p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;
  if v_photo.original_url is null or btrim(v_photo.original_url) = ''
    or v_photo.watermarked_url is null or btrim(v_photo.watermarked_url) = ''
    or v_photo.original_url = v_photo.watermarked_url then
    raise exception 'PHOTO_STORAGE_PATH_INVALID';
  end if;

  -- Audit and cleanup record are committed with the metadata deletion.
  -- Any failure rolls back all three writes. Storage deletion is NOT attempted.
  delete from public.event_photos
  where id=p_photo_id and event_id=p_event_id and version=p_expected_version;
  if not found then raise exception 'VERSION_CONFLICT'; end if;
  insert into platform_ops.admin_action_audit(
    request_id,actor_auth_user_id,action,target_kind,target_id,reason
  ) values (
    p_request_id,p_actor_auth_user_id,'PHOTO_REMOVE','photo',
    p_photo_id::text,btrim(p_reason)
  );
  insert into platform_ops.photo_removal_cleanup(
    photo_id,event_id,request_id,source_version,original_path,watermarked_path
  ) values (
    p_photo_id,p_event_id,p_request_id,p_expected_version,
    v_photo.original_url,v_photo.watermarked_url
  );
  return jsonb_build_object(
    'photo_id',p_photo_id,'event_id',p_event_id,
    'cleanup_pending',true,'replayed',false
  );
end;
$fn$;

revoke all on function public.platform_admin_remove_event_photo(
  uuid,uuid,uuid,integer,uuid,text,boolean
) from public, anon, authenticated;
grant execute on function public.platform_admin_remove_event_photo(
  uuid,uuid,uuid,integer,uuid,text,boolean
) to service_role;
