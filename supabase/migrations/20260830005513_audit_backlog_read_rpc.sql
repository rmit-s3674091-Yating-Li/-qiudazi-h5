create or replace function public.audit_list_issues()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(to_jsonb(q) order by q.audit_date, q.sequence_no),
    '[]'::jsonb
  )
  from (
    select
      r.audit_id,
      r.audit_date,
      r.sequence_no,
      r.semantic_key,
      r.source,
      r.severity,
      r.status,
      r.module,
      r.summary,
      r.details,
      r.evidence,
      r.affected_head,
      r.owner,
      r.created_at,
      r.updated_at
    from audit_ops.issue_registry as r
  ) as q;
$$;

revoke all on function public.audit_list_issues() from public;
revoke all on function public.audit_list_issues() from anon;
revoke all on function public.audit_list_issues() from authenticated;
grant execute on function public.audit_list_issues() to service_role;

comment on function public.audit_list_issues() is
  'Read-only automation API for the private audit_ops issue backlog. Executable only by service_role; direct table access remains private.';
