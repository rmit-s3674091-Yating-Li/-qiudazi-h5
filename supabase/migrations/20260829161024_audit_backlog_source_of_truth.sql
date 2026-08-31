alter table audit_ops.issue_registry
  add column if not exists severity text,
  add column if not exists status text not null default 'OPEN',
  add column if not exists module text,
  add column if not exists details text,
  add column if not exists evidence text,
  add column if not exists affected_head text,
  add column if not exists owner text,
  add column if not exists updated_at timestamptz not null default now();

alter table audit_ops.issue_registry drop constraint if exists issue_registry_status_check;
alter table audit_ops.issue_registry add constraint issue_registry_status_check check (status in ('OPEN','IN_PROGRESS','FIXED_PENDING_VERIFY','VERIFIED','WONT_FIX','DUPLICATE'));
alter table audit_ops.issue_registry drop constraint if exists issue_registry_severity_check;
alter table audit_ops.issue_registry add constraint issue_registry_severity_check check (severity is null or severity in ('P0','P1','P2'));

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
  if p_semantic_key is null or btrim(p_semantic_key) = '' then
    raise exception 'semantic_key_required';
  end if;
  if p_source is null or btrim(p_source) = '' then
    raise exception 'source_required';
  end if;
  if p_summary is null or btrim(p_summary) = '' then
    raise exception 'summary_required';
  end if;
  if p_severity not in ('P0','P1','P2') then
    raise exception 'invalid_severity';
  end if;

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
  update audit_ops.issue_counters
  set last_value = v_next, updated_at = now()
  where audit_date = p_audit_date;

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

insert into audit_ops.issue_registry(audit_id,audit_date,sequence_no,semantic_key,source,summary,severity,status,module,details,evidence,owner)
values
('AUD-20260829-001','2026-08-29',1,'legacy-001-migration-reproducibility','历史台账','仓库 SQL baseline、Storage reproducibility、fresh-db replay 与 live Supabase 一致性复核','P0','FIXED_PENDING_VERIFY','Supabase migration / environment reproducibility','旧目标基本收口；AUD-017 后需最终复核',null,null),
('AUD-20260829-002','2026-08-29',2,'legacy-002-ci-build','历史台账','Build workflow 已恢复并验证候选源码','P1','VERIFIED','CI / Build',null,'多轮 H5 Build Check success',null),
('AUD-20260829-003','2026-08-29',3,'legacy-003-i18n-visual','历史台账','English 模式核心流程已完成主要代码收口，仍待真实页面 English 黑盒/Visual QA','P1','FIXED_PENDING_VERIFY','i18n',null,null,null),
('AUD-20260829-004','2026-08-29',4,'legacy-004-deadline-clamp','历史台账','修改日期/开赛时间后截止自动夹紧需提示','P1','VERIFIED','报名截止联动',null,null,null),
('AUD-20260829-005','2026-08-29',5,'legacy-005-registration-helper','历史台账','展示文案判断报名状态已改为 helper','P1','VERIFIED','前端报名状态',null,null,null),
('AUD-20260829-006','2026-08-29',6,'legacy-006-viewer-role-build','历史台账','EventPage 权威 viewer_role 改造后的组件调用残留导致 build failure','P0','VERIFIED','身份 / 赛事管理',null,null,null),
('AUD-20260829-007','2026-08-29',7,'legacy-007-doc-release-trace','历史台账','V6 长期文档与 CHANGELOG 必须跟随实际核心行为和发布工程事实持续同步','P1','FIXED_PENDING_VERIFY','文档基线 / Release traceability',null,null,null),
('AUD-20260829-008','2026-08-29',8,'legacy-008-joined-event-membership','历史台账','我参与的按有效 Entry 中实际 Player 参与事实判断','P1','VERIFIED','我的赛事 / 双打',null,null,null),
('AUD-20260829-009','2026-08-29',9,'legacy-009-scoring-owner-identity','历史台账','MatchPage 组织者计分能力不得依赖旧本地 Profile ID','P0','VERIFIED','比赛记分 / 权威身份',null,null,null),
('AUD-20260829-010','2026-08-29',10,'legacy-010-registration-cta','历史台账','我参与的 → 喊球搭子一起来应按有效报名状态显示','P1','VERIFIED','报名截止 / 有效状态 UI',null,null,null),
('AUD-20260829-011','2026-08-29',11,'legacy-011-level-display','历史台账','参赛建议级别 helper 应按基线统一边界文案','P2','VERIFIED','参赛建议级别展示',null,null,null),
('AUD-20260829-012','2026-08-29',12,'legacy-012-private-event-membership','历史台账','snapshot/preview 按实际 Player membership 识别 participant','P1','VERIFIED','私有赛事 / 参与者身份',null,null,null),
('AUD-20260829-013','2026-08-29',13,'legacy-013-event-lifecycle','历史台账','EventPage 核心报名和赛事管理动作曾被截断','P0','FIXED_PENDING_VERIFY','EventPage / 报名与赛事生命周期',null,null,'球搭子问题整改'),
('AUD-20260829-014','2026-08-29',14,'legacy-014-event-level-legacy','历史台账','完整赛事详情读取 legacy event.level','P1','VERIFIED','EventPage / 参赛建议级别',null,null,null),
('AUD-20260829-015','2026-08-29',15,'legacy-015-doubles-withdrawal','历史台账','非 signup_user_id 的第二位真实双打搭档前端退赛入口及截止后 CTA 一致性','P1','FIXED_PENDING_VERIFY','EventPage / 双打退赛一致性',null,null,'球搭子问题整改'),
('AUD-20260829-016','2026-08-29',16,'organizer-batch-participant-selection','产品确认','组织者批量/多选参赛者体验改进','P2','OPEN','UX / 组织者参赛者选择','UX improvement，不作为当前 Release Gate 阻塞',null,null),
('AUD-20260829-017','2026-08-29',17,'event-photo-privacy-storage-delete','产品确认','赛事照片隐私 / Storage / 默认水印预览 / 高清短时授权 / 删除闭环','P0','OPEN','隐私 / Storage / 赛事照片','当前最高优先级发布阻塞项；private bucket；仅 organizer + 有效 Entry→Player 参赛者；默认水印低清预览；高清短时授权；PrivacyPage 删除闭环；禁止任意 path；无 orphan',null,null)
on conflict (audit_id) do update set
  severity=excluded.severity,
  status=excluded.status,
  module=excluded.module,
  details=coalesce(excluded.details,audit_ops.issue_registry.details),
  owner=coalesce(excluded.owner,audit_ops.issue_registry.owner),
  updated_at=now();

insert into audit_ops.issue_counters(audit_date,last_value)
values ('2026-08-29',17)
on conflict (audit_date) do update set last_value=greatest(audit_ops.issue_counters.last_value,excluded.last_value), updated_at=now();