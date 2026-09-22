## 2026-09-22 — V7 login/privacy navigation remediation (unreleased)

- Added a public pre-login `/privacy-notice` route and wired login/profile consent links to it.
- Fixed the authenticated Settings & Privacy navigation trap by making `/privacy` return explicitly to `/me` rather than relying on browser history.
- Added a Unit regression contract for both navigation paths. This product-code change invalidates the previous Candidate Freeze SHA and requires a new exact-head CI / Preview / Browser chain.

## 2026-09-21 — V7 development close-out (unreleased)

- Repository visibility is now Public under explicit Owner authorization; this environment change does not authorize merge `main`, `release-candidate` movement, Release Gate, or Production deploy.
- V7 scoring idempotency, nickname identity exchange/account switching, and Standard Event venue persistence foundation are independently VERIFIED.
- Standard Event POI search/select host wiring is implemented behind the provider-neutral MapProvider boundary and is independently VERIFIED; Quick Start remains free of map/POI/geolocation steps.
- Public GitHub-hosted Actions are executing normally again; current development uses affected-scope evidence, while Candidate/Release stages retain strict exact-SHA requirements.
- Development-stage actionable work is closed: no TODO / CODE_REOPEN / NEEDS_VERIFY / IN_PROGRESS blockers remain. Remaining work is Browser/real-device verification before any Candidate/Release phase; documentation cleanup is closed for the current development scope.

# 球搭子 H5 — CHANGELOG

本文件记录影响产品行为、数据模型、权限、技术架构和发布状态的主要变化。更细的逐提交证据保留在 Git history、PR discussion、GitHub Actions artifacts 与 Issue #21 append-only 工作日志中。当前产品规则以 canonical baseline 为准，CHANGELOG 只记录发生过什么，不覆盖当前规范。

---

## 2026-08-31 — PR #20 合并与首轮 Production 部署

- PR #20 `Major event lifecycle, privacy and language update` 已合并到 `main`；Vercel Production 成功构建并返回与 main 一致的 `/build-meta.json`。
- Production 首页可正常访问，Supabase canonical 项目继续为 `qiudazi-test / rtmjzmgrhifjzxaliltm`。
- 合并后 production webhook 误触发 Candidate Browser 的旧分支校验，属于 QA workflow 触发范围问题，不是产品回归；后续应在新开发分支修正，避免 main 发布出现假红灯。
- 中国区 CloudBase 使用 main 构建进行手工部署测试，并成功连通 canonical Supabase。

### 发布后治理复盘

- 后续白盒巡检创建 `AUD-20260831-003` P0：PR #20 merge 时 repo/live 有两份 migration **SQL 语义相同但 version 不同**，违反已确定的 Gate same-version 规则：
  - live `20260830012349_event_photo_delete_serialization`，repo 曾为 `20260830012500_...`；
  - live `20260830032103_restrict_readonly_audit_issue_registry_view`，repo 曾为 `20260830032100_...`。
- 该问题不是线上 schema 行为漂移，而是 release traceability / reproducibility 违规；PR #22 已把 repo 文件名纠正到 live exact version，等待当前 exact-head clean replay 后再 VERIFY。
- 由此进一步固定：Release Gate 不只检查 SQL 语义，**repo migration 14 位 version 与 live version 必须完全一致**。

---

## 2026-08-31 — Post-deploy remediation / PR #22

新分支：`feature/20260831-postdeploy-ui-quickstart-filter-qa`  
PR：#22（Draft，禁止自动 merge）

### 赛事详情移动端 CTA
- 修复赛事详情底部 action bar 在窄屏下把“已报名 · 查看名单”等文案挤成竖排的问题。
- 移动端按钮必须保持可读横向布局/合理比例，进入 375/390/430px Visual QA。

### 大厅单项级别筛选
- 恢复“参赛级别”单项筛选。
- 用户选择单个级别；只要赛事建议范围包含该级别即匹配。
- 该能力只帮助发现赛事，不构成报名硬资格。

### Quick Start 参赛者来源
- Quick Start 不再只允许“本人 + 本人临时 Player”。
- 现在允许选择：本人 self Player、accepted Connection 的真实球搭子的 self Player、本人未认领临时 Player、现场新增临时 Player。
- 后端仍拒绝任意陌生用户 Player，避免扩大权限。

### Quick Start 双打队友确认
- 用户反馈“2v2 谁和谁是队友不清楚”。
- 废止“按勾选顺序每两人静默组队”作为最终产品规则。
- 双打流程新增明确“确认双打队友”步骤，逐队显示两名成员并允许调整。
- 关联 `AUD-20260831-008` P1，当前 `FIXED_PENDING_VERIFY`。

### Quick Start 一键开赛 / 自动 draw
- 正常流程统一为：选人 →（双打）确认队友 → 设置赛制 → **一键开赛**。
- Event/Entry/EntryPlayer 创建后名单直接 `locked`，随后系统自动生成首次对阵；正常路径不再要求用户点击第二个“生成对阵”按钮。
- `locked` 表示 roster 已固定，不等于 draw 已完成；若 draw 临时失败，可出现 locked + `draw_generated=false`。
- 异常恢复统一表达为“开赛未完成 / 恢复开赛”，只重试同一 event draw，禁止重复 create。
- G 的历史 `08月31日 快速双打` 曾停留在 2 个 doubles Entry、0 Match、`draw_generated=false`；已先用 `commit_tournament` 事务回滚演练，再通过同一权威 commit 边界补写唯一一场 knockout Match。该场赛事随后可正常进入后续管理状态。

### Quick Start alias 身份链
- 用户真实 CloudBase 操作复现：Quick Event 能创建，但 tournament-command 在 alias 身份下先返回 403 PROFILE_REQUIRED；修 Edge 后又暴露 commit 层访问 private alias schema 的 500。
- `create/get/accept_player_claim_invite` 已统一使用 canonical current profile。
- `tournament-command` 升级到 v3，使用受控 canonical profile resolution。
- `commit_tournament` 不再直接读取 private alias 表，统一通过受控解析函数；事务 rollback 验证 alias actor 能通过 commit 权限边界。
- private alias 表没有因此向 anon/authenticated 扩权。
- 关联 `AUD-20260831-004`、`AUD-20260831-006`，等待 browser verify。

### Quick Event 大厅可见性
- 产品决策更新：正常 Quick Event 属于公共赛事发现的一部分。
- `create_quick_event` 默认 `visibility='public'`；公共 Hall 的 `list_events(false, ...)` 包含 `event_mode='quick'`。
- Quick Event Hall 卡不开放报名/候补，`registration_deadline` 不承担 quick 权限边界。
- 历史非 QA Quick Event 已回填 public。
- live Hall RPC 已确认正常用户 G 创建的 Quick Event 可见。
- 旧规则“quick 不进大厅 / quick 必须 private”正式废止。
- 关联 `AUD-20260831-009` P1，当前 `FIXED_PENDING_VERIFY`。

### private 标准赛事恢复脱敏发现
- 修 Quick Event Hall 时曾错误加入总过滤 `visibility='public'`，导致 private standard event 被排除出 Hall，违反既有“可发现但脱敏”规则。
- 已恢复：private standard event 继续进入 Hall，但 owner、精确日期时间、场地、费用、参赛/候补人数、报名截止等敏感字段保持隐藏。
- “大厅可发现 / 完整详情权限 / 报名资格”继续分离。
- 关联 `AUD-20260831-012` P1，当前 `FIXED_PENDING_VERIFY`。

### 自动化测试数据命名与 Hall 隔离
- 首版隔离要求“赛事名 + 组织者昵称”同时带 QA，无法覆盖 Quick Start 自动生成的自然语言赛事名，因此测试赛事污染普通 Hall。
- 又发现 Exploratory 使用 `EXP-*`，证明继续临时追加前缀不可持续。
- 新 canonical 规则：**所有新自动化测试 Profile 统一 `TST-<SUITE>-<ROLE>-<SHA6>-<RUN>`**。
- legacy `QA-* / QA15-* / EXP-*` 仅兼容过滤，禁止新脚本继续发明第四套根前缀。
- Hall 隔离按受控测试组织者身份/未来结构化 test marker，不依赖赛事名称；测试数据仍可在“我的赛事”、direct URL、trace/artifact 中保留。
- 新增 `docs/TEST_DATA_GOVERNANCE.md`；关联 `AUD-20260831-010` P1，当前 `FIXED_PENDING_VERIFY`。

### 我的赛事排序
- “我的赛事”改为有效赛事在前、失效赛事在后。
- 有效区按比赛时间从近到远；finished 或比赛时间已过去且不处于 ongoing 的赛事进入失效区，失效区按时间从新到旧。
- `ongoing` 被视为权威生命周期状态，不因本地时钟自动改成 finished；历史无日期赛事暂不因缺时间自动判失效。
- live exact migrations `20260831114115` / `20260831114150` 已同步回 repo，等待 clean replay。

### 统一赛事轮次话术与 Match 卡 PK 展示
- 原实现以“某轮只有 1 场 = 决赛”机械命名，导致两个 Entry、全赛事只有一场时显示“决赛”，容易让用户误以为此前存在预赛/半决赛。
- 新增 `docs/TOURNAMENT_PRESENTATION_BASELINE.md`：standard/quick、singles/doubles 共用同一套网球轮次规则。
- **整个淘汰赛只有 2 个 Entry、1 场 Match 时显示“单场对决 / Single match”**，不显示 Final。
- 多轮淘汰赛按网球常见 Quarterfinals / Semifinals / Final 等结构展示；循环赛继续按 Round N。
- Match 卡从“两行名单 + 角落 VS”改成明确 Entry A — VS — Entry B；双打成员保持同一 Team 分组。
- 单场对决区域不再提示“左右滑动查看各轮”。
- 关联 `AUD-20260831-013` P2；总控实施修复后仅推进到 `FIXED_PENDING_VERIFY`，等待独立巡检/浏览器验证。

### Quick player fallback avatar
- 无真实头像的临时 Player 使用 `<span class="avatar fallback">`；旧 `.quick-player > span { flex:1 }` 误把 fallback avatar 当文字容器拉伸成椭圆。
- CSS 改为固定 avatar 36×36，仅文字容器伸展。
- 关联 `AUD-20260831-007` P2，等待 Visual/browser verify。

### 头像昵称保存导航
- 原流程 `我的打球档案 → 编辑头像与昵称 → 保存` 成功后又 push 一个新的“我的打球档案”，造成左上返回重新进入编辑页。
- 保存后改为明确返回来源并 replace history；直接 URL 进入编辑页保留安全 fallback。
- 关联 `AUD-20260831-005` P1，等待 browser verify。

### 临时 Player claim invite
- “邀请 TA 加入球搭子”旧 RPC 仍直接按 auth_user_id 识别身份，alias 用户会失败。
- create/get/accept claim invite 已统一 canonical current profile；真实 alias 事务验证可以生成 claim token 且 rollback 不留脏邀请。
- 关联 `AUD-20260831-004` P1。

### 整改与验证职责分离
- 总控可以直接整改 `OPEN + owner=null` 的问题，但亲自实施的修复**最多推进到 `FIXED_PENDING_VERIFY`**。
- 总控不得对自己实施的修复自行给 `VERIFIED`；必须由独立代码巡检、真实 Browser Blackbox 或 Release Gate 提供独立证据后收尾。
- 若修复由“球搭子问题整改”等独立定时整改任务实施，则未参与该次实现的总控可以作为独立复核方判断是否收尾。
- 该边界以 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 为长期真源，README 同步摘要。

### 文档治理同步
- 新增 `docs/QUICK_START_BASELINE.md`、`docs/TEST_DATA_GOVERNANCE.md`、`docs/TOURNAMENT_PRESENTATION_BASELINE.md`。
- `docs/DOCUMENT_GOVERNANCE.md` 已把 QUICK_START / TEST_DATA / TOURNAMENT_PRESENTATION 纳入 canonical 层级、变更联动矩阵和自动化必读规则。
- `README.md`、`docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md`、`docs/PRODUCT_BASELINE.md`、`docs/INTERACTION_BASELINE.md`、`docs/P0_ACCEPTANCE.md` 已做本轮规则同步；专项细则以对应专项 baseline 为准。
- `docs/AUDIT_BACKLOG_SNAPSHOT.json` 是历史/降级缓存；正式事实源仍是 `audit_ops.issue_registry`。
- 当前所有 canonical docs commit 都属于 PR #22 exact head 的一部分，因此旧候选/browser/Gate 证据全部失效，必须重新跑完整 exact-head 链。

---

## 2026-08-30 — Browser / Release / Governance 基线收口

- GitHub Actions + Playwright 成为真实 Browser Blackbox 执行器；HTTP/source/CI/Supabase/Vercel metadata 只能补充，不能代替页面交互。
- Candidate Browser artifact 固定包含 same-SHA `result.json`、`full-lifecycle-result.json` 与必要 screenshot/trace；Gate 必须检查 JSON 内部 ok，而不是只看 workflow 绿灯。
- 发布采用三层模型：feature → exact-head CI → `release-candidate` exact Preview → Browser/Visual/English → Gate → 用户决定 merge main。
- Vercel Git deployment 白名单：feature 默认不部署，`release-candidate` 生成 Preview，`main` 生产。
- Candidate Freeze 后任何代码、migration、测试基础设施或 canonical docs commit 都让旧 Preview/Browser/Gate 证据失效。
- GitHub repository 已转 Private；当前 main 主要依赖流程治理，不把不可用的 repository ruleset 当成已生效保护。
- Supabase canonical 测试环境固定为 `qiudazi-test / rtmjzmgrhifjzxaliltm`。
- `audit_ops.issue_registry` 是正式 backlog 唯一事实源；readonly view / RPC / snapshot 均不是第二真源。
- 赛事照片最终模型确立为“赛事源相册 + participant 独立个人副本”；源删除不级联删除已导入个人资产。
- 标准赛事锁定名单后自动首次 draw；失败时只恢复同一 locked event draw。

---

## 2026-08-29 — V6 生命周期、隐私与双语大版本

- 参赛建议级别由单值升级为区间，仅用于发现/匹配。
- 比赛日期/开赛时间成为 P0 必填；报名截止默认开赛前 2 小时且只能提前。
- 报名截止成为服务端名单写入边界，截止后进入 locked 语义。
- 私有赛事拆分“大厅发现 / 完整详情权限 / 报名资格”，大厅预览脱敏。
- `viewer_role` 成为赛事管理、比赛记分和比分更正等身份敏感 UI 的权威角色事实。
- “我参与的”按有效 Entry→Player membership 判断，双打两位真实搭档都纳入。
- 档案字段可见性、赛事邀请/双打邀请隐私由服务端执行。
- H5 MVP 建立简体中文 / English 轻量 i18n 与 375/390/430px Visual QA 基线。

---

## 当前发布原则

- Repository 保持 Private。
- 所有开发写 feature branch，经 PR；禁止自动化直接 merge/push main。
- 当前 candidate 必须 exact-head H5 Build Check + migration preflight + Supabase clean replay 全绿。
- repo/live migration 必须 same version + same SQL semantics。
- `release-candidate` 只 fast-forward 到通过 CI 的 exact feature SHA。
- Vercel Preview 必须 READY 且 build-meta same SHA/ref。
- Candidate Browser + Exploratory Browser 只验证唯一 exact-head Preview；内部 FAIL 必须分类。
- live P0/P1 blocker 为 0 后才能 Gate PASS。
- Gate PASS 仍需用户明确授权 merge main。