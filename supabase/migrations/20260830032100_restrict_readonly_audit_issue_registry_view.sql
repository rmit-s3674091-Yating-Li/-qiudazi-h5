drop view if exists public.audit_issue_registry_readonly;
create view public.audit_issue_registry_readonly as
select audit_id,audit_date,sequence_no,semantic_key,source,summary,created_at,severity,status,module,details,evidence,affected_head,owner,updated_at
from audit_ops.issue_registry;
revoke all on public.audit_issue_registry_readonly from public, anon, authenticated;
grant select on public.audit_issue_registry_readonly to service_role;
comment on view public.audit_issue_registry_readonly is 'Backend-only read projection of audit_ops.issue_registry. audit_ops.issue_registry remains the source of truth; no client role access.';
