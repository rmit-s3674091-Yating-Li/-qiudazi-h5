create or replace function public.save_event_photo(p_event_id uuid,p_original text,p_watermarked text,p_version integer default 0)
returns public.event_photos
language plpgsql security definer set search_path=''
as $$
declare e public.events; existing public.event_photos; result public.event_photos;begin
 select * into e from public.events where id=p_event_id for update;
 if e.id is null or e.owner_user_id is distinct from public.current_profile_id() then raise exception 'FORBIDDEN'; end if;
 if e.status!='finished' then raise exception 'EVENT_NOT_FINISHED'; end if;
 if not public.can_upload_photo(p_original) or not public.can_upload_photo(p_watermarked) or split_part(p_original,'/',2)!=p_event_id::text or split_part(p_watermarked,'/',2)!=p_event_id::text then raise exception 'INVALID_PHOTO'; end if;
 if not exists(select 1 from storage.objects where bucket_id='event-photos' and name=p_original) or not exists(select 1 from storage.objects where bucket_id='event-photos' and name=p_watermarked) then raise exception 'INVALID_PHOTO'; end if;
 select * into existing from public.event_photos where event_id=p_event_id;
 if coalesce(existing.version,0) is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 if existing.id is not null then
   insert into public.event_photo_archive(event_id,original_url,watermarked_url,uploaded_at,source_version,archived_by_user_id)
   values(existing.event_id,existing.original_url,existing.watermarked_url,existing.uploaded_at,existing.version,public.current_profile_id());
 end if;
 insert into public.event_photos(event_id,original_url,watermarked_url,event_visible,removed_from_event_at,removed_by_user_id)
 values(p_event_id,p_original,p_watermarked,true,null,null)
 on conflict(event_id) do update set original_url=excluded.original_url,watermarked_url=excluded.watermarked_url,uploaded_at=now(),version=event_photos.version+1,event_visible=true,removed_from_event_at=null,removed_by_user_id=null returning * into result;
 return result;
end $$;