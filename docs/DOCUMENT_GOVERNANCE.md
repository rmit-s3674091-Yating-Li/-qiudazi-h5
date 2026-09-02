# 球搭子文档治理基线

本文件是「球搭子」长期文档治理的 canonical source。目标是避免 PRD、专项基线、CHANGELOG、审计 snapshot、自动化 prompt、运行时状态和历史记录互相覆盖或产生“多份真源”。

## 1. 文档/证据四层模型

### A. Canonical policy / product baseline
用于定义“现在应该怎样工作”。包括：
- `docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md`
- `docs/PRODUCT_BASELINE.md`
- `docs/INTERACTION_BASELINE.md`
- `docs/USER_STORY_ACCEPTANCE_BASELINE.md` — User Story、Acceptance Criteria 与黑盒场景派生专项真源
- `docs/QUICK_START_BASELINE.md` — Quick Start / 快速赛事专项真源
- `docs/EVENT_LIFECYCLE_BASELINE.md` — 赛事编辑、取消、删除与历史保留专项真源
- `docs/TOURNAMENT_PRESENTATION_BASELINE.md` — 赛事对阵、轮次命名、Match 卡 PK 展示专项真源
- `docs/TEST_DATA_GOVERNANCE.md` — 自动化测试身份、命名、Hall 隔离与 cleanup 专项真源
- `docs/VISUAL_DESIGN_BASELINE.md`
- `docs/BRAND_ASSET_BASELINE.md` — Logo、品牌图标、Share Cover 与社交分享视觉专项真源
- `docs/PHOTO_ALBUM_BASELINE.md`
- `docs/P0_ACCEPTANCE.md`
- `docs/ENVIRONMENT_BASELINE.md`
- `docs/RELEASE_GOVERNANCE.md`
- `docs/BROWSER_BLACKBOX_BASELINE.md`
- `docs/AUDIT_AUTOMATION_GOVERNANCE.md`
- 本文件 `docs/DOCUMENT_GOVERNANCE.md`

这些文档可以互相引用，但不得在多个文件中独立维护同一条动态事实。专项规则优先放到专项基线，其它文档只做摘要和链接。User Story / AC 与黑盒场景派生以 `docs/USER_STORY_ACCEPTANCE_BASELINE.md` 为准；Quick Start 相关规则以 `docs/QUICK_START_BASELINE.md` 为准；赛事编辑/取消/删除以 `docs/EVENT_LIFECYCLE_BASELINE.md` 为准；赛事对阵/轮次展示以 `docs/TOURNAMENT_PRESENTATION_BASELINE.md` 为准；自动化测试数据命名与隔离以 `docs/TEST_DATA_GOVERNANCE.md` 为准；赛事照片权限与个人副本模型以 `docs/PHOTO_ALBUM_BASELINE.md` 为准；Logo、品牌图标与社交分享封面以 `docs/BRAND_ASSET_BASELINE.md` 为准。

### B. Runtime truth
用于回答“现在实际上是什么状态”。运行时事实优先于任何静态文档中的旧状态描述：
- GitHub PR exact head / commit / CI / branch ref；
- Supabase live schema、migration、RPC、RLS、Storage、Edge Function；
- `audit_ops.issue_registry`（正式 AUD backlog 唯一事实源）；
- Vercel deployment metadata 与 `/build-meta.json`；
- Candidate Browser Blackbox same-SHA workflow/artifact；
- 自动化当前 enabled/status/schedule。

静态文档不得伪装成这些动态事实的实时镜像。

### C. Evidence / changelog
用于回答“为什么这样判断、发生过什么”。包括：
- 根目录 `CHANGELOG.md`；
- Git commit / PR discussion；
- Issue #21 append-only 工作日志；
- Browser Blackbox JSON / screenshot / trace；
- CI logs、部署 metadata、审计 evidence。

Evidence 可以证明某一时点，但不能覆盖当前 canonical policy 或 runtime truth。

### D. Historical snapshot / degraded cache
包括历史 CHANGELOG 快照、旧交付包、旧 Demo、旧 PRD、`docs/AUDIT_BACKLOG_SNAPSHOT.json` 等。

规则：
- 必须显式标识 snapshot / historical / generated_at / source_head（适用时）；
- 不得用于判断当前 PR head、当前 AUD status/owner、当前 Gate、当前 live schema 或当前部署；
- `AUDIT_BACKLOG_SNAPSHOT.json` 只在正式 backlog 不可达时按 `AUDIT_AUTOMATION_GOVERNANCE` 降级读取，绝不是第二事实源。

## 2. 冲突解释顺序

同一主题出现冲突时，按以下顺序处理：
1. 先确定该冲突属于“规范”还是“运行时事实”；
2. 规范问题：对应专项 canonical baseline > 通用 baseline > README 摘要 > CHANGELOG/evidence > historical snapshot；
3. 运行时事实：受控 live source / exact-head evidence > 文档中的状态摘要；
4. 若两个 canonical baseline 对同一规则互相冲突，不允许自动化自行择一；记录冲突并停止受影响的写操作/Gate，交由总控/用户裁决后一次性同步所有相关文档。

README 是入口和摘要，不承担所有详细规则的第二份维护。

## 3. 变更联动矩阵

发生以下变更时，提交前必须同步对应文档：
- 产品行为/状态机/权限：PRD + PRODUCT；有页面行为则同步 INTERACTION；影响 P0/Gate 则同步 P0；同时检查对应 User Story / AC 是否需要新增或修改；写 CHANGELOG。
- User Story / AC / 黑盒测试模型：USER_STORY_ACCEPTANCE；影响 Browser runner/失败分类则同步 BROWSER_BLACKBOX；影响 Gate 覆盖要求则同步 RELEASE/P0；并同步正式“全功能测试”自动化 prompt；写 CHANGELOG。
- 赛事编辑、取消、删除、历史保留、cancelled Hall/My Events 语义：EVENT_LIFECYCLE + PRODUCT/INTERACTION/P0 必要摘要；同步对应 User Story / AC；涉及 DB 状态/RPC 时必须同步 migration/live parity；写 CHANGELOG。
- Quick Start 参赛者来源、双打组队、自动 draw、Hall 可见性、恢复语义：QUICK_START + PRD/PRODUCT/INTERACTION/P0 必要摘要；同步对应 User Story / AC；写 CHANGELOG。
- 淘汰赛轮次命名、循环赛轮次话术、Match 卡 A-vs-B 关系、单场对决展示：TOURNAMENT_PRESENTATION + PRODUCT/INTERACTION/P0 必要摘要；同步对应 User Story / AC；若影响 Quick Start 同步 QUICK_START；写 CHANGELOG。
- 自动化测试命名、test identity、Hall 隔离、cleanup/test marker：TEST_DATA_GOVERNANCE；影响 Browser runner 时同步 BROWSER_BLACKBOX / EXPLORATORY；影响 Hall 产品查询时同步 PRODUCT/INTERACTION/P0 必要摘要；写 CHANGELOG。
- 视觉/移动端信息架构：VISUAL；影响交互则同步 INTERACTION；影响用户故事验收结果时同步相关 AC；写 CHANGELOG。
- Logo、品牌图标、Share Cover、社交分享元数据或品牌视觉决策：BRAND_ASSET_BASELINE；影响页面视觉则同步 VISUAL；影响链接分享/Browser Visual 验收则同步 USER_STORY_ACCEPTANCE/BROWSER_BLACKBOX 必要 AC；写 CHANGELOG。AI 生成图中的新符号不得在未更新 BRAND_ASSET_BASELINE 的情况下升级为 Logo。
- 赛事/个人照片模型或 viewer/participant/owner 入口权限：PHOTO_ALBUM + PRD/PRODUCT/INTERACTION/P0 必要摘要；同步对应 User Story / AC；写 CHANGELOG。
- 环境身份、Supabase/Vercel/GitHub 配置：ENVIRONMENT；影响发布链则同步 RELEASE；写 CHANGELOG。
- 发布分支、freeze、exact-head、Gate：RELEASE；影响浏览器证据则同步 BROWSER_BLACKBOX；写 CHANGELOG。
- Browser runner/覆盖范围/失败分类：BROWSER_BLACKBOX + USER_STORY_ACCEPTANCE；影响 Gate 则同步 RELEASE/P0；写 CHANGELOG。
- AUD/backlog/owner/snapshot/自动化协作：AUDIT_AUTOMATION_GOVERNANCE；影响本文件的文档层级时同步 DOCUMENT_GOVERNANCE；写 CHANGELOG。
- 文档治理本身：DOCUMENT_GOVERNANCE，并同步所有正式自动化 prompt 的读取要求；不得只在聊天中约定。

纯实现修复若没有改变产品已批准规则，不需要机械重写 PRD；但必须通过 migration/source/CI/evidence 与 CHANGELOG/AUD 证据留痕。若实现修复改变了某条 User Story 的可观察行为或 AC，必须同步 USER_STORY_ACCEPTANCE。

## 4. Candidate Freeze 与文档

canonical 文档属于 release candidate 的一部分。Candidate Freeze 后：
- 任何 canonical 文档提交都会改变 exact head；
- 旧 Preview、Browser artifact 和 Gate 证据自动失去 exact-head 资格；
- 必须重新执行 CI → release-candidate → exact-head Preview → Browser Blackbox → Gate；
- historical snapshot 的纯归档整理若不进入候选不影响 candidate；一旦提交到候选分支，同样改变 head。

不得为了节省 Vercel Hobby 配额而继续复用旧 SHA 证据。

## 5. 自动化统一读取规则

五个正式任务——`球搭子代码变更巡检`、`球搭子全功能测试`、`球搭子问题整改`、`球搭子部署前审计 V2`、`球搭子周安全审计 V2`——每轮都必须：
1. 先读取本文件与 `docs/AUDIT_AUTOMATION_GOVERNANCE.md`；
2. 根据任务主题读取对应专项 canonical baseline；所有全功能/Browser/Gate 测试必须读取 `docs/USER_STORY_ACCEPTANCE_BASELINE.md` 并以 User Story → AC → 场景矩阵组织覆盖；Quick Start 相关任务必须读取 `docs/QUICK_START_BASELINE.md`；赛事编辑/取消/删除相关任务必须读取 `docs/EVENT_LIFECYCLE_BASELINE.md`；对阵/签表/轮次/Match 卡相关任务必须读取 `docs/TOURNAMENT_PRESENTATION_BASELINE.md`；赛事照片与角色入口必须读取 `docs/PHOTO_ALBUM_BASELINE.md`；Logo/Share Cover/社交分享视觉相关任务必须读取 `docs/BRAND_ASSET_BASELINE.md`；任何会创建测试 Profile/Event 的任务必须读取 `docs/TEST_DATA_GOVERNANCE.md`；
3. 再读取 PR exact head 与相关 runtime truth；
4. 不得从聊天记忆、历史 CHANGELOG、旧 artifact 或 snapshot 反推当前状态；
5. 写 repo canonical 文件时使用最新 blob SHA + optimistic concurrency；
6. 发现 canonical 文档冲突时停止受影响写操作，不得自行“多数表决”。

全功能黑盒测试不得只维护静态按钮/页面 checklist。每次候选前应由当前 exact-head User Story / AC 派生 `User Story × Role × State × Locale × Viewport × Network/Concurrency` 场景，并把每个 FAIL 回溯到具体 US/AC。自动化 prompt 若与仓库 canonical governance 冲突，以当前 exact head 的仓库 governance 为准，并应在可写阶段同步修正 prompt，避免长期漂移。

## 6. AUD 编号与审计记录

- 新 AUD 只能通过 `audit_ops.create_issue(...)` 创建和语义去重，禁止手工编号。
- issue counter 只是分配器状态，不是事实源；分配器必须以 registry 已存在最大 sequence 为下界自愈，不能因 counter 落后而撞号。
- 创建器异常时保留完整 `UNFILED_PENDING_DB_ACCESS` / allocator failure 证据，修复创建器后再正式登记；不得绕过 registry 直接伪造 AUD。
- Issue #21 只做镜像和 append-only evidence，不替代 registry。

## 7. 当前 Quick Start / Hall / 测试数据治理说明

自 2026-08-31 post-deploy remediation 起，Quick Start 规则以 `docs/QUICK_START_BASELINE.md` 为专项真源。正常 Quick Event 默认 public 并进入 Hall，但不开放报名；双打必须显式确认队友；创建后系统自动 draw；只有首次 draw 异常时进入“恢复开赛”并只重试同一 Event。`locked` 是 Quick Event 名单已经固定的底层状态，不代表 draw 已完成。

Quick Start 生成签表后不使用独立赛事阶段词汇。标准/quick、单打/双打共用 `docs/TOURNAMENT_PRESENTATION_BASELINE.md`：只有两个 Entry、全赛事仅一场淘汰赛时显示“单场对决”，不显示“决赛”；多轮淘汰赛按网球通行的 1/4 决赛、半决赛、决赛等表达；Match 卡必须明确 Entry A — VS — Entry B。

**标准 private event 的产品规则没有改变：** `event_mode=standard + visibility=private` 仍进入赛事大厅发现流，但只返回脱敏卡。未授权用户不得看到 owner、精确日期时间、场地、费用、参赛人数、报名截止等敏感信息。大厅可发现、完整详情权限、报名资格必须分开判断。

自动化测试隔离是独立治理规则，不能通过“只返回 public event”实现。新自动化 Profile 统一 `TST-<SUITE>-<ROLE>-<SHA6>-<RUN>`；历史 `QA-* / QA15-* / EXP-*` 仅作兼容过滤。详细规则见 `docs/TEST_DATA_GOVERNANCE.md`。

身份方面，Quick Start 的 RPC、Edge Function 与 tournament commit 必须统一支持 current canonical profile + 受控 auth alias，且不得为方便 Edge 读取而扩大 `private.profile_auth_aliases` 对客户端角色的权限。