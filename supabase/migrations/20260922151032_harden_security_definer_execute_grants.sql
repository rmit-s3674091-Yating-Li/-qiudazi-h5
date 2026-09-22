revoke all on function public.lock_expired_event_registrations() from public, anon, authenticated;
grant execute on function public.lock_expired_event_registrations() to service_role;

revoke all on function public.get_my_preferences() from public, anon;
grant execute on function public.get_my_preferences() to authenticated, service_role;

revoke all on function public.save_my_preferences(jsonb) from public, anon;
grant execute on function public.save_my_preferences(jsonb) to authenticated, service_role;
