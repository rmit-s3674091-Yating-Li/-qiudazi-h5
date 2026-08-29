# 球搭子审计与整改自动化治理基线

> 本文定义「球搭子」自动化审计、待整改问题登记、整改、验证与发布 Gate 的长期协作规则。它属于工程治理基线，不改变产品业务规则。

## 1. 核心原则

自动化体系必须把“问题本体”“展示镜像”“整改/验证过程日志”分离，并针对不同写入介质采用不同的并发控制方式，而不是简单限制为只有一个任务可以写。

- **Supabase `audit_ops.issue_registry`：待整改问题唯一事实源（Source of Truth）**。多个审计/测试任务可以并发创建彼此独立的 backlog row；数据库负责原子编号、唯一约束和事务一致性。
- **GitHub Issue #21 正文：待整改问题清单的人类可读镜像**，不得作为新问题创建入口，也不得反向覆盖数据库事实。由于正文属于整块共享文本，应由固定镜像同步流程更新，避免多个任务同时整段覆盖。
- **GitHub Issue #21 评论：已存在 AUD 的整改、验证和补充证据日志**。评论采用 append-only；多个任务可以并发追加评论，不需要单 writer。
- **「球搭子问题整改」：唯一自动修复者**，负责自动修改产品代码、必要 migration 和受影响文档，并可承担 Issue #21 正文镜像同步职责；它不是整个自动化体系的“唯一 writer”。
- 代码变更巡检、全功能测试、部署前审计、周安全审计均可以写入其职责范围内的安全并发介质：创建新的 Supabase backlog row、向已有 AUD 追加 Issue 评论；但不得直接修改产品代码、数据库 schema/migration、canonical 文档或 Issue #21 正文。

## 2. 新待整改问题创建

任何审计/测试任务发现疑似新问题时，必须按以下顺序执行：

1. 读取当前 canonical 文档。
2. 读取 `audit_ops.issue_registry` 当前 backlog。
3. 读取 GitHub Issue #21 正文与相关历史评论作为补充证据。
4. 对既有 backlog 做语义去重；姓名、页面文案差异或不同来源不得被误判为不同问题。
5. 确认确属独立新问题后，生成稳定、简短、与缺陷语义绑定的 `semantic_key`。
6. 必须调用：

```text
audit_ops.create_issue(
  p_semantic_key,
  p_source,
  p_severity,
  p_module,
  p_summary,
  p_details,
  p_evidence,
  p_affected_head,
  p_audit_date
)
```

7. `p_audit_date` 按 `Asia/Shanghai` 当日。
8. 只能使用函数返回的 `audit_id`。
9. `created=false` 表示相同 semantic key 已被其他并发任务登记，必须复用既有 AUD 并补充证据，禁止再次创建新编号。
10. 若中央创建函数不可用，任务必须标记 `BLOCKED`，禁止退化为手工编号、`最大编号 + 1`、GitHub 正文直接插行或评论代替问题创建。

## 3. 并发与唯一编号

`audit_ops.create_issue` 内部通过数据库事务完成编号分配与正式 backlog row 创建。编号格式为：

```text
AUD-YYYYMMDD-NNN
```

数据库必须保证：

- `(audit_date, sequence_no)` 唯一；
- `audit_id` 唯一；
- `(audit_date, semantic_key)` 唯一；
- 已占用 AUD 编号永久保持原语义，不得复用或改写；
- 多个任务同时发现不同问题时，各自产生不同 backlog row；
- 多个任务同时发现同一 semantic key 时，只保留一个正式问题。

任何自动化不得在任务开始时预留、缓存或猜测“下一个 AUD”。

## 4. Backlog 数据职责

`audit_ops.issue_registry` 至少承载以下事实：

- `audit_id`
- `audit_date`
- `sequence_no`
- `semantic_key`
- `source`
- `severity`
- `status`
- `module`
- `summary`
- `details`
- `evidence`
- `affected_head`
- `owner`
- `work_context`
- `created_at`
- `updated_at`

正式状态以 Supabase backlog 为准。允许状态：

- `OPEN`
- `IN_PROGRESS`
- `FIXED_PENDING_VERIFY`
- `VERIFIED`
- `WONT_FIX`
- `DUPLICATE`

`FAILED`、`BLOCKED`、`NEEDS_DECISION` 可以进入工作上下文/评论证据，并由负责状态归并的流程根据实际情况同步正式状态。

## 5. Issue #21 正文镜像

Issue #21 正文用于快速人工阅读，不是数据库。

- 正文应由固定的镜像同步流程根据 `audit_ops.issue_registry` 重新生成或同步；当前可由「球搭子问题整改」承担该同步职责。
- 同步前必须重新读取最新 backlog。
- 正文不得反向覆盖、推断或修改 backlog 状态。
- 正文落后于数据库时，以数据库为准，并在后续同步中修正。
- 其他审计/测试任务不得直接编辑 Issue #21 正文；这是为了避免整块文本并发覆盖，不意味着它们不能写 backlog 或追加评论。

## 6. Issue 评论用途

评论必须引用一个**已经正式存在的 AUD**。允许记录：

- 认领与 owner；
- branch / PR / head；
- 修改范围；
- commit / migration；
- 构建或测试证据；
- 补充复现；
- FAILED / BLOCKED / NEEDS_DECISION；
- 独立验证通过或失败；
- Release Gate 结论。

评论不得承担以下职责：

- 创建一个尚不存在的待整改问题；
- 分配 AUD 编号；
- 代替 Supabase backlog 的正式状态；
- 覆盖或编辑历史评论来改写事实。

评论应保持 append-only，形成可审计的工作流水。多个任务可以同时追加不同评论；这类写入本身不需要单 writer。

## 7. 不同写入介质的并发规则

自动化体系不采用“全局单 writer”，而按介质处理并发：

### Supabase backlog

- 多任务可并发创建独立问题 row；
- 原子发号、semantic key 唯一约束和事务负责冲突控制；
- 不通过共享文本文件维护正式 backlog。

### GitHub Issue 评论

- 多任务可并发 append；
- 评论只记录已有 AUD 的整改/验证日志；
- 不编辑旧评论改写历史。

### GitHub Issue #21 正文

- 属于整块共享文本，使用固定镜像同步流程；
- 其他任务不直接整段覆盖正文。

### Repo / canonical / CHANGELOG 文件

任何会修改同一路径完整文件的流程都必须采用 optimistic concurrency：

1. 写入前最后一步重新 fetch 完整文件；
2. 获取当前最新 blob SHA；
3. 在最新完整内容上合并本轮修改；
4. 使用最新 SHA 执行 update；
5. 如果发生 stale SHA / conflict，禁止拿旧内容盲目重试；必须重新读取最新文件、重新合并差异后再提交；
6. 连续无法安全合并时停止并记录 `BLOCKED`，不得强制覆盖；
7. 同一任务不并行修改同一路径；相互依赖的多文件修改按逻辑顺序逐个提交并持续使用最新 head。

当前定时体系中，产品代码和文档的自动修复仍集中由「球搭子问题整改」执行，以避免重复修复；交互式总控临时写文件时也可以写，但必须遵守同样的最新 SHA + 重新读取/合并规则。

## 8. 整改状态流转

「球搭子问题整改」从 Supabase backlog 选取问题，优先级为：

```text
P0 → P1 → P2
```

正式修复前：

- 只认领 `OPEN` 且无人真实占用的问题；
- 将 backlog 状态更新为 `IN_PROGRESS`；
- 设置明确 owner、branch/PR/head 与工作范围；
- 再追加对应 AUD 的认领评论。

修复完成并完成基础验证后：

- backlog 只能进入 `FIXED_PENDING_VERIFY`；
- 评论记录 commit / migration / build / 基础验证证据；
- 修复者不得自行标记 `VERIFIED`。

独立巡检/测试/Gate 验证后：

- 验证角色向已有 AUD 追加验证评论；
- 状态归并流程根据独立证据把 backlog 更新为 `VERIFIED`，或失败时退回适当状态；
- 再同步 Issue #21 正文镜像。

## 9. 五个定时任务职责

### 球搭子代码变更巡检
白盒发现与静态独立验证。新问题直接写 Supabase backlog；已有 AUD 的补证据/验证写评论；不修代码、不整段修改 Issue 正文。

### 球搭子全功能测试
黑盒 + Visual QA / UX QA / English QA。新问题直接写 Supabase backlog；已有 AUD 的复现与验证写评论；不修代码、不整段修改 Issue 正文。

### 球搭子部署前审计
独立 Release Gate。新发布问题直接写 Supabase backlog；已有 AUD 的 Gate 证据写评论；不修代码、不整段修改 Issue 正文。

### 球搭子周安全审计
独立安全发现与安全验证。新安全问题直接写 Supabase backlog；已有 AUD 的安全证据写评论；不直接整改、不整段修改 Issue 正文。

### 球搭子问题整改
唯一自动修复者，并承担当前 Issue #21 正文镜像同步职责。原则上处理已有 backlog；若整改过程中确实发现无法并入当前 AUD 的独立问题，也必须通过 `audit_ops.create_issue` 正式创建。它不是 backlog/comment 的唯一 writer。

## 10. 发布与审计要求

- CI green 不等于功能、Visual、权限或 Release Gate 通过。
- Vercel Git 自动部署保持关闭；普通 commit 不主动消耗 Preview。
- 完整候选收口后由总控受控触发一次 Vercel Preview。
- 未清零发布相关 P0/P1、未完成独立验证或 repository/live Supabase 不一致时，不得进入 CloudBase 候选部署。
- 不得自动 merge `main`。

## 11. 当前迁移事实

2026-08-30 起：

- 原 `audit_ops.reserve_issue_id(...)` 的单纯发号机制已升级为正式 backlog 模型；
- 新增 `audit_ops.create_issue(...)`，在一个数据库事务内完成编号分配与待整改问题 row 创建；
- 既有 `AUD-20260829-001` ～ `AUD-20260829-017` 已迁入 `audit_ops.issue_registry`，保持原编号、严重级别、状态与语义；
- 2026-08-29 的计数器保持在 17，不因迁移或自测消耗正式编号；
- GitHub Issue #21 从“唯一问题台账”调整为“正式 backlog 的人类可读镜像 + 已有问题工作评论区”；
- 并发治理采用“数据库行级原子写入 + 评论 append-only + Issue 正文固定镜像同步 + repo 文件 optimistic concurrency”，而不是全局单 writer。
