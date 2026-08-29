create or replace function audit_ops.create_issue(
  p_semantic_key text,
  p_source text,
  p_severity text,
  p_module text,
  p_summary text,
  p_details text default null,
  p_evidence text default null,
  p_affected_head text default null,
  p_audit_date date default ((now() at time zone 'Asia/Shanghai')::date)
)
returns table(audit_id text, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing audit_ops.issue_registry%rowtype;
  v_next integer;
  v_id text;
begin
  if p_semantic_key is null or btrim(p_semantic_key) = '' then raise exception 'semantic_key_required'; end if;
  if p_source is null or btrim(p_source) = '' then raise exception 'source_required'; end if;
  if p_summary is null or btrim(p_summary) = '' then raise exception 'summary_required'; end if;
  if p_severity not in ('P0','P1','P2') then raise exception 'invalid_severity'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qiudazi-audit-id:' || p_audit_date::text, 0)
  );

  select * into v_existing
  from audit_ops.issue_registry r
  where r.audit_date = p_audit_date and r.semantic_key = p_semantic_key;
  if found then
    return query select v_existing.audit_id, false;
    return;
  end if;

  insert into audit_ops.issue_counters(audit_date,last_value)
  values (p_audit_date,0)
  on conflict (audit_date) do nothing;

  select last_value into v_next
  from audit_ops.issue_counters
  where audit_date = p_audit_date
  for update;

  v_next := v_next + 1;
  update audit_ops.issue_counters set last_value=v_next, updated_at=now() where audit_date=p_audit_date;
  v_id := 'AUD-' || to_char(p_audit_date,'YYYYMMDD') || '-' || lpad(v_next::text,3,'0');

  insert into audit_ops.issue_registry(
    audit_id,audit_date,sequence_no,semantic_key,source,summary,severity,status,module,details,evidence,affected_head,updated_at
  ) values (
    v_id,p_audit_date,v_next,p_semantic_key,p_source,p_summary,p_severity,'OPEN',p_module,p_details,p_evidence,p_affected_head,now()
  );

  return query select v_id, true;
end;
$$;

revoke all on function audit_ops.create_issue(text,text,text,text,text,text,text,text,date) from public, anon, authenticated;
grant execute on function audit_ops.create_issue(text,text,text,text,text,text,text,text,date) to postgres, service_role;

comment on function audit_ops.create_issue(text,text,text,text,text,text,text,text,date)
is 'Atomically creates or reuses an AUD backlog row; same-day semantic-key creation is serialized so concurrent callers converge on one audit_id.';
