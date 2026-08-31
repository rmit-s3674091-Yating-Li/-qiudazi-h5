revoke execute on function public.is_actual_event_participant(uuid,uuid) from authenticated;

do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_event_snapshot'
  limit 1;
  if d is null then raise exception 'get_event_snapshot not found'; end if;
  d:=replace(d,
    $old$'photo',case when viewer_role in ('owner','participant') then (select to_jsonb(p) from public.event_photos p where p.event_id=p_event_id) else null end$old$,
    $new$'photo',null$new$
  );
  execute d;
end $do$;
