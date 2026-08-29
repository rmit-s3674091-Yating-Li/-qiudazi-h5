create schema if not exists audit_ops;

revoke all on schema audit_ops from public, anon, authenticated;

create table if not exists audit_ops.issue_counters (
  audit_date date primary key,
  last_value integer not null check (last_value >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists audit_ops.issue_registry (
  audit_id text primary key,
  audit_date date not null,
  sequence_no integer not null,
  semantic_key text not null,
  source text not null,
  summary text,
  created_at timestamptz not null default now(),
  unique (audit_date, sequence_no),
  unique (audit_date, semantic_key),
  check (audit_id = 'AUD-' || to_char(audit_date, 'YYYYMMDD') || '-' || lpad(sequence_no::text, 3, '0'))
);

revoke all on audit_ops.issue_counters from public, anon, authenticated;
revoke all on audit_ops.issue_registry from public, anon, authenticated;

create or replace function audit_ops.reserve_issue_id(
  p_semantic_key text,
  p_source text,
  p_summary text default null,
  p_audit_date date default (timezone('Asia/Shanghai', now()))::date
)
returns table(audit_id text, created boolean, semantic_key text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing text;
  v_next integer;
  v_key text := nullif(trim(p_semantic_key), '');
begin
  if v_key is null then
    raise exception 'semantic_key must not be empty';
  end if;
  if nullif(trim(p_source), '') is null then
    raise exception 'source must not be empty';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qiudazi-audit-id:' || p_audit_date::text, 0)
  );

  select r.audit_id
    into v_existing
    from audit_ops.issue_registry r
   where r.audit_date = p_audit_date
     and r.semantic_key = v_key;

  if v_existing is not null then
    return query select v_existing, false, v_key;
    return;
  end if;

  insert into audit_ops.issue_counters(audit_date, last_value, updated_at)
  values (p_audit_date, 1, now())
  on conflict (audit_date) do update
     set last_value = audit_ops.issue_counters.last_value + 1,
         updated_at = now()
  returning last_value into v_next;

  insert into audit_ops.issue_registry(audit_id, audit_date, sequence_no, semantic_key, source, summary)
  values (
    'AUD-' || to_char(p_audit_date, 'YYYYMMDD') || '-' || lpad(v_next::text, 3, '0'),
    p_audit_date,
    v_next,
    v_key,
    trim(p_source),
    p_summary
  )
  returning issue_registry.audit_id into v_existing;

  return query select v_existing, true, v_key;
end;
$$;

revoke all on function audit_ops.reserve_issue_id(text, text, text, date) from public, anon, authenticated;

insert into audit_ops.issue_counters(audit_date, last_value, updated_at)
values (date '2026-08-29', 17, now())
on conflict (audit_date) do update
set last_value = greatest(audit_ops.issue_counters.last_value, excluded.last_value),
    updated_at = now();

comment on schema audit_ops is 'Internal automation coordination; not exposed to product clients.';
comment on function audit_ops.reserve_issue_id(text, text, text, date) is 'Atomically reserves or reuses a daily AUD id by semantic key for automation writers.';
