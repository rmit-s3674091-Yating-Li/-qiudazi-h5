create or replace view public.audit_issue_registry_readonly
with (security_invoker = true)
as
select audit_id,audit_date,sequence_no,semantic_key,source,summary,created_at,severity,status,module,details,evidence,affected_head,owner,updated_at
from audit_ops.issue_registry;

grant select on public.audit_issue_registry_readonly to anon, authenticated;
comment on view public.audit_issue_registry_readonly is 'Read-only projection of audit_ops.issue_registry for automation backlog reads; audit_ops.issue_registry remains the source of truth.';
