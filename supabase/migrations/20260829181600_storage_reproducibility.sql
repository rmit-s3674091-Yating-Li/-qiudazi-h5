-- Reproduce the live Supabase Storage configuration required by the H5 MVP.
-- Idempotent by design so applying this migration to an environment where the
-- buckets/policies already exist converges to the same configuration.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 3145728, array['image/jpeg','image/png','image/webp']::text[]),
  ('event-photos', 'event-photos', true, 10485760, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_upload_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select split_part(p_name,'/',1)=auth.uid()::text
     and exists(
       select 1
       from public.events e
       where e.id::text=split_part(p_name,'/',2)
         and e.owner_user_id=public.current_profile_id()
         and e.status='finished'
     );
$$;

revoke all on function public.can_upload_photo(text) from public, anon;
grant execute on function public.can_upload_photo(text) to authenticated, service_role;

drop policy if exists qiudazi_avatar_insert on storage.objects;
create policy qiudazi_avatar_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists qiudazi_avatar_read_own on storage.objects;
create policy qiudazi_avatar_read_own
on storage.objects for select to authenticated
using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists qiudazi_avatar_delete_own on storage.objects;
create policy qiudazi_avatar_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists (
    select 1 from public.players p where p.avatar_url = storage.objects.name
  )
);

drop policy if exists qiudazi_photo_insert on storage.objects;
create policy qiudazi_photo_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='event-photos'
  and public.can_upload_photo(name)
);

drop policy if exists qiudazi_photo_read_own on storage.objects;
create policy qiudazi_photo_read_own
on storage.objects for select to authenticated
using (
  bucket_id='event-photos'
  and public.can_upload_photo(name)
);

drop policy if exists qiudazi_photo_delete_own on storage.objects;
create policy qiudazi_photo_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id='event-photos'
  and public.can_upload_photo(name)
  and not exists (
    select 1
    from public.event_photos ep
    where ep.original_url = storage.objects.name
       or ep.watermarked_url = storage.objects.name
  )
);
