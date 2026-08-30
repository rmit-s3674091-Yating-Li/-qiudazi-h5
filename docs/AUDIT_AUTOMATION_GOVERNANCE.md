# 球搭子审计与整改自动化治理基线

> 本文定义「球搭子」自动化审计、待整改问题登记、整改、验证与发布 Gate 的长期协作规则。它属于工程治理基线，不改变产品业务规则。

## 1. 核心原则

- **Supabase `audit_ops.issue_registry` 是待整改问题唯一事实源（Source of Truth）**。多个审计/测试任务可以并发创建独立 backlog row；数据库负责原子编号、semantic key 去重和事务一致性。
- `public.audit_issue_registry_readonly` 只是 `audit_ops.issue_registry` 的 **backend-only 只读投影**，用于提高自动化读取兼容性，不是第二事实源。
- `public.audit_list_issues()` 是兼容读取 RPC；它返回 `jsonb` 数组，不是 `RETURNS TABLE`。
- `docs/AUDIT_BACKLOG_SNAPSHOT.json` 是**只读、带时间戳的自动化降级快照**。它不是正式 backlog，也不能用于写状态、分配 AUD 或声称数据库已同步。
- GitHub Issue #21 正文只是人类可读镜像，不得替代正式 backlog；Issue 评论只记录已存在 AUD 的 append-only 过程证据。
- 「球搭子问题整改」是唯一自动修复者，但不是全局唯一 writer。代码变更巡检、全功能测试、部署前审计、周安全审计均可按本文件规则创建 backlog row 和追加已有 AUD 评论。

## 2. 正式 backlog 的三路径读取与快照降级

`audit_ops.issue_registry` / `audit_ops.issue_counters` 属于内部工程治理数据，不是 H5 产品数据，不向客户端开放表级读取。

所有五个定时任务每轮先按以下顺序读取正式 backlog：

1. **优先**通过受信任后台数据库工具读取：

```sql
select *
from public.audit_issue_registry_readonly
order by audit_date, sequence_no;
```

2. 若当前运行环境或连接器安全层不允许读取该 view，再尝试调用 `public.audit_list_issues()`。
3. 若直接 RPC 路径仍被工具安全层阻止，再使用受信任只读 SQL：

```sql
select * from public.audit_list_issues();
```

该函数 `RETURNS jsonb`，SQL 结果是一列 `audit_list_issues`，其值为 JSON 数组。**不得把它当 RETURNS TABLE 使用，也不得写 `select audit_id,status ... from public.audit_list_issues()`。**

### 2.1 三条正式路径都失败时

三条正式路径均因连接器权限/安全层暂时不可达时，任务**不得直接整轮瘫痪**，而应读取 `docs/AUDIT_BACKLOG_SNAPSHOT.json` 并进入降级模式：

- 快照只允许用于：继续白盒/黑盒/安全/Gate 检查、识别已知 AUD、辅助语义去重、判断“上次正式快照时仍未关闭的问题”。
- 快照**禁止**用于：创建 AUD、修改正式 status/owner/evidence、把 `FIXED_PENDING_VERIFY` 推成 `VERIFIED`、声称 live backlog 已同步、替代 `audit_ops.issue_registry` 成为事实源。
- 若任务发现疑似新问题但当前无法访问正式建单路径，应输出 `UNFILED_PENDING_DB_ACCESS` 并保留完整证据，待后续能访问 Supabase 时再正式 `create_issue`；禁止手工编号。
- Release Gate 在无法读取 live backlog 时可以继续完成其它检查，但**最终不得给 PASS**；应标记 `DEGRADED_LIVE_BACKLOG_UNAVAILABLE`，直到某一条正式路径恢复并重新核对。
- 快照包含 `generated_at`、`source_path`、`source_head` 等元数据。超过 2 小时的快照不得作为 Release Gate 的“当前 backlog”依据；可以继续做非最终检查，但必须明确 stale。
- 白盒/黑盒/安全巡检使用 stale 快照时，不得据此关闭或降级已有正式问题。

### 2.2 权限边界

- `public.audit_issue_registry_readonly`：`anon=false`、`authenticated=false`、后台角色仅保留必要 `SELECT`。
- `public.audit_list_issues()`：`PUBLIC` / `anon` / `authenticated` 无 EXECUTE；后台受控角色可调用。
- 后台读取能力不得演变为给 H5 客户端开放 `audit_ops` schema/table grants。
- 连接器安全层拒绝与数据库授权失败是两种不同事件，安全审计必须区分。
- Snapshot 是 Git 仓库中的工程治理缓存，只保存审计元数据，不保存凭据、token、个人数据或 Storage path。

## 3. 新问题创建与去重

任何任务发现疑似新问题时：

1. 重读当前 canonical 文档和正式 backlog；正式路径暂不可达时可读取 snapshot 作辅助，但必须标记降级。
2. 读取 Issue #21 与历史评论仅作补充证据。
3. 对正式 backlog 或最近 snapshot 做语义去重。
4. 确属独立新问题后，只能在正式数据库路径可用时使用稳定 semantic key 调用 `audit_ops.create_issue(...)`。
5. 只能使用函数返回的 `audit_id`；`created=false` 必须复用现有 AUD。
6. 不得手工猜测下一个编号、使用“最大编号+1”或仅写 GitHub 评论代替正式建单。

AUD 编号格式为 `AUD-YYYYMMDD-NNN`；已使用编号永久保持原语义，不复用。

## 4. Backlog 状态

正式状态仅以下六种：

- `OPEN`
- `IN_PROGRESS`
- `FIXED_PENDING_VERIFY`
- `VERIFIED`
- `WONT_FIX`
- `DUPLICATE`

`FAILED`、`BLOCKED`、`NEEDS_DECISION`、`DEGRADED_LIVE_BACKLOG_UNAVAILABLE`、`UNFILED_PENDING_DB_ACCESS` 属于运行上下文/证据，不新增正式状态枚举；必要时由负责归并的流程把正式状态退回 `OPEN` 或保持 `IN_PROGRESS`。

## 5. 修复与验证职责

### 球搭子问题整改
- 唯一自动修复者。
- 每轮读取动态 PR #20 head，不缓存旧 head。
- 原则上只认领 `OPEN` 且未被占用的问题；已由本任务认领的 `IN_PROGRESS` 可继续。
- 优先级 `P0 → P1 → P2`。
- 修复完成最多到 `FIXED_PENDING_VERIFY`，**不得自行 VERIFIED**。
- 若 live backlog 不可达，允许继续已经明确认领的 `IN_PROGRESS` 本地代码工作，但不得从 snapshot 认领新的 OPEN，也不得依据 snapshot 改正式状态。
- 修改代码/migration/canonical 文档前必须重新 fetch 最新文件 + 最新 blob SHA，在最新内容上合并；stale conflict 必须重读重合并。
- 每次成功读取正式 backlog 后，应同步刷新 `docs/AUDIT_BACKLOG_SNAPSHOT.json`，只写审计元数据，不写敏感信息。

### 球搭子代码变更巡检
白盒发现与独立静态验证；不修产品代码/数据库/长期文档。已有 AUD 追加证据，新问题正式建单；DB 不可达时只记录 `UNFILED_PENDING_DB_ACCESS`，不得伪造 AUD。

### 球搭子全功能测试
真实黑盒 + Visual/UX + English QA；不得用源码、CI、HTTP 200 或旧 Preview 代替页面交互证据。已有 AUD 追加证据，新问题正式建单；DB 不可达时只记录待建单证据。

### 球搭子周安全审计
独立安全发现与验证；结合真实 grants、exposure、function ACL、业务身份校验判断，不因 Advisor INFO/WARN 机械升 P0。DB 不可达不应阻止其继续做静态/配置安全检查，但不能因此给正式状态结论。

### 球搭子部署前审计
独立 Release Gate；不修代码/DB/长期文档。必须核对 exact head、CI build + clean replay、repo/live 一致性、真实黑盒/Visual/English 与发布相关 backlog。live backlog 不可达时可以继续其它 Gate 检查，但最终只能 `DEGRADED_LIVE_BACKLOG_UNAVAILABLE`，不能 PASS。

## 6. Issue #21、Snapshot 与共享写入

- Issue #21 正文：固定镜像流程更新，不能反向覆盖数据库事实。
- Issue 评论：append-only，可由多个审计/测试任务并发追加，但必须引用已正式存在的 AUD。
- `docs/AUDIT_BACKLOG_SNAPSHOT.json`：由能访问正式 backlog 的总控/整改流程刷新；snapshot 仅是读取缓存，必须带时间戳和来源，不允许人工凭空改状态。
- repo/canonical/CHANGELOG/snapshot：任何整文件写入均采用 optimistic concurrency；冲突时重新读取并合并，禁止旧全文覆盖。

## 7. 当前产品专项口径

### 照片
照片专项冲突时以 `PRD V6 §5.1 + docs/PHOTO_ALBUM_BASELINE.md` 为最终真源：赛事多图、organizer-only 源管理、actual participant 主动逐张导入独立 private personal copy、源删不级联已导入个人副本、personal album 默认 private/可 partners、accepted Connection 仅短时水印预览。当前 P0 不要求本人在个人参与赛事相册查看高清；赛事上下文 organizer/actual participant 显式短时高清仍保留。

### 快速开赛
快速开赛是 **P1 新能力**，不替代或重写标准赛事 P0 链路：
- 四个既有底部主导航职责保持不变；中央凸起“快速开赛”是 action，不是第五 Tab；不得把“战绩”等从“我的”拆出。
- `event_mode=quick` 只跳过报名/候补/邀请阶段，创建 locked Event/Entry/EntryPlayer 并自动生成首次对阵；之后记分、排名、完赛、战绩、照片继续复用标准模型。
- quick mode 不得放宽标准赛事 deadline、waitlist、invite、viewer_role、Player/Storage 权限。
- 快速开赛本身未被提升为原 P0；但它若进入当前候选并造成四导航遮挡、既有 P0 页面不可用、权限扩大或标准赛事逻辑回归，则按发布回归处理。

### AUD-016
当前已确认：组织者在 **confirmed 剩余名额内**应支持批量多选/提交临时 Player。跨 `confirmed → waitlist` 的批量语义仍不得擅自扩大；候补保持既有单 Entry 规则，直到另有明确产品决策。

## 8. 发布规则

- CI green 不等于功能/Visual/权限/Gate 通过。
- 普通 commit 不主动触发 Vercel；完整候选后才受控创建 Preview。
- Release Gate 只对**发布相关** P0 与核心 P1 阻塞；P1 新能力不能仅因“不是 P0”被机械判失败，但进入候选后的真实回归/不可用属于阻塞。
- repository ↔ live Supabase migration/RPC/RLS/Storage/Edge Function 不一致时阻塞发布。
- live backlog 暂不可达时 Gate 不得 PASS；先保留 `DEGRADED_LIVE_BACKLOG_UNAVAILABLE`，待正式路径恢复后复核。
- 未通过 Gate 不进入 CloudBase 正式候选，不自动 merge `main`。
- `main` 继续由 GitHub ruleset 保护：PR、linear history、H5 Build Check、up-to-date、禁 force push/删除、无 bypass。

## 9. 当前迁移事实（2026-08-30）

- `20260829161024_audit_backlog_source_of_truth.sql`：正式 backlog。
- `20260829200350_audit_create_issue_concurrency.sql`：semantic key 并发去重。
- `20260830005513_audit_backlog_read_rpc.sql`：`public.audit_list_issues()`。
- `20260830032055_add_readonly_audit_issue_registry_view.sql`：新增 backend-only 只读投影。
- `20260830032103_restrict_readonly_audit_issue_registry_view.sql` 与 `20260830032403_restrict_audit_readonly_view_to_select_only.sql`：收紧为后台必要 SELECT；客户端不可读。

以上读取 view/RPC 都只是 `audit_ops.issue_registry` 的受控读取路径，不改变唯一事实源定义。Snapshot 同样不是第二事实源，只是连接器波动时的只读工程缓存。