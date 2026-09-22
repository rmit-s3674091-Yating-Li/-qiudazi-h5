# 球搭子 H5

真实可部署、多人共享赛事数据的移动端 H5 MVP。

## Canonical sources
较大功能开发、AI/Codex 生成代码、审计和 Release Gate 必须先读：

1. `docs/DOCUMENT_GOVERNANCE.md`
2. `docs/NEXT_VERSION_PRODUCT_BASELINE_20260902.md` — 当前 V7 已批准变更总基线；其明确变更项优先于旧专项描述
3. `docs/PRODUCT_BASELINE.md`
4. `docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md`
5. `docs/INTERACTION_BASELINE.md`
6. `docs/QUICK_START_BASELINE.md` — Quick Start / 快速赛事专项真源
7. `docs/EVENT_LIFECYCLE_BASELINE.md` — 赛事取消、退出、终态与结果语义专项真源
8. `docs/TOURNAMENT_PRESENTATION_BASELINE.md` — 对阵、轮次命名与 Match 卡展示专项真源
9. `docs/TEST_DATA_GOVERNANCE.md` — 自动化测试身份/命名/隔离专项真源
10. `docs/PHOTO_ALBUM_BASELINE.md`
11. `docs/VISUAL_DESIGN_BASELINE.md`
12. `docs/BRAND_ASSET_BASELINE.md`
13. `docs/USER_STORY_ACCEPTANCE_BASELINE.md`
14. `docs/P0_ACCEPTANCE.md`
15. `docs/ENVIRONMENT_BASELINE.md`
16. `docs/RELEASE_GOVERNANCE.md`
17. `docs/BROWSER_BLACKBOX_BASELINE.md`
18. `docs/AUDIT_AUTOMATION_GOVERNANCE.md`
19. `docs/PUBLIC_READINESS.md` — Private/Public 可见性准备边界与公开前检查
20. `CHANGELOG.md`
21. 当前源码、migration、Edge Functions 与 CI / Browser evidence

当前开发迭代中，`docs/NEXT_VERSION_PRODUCT_BASELINE_20260902.md` 明确批准的变更优先于尚未逐段迁移的旧专项描述；未被其修改的专项规则继续有效。Quick Start 规则以 next-version baseline + `docs/QUICK_START_BASELINE.md` 为准；赛事对阵/轮次/Match 卡话术以 `docs/TOURNAMENT_PRESENTATION_BASELINE.md` 为准；自动化测试命名与 Hall 隔离以 `docs/TEST_DATA_GOVERNANCE.md` 为准。

## Product summary

- Profile/User、Player、Connection 分离；昵称不是关联键。
- 双打一个 Entry 两个 Player；实际参与事实按 Entry → active EntryPlayer → Player 判断。
- 参赛建议级别是发现/匹配信息，不是硬报名资格。大厅按用户选择的**单项级别**筛选，赛事建议区间只要包含该级别即匹配。
- 标准赛事比赛日期/时间必填；报名截止默认 T-2h 且只能提前；服务端强制 deadline。
- 标准赛事：报名 → 锁定名单 → 自动生成首次对阵 → 查看/复核 → 开赛 → 记分 → 完赛。
- 私有标准赛事大厅只给脱敏预览；详情与报名资格仍服从服务端权限。
- 淘汰赛轮次展示不按 standard/quick 或单/双打分叉：只有两个 Entry、全赛事仅一场时显示“单场对决”，多轮签表再按网球常见 1/4 决赛、半决赛、决赛等术语展示；Match 卡明确 Entry A — VS — Entry B。
- H5 MVP 支持简体中文 / English；375 / 390 / 430px 必须真实 Visual QA。

## Quick Start

快速开赛是底部四导航中央的全局主动作，不是第五个 Tab。

当前规则：
- 可选择本人、accepted Connection 的真实球搭子、本人创建的临时 Player，也可现场新增临时 Player；
- 单打至少 2 人；双打至少 4 人且偶数，**双打必须明确确认谁和谁是队友**，不得把勾选顺序当不可见最终组队规则；
- 城市 optional、场地 optional，禁止默认北京或任何推断城市；最低前置仅为满足比赛类型最低人数的参赛者 + 赛制/计分规则；
- 点击**一键开赛**后服务端创建 Event / Entry / EntryPlayer，名单进入 `locked`、自动生成首次对阵并自动 `start` 到 `ongoing`；唯一真实 Match 直接进入 Match，多 Match 进入 Draw；不再要求第二次“开始赛事”或 Quick Match 的“标记本场已开始”；
- 两人单打只有唯一合法对阵时不显示“重新生成对阵”；仅存在多个合法方案时才允许重新生成；
- 首次 draw 临时失败时保留已创建 Event，只允许对同一 event 执行“恢复开赛”，不得重复建赛；
- Quick 开赛前创建人可取消，非创建人的实际参赛者可退出；退出后低于最低参赛人数时必须受控取消/终止未开始赛事；真正开始 Match 后不再普通退出，改用 Retirement/Walkover 等结果语义；
- 正常 Quick Event 默认 `visibility=public`，`event_mode=quick` **进入赛事大厅**，但不开放报名/候补；
- `locked` 是 Quick Event 名单已固定的正常创建状态，不等于 draw 已完成；
- 新自动化测试身份统一 `TST-*`；legacy `QA-* / QA15-* / EXP-*` 仅兼容过滤，受控测试组织者赛事不得进入普通 Hall；
- 测试 auth alias 必须在 Quick Start RPC、Edge `tournament-command` 与 commit 全链路解析成同一 canonical profile，不能重新假设 `profiles.auth_user_id = auth.uid()` 是唯一映射。
- Quick Start 生成后的签表轮次和 Match 卡完全复用全局赛事展示规则，不另造一套话术。

详细规则见 `docs/NEXT_VERSION_PRODUCT_BASELINE_20260902.md`、`docs/QUICK_START_BASELINE.md`、`docs/EVENT_LIFECYCLE_BASELINE.md`、`docs/TOURNAMENT_PRESENTATION_BASELINE.md`。

## Player / tennis profile

- “我的打球档案”维护水平、城市、单双打偏好、常打时间等球搭子资料。
- “编辑头像与昵称”只修改赛事展示昵称/头像；保存后应 replace/返回来源页，不得在 history 中重复压入“我的打球档案”造成返回循环。
- 临时 Player 可由创建者管理并通过独立 claim invite 让本人加入；claim invite / connection invite / event invite / doubles team invite 语义不得混用。
- claim invite RPC 与其它身份敏感 RPC 必须使用 canonical current profile 解析，支持受控测试 alias。

## Photo model

赛事源相册与“我的参与赛事相册”是两套资产：
- 赛事源相册可多图，只有 organizer 上传/删除；actual participant 可查看/导入；viewer/invited/anon 不可读。
- 参赛者主动“加入我的参与赛事相册”后形成独立 private original + protected preview；赛事源后续删除不级联删除个人副本。
- 个人参与赛事相册默认仅自己可见，可切换搭子可见；accepted Connection 只获得受保护预览，无高清/修改/删除权。
- V7 另要求赛事相册与个人参赛相册均提供合理的“保存到手机”入口，并与“加入我的参赛相册”明确区分；iOS Safari / 微信 WebView 不支持批量能力时必须有可理解的降级方案。

详细规则见 `docs/NEXT_VERSION_PRODUCT_BASELINE_20260902.md`、`docs/PHOTO_ALBUM_BASELINE.md`。

## Environment

- GitHub repository：`rmit-s3674091-Yating-Li/-qiudazi-h5`。当前运行态为 Public；repository visibility 不是应用安全边界。该可见性切换已由 Owner 明确授权并完成，但不构成 merge `main`、移动 `release-candidate`、启动 Release Gate 或 Production deploy 的授权；过渡与残余风险记录见 `docs/PUBLIC_READINESS.md`。
- canonical Supabase：`qiudazi-test`，project ref `rtmjzmgrhifjzxaliltm`。
- Vercel：feature 不自动部署；`release-candidate` 生成 exact-head Preview；`main` 生产。
- 中国区 CloudBase 作为前端测试部署，仍连接 canonical Supabase；CloudBase 部署成功不替代 Vercel Candidate / Release Gate。

完整环境规则见 `docs/ENVIRONMENT_BASELINE.md`、`docs/PUBLIC_READINESS.md`。

## Release / CI

- 开发只写 feature branch；不得自动 merge `main`。
- **开发阶段采用 affected-scope evidence**：普通相关代码运行 Unit + H5 Build；DB/RPC/migration/Edge/integration 相关改动额外运行 Integration；docs-only 变更不机械消耗产品 CI；同一 PR/ref 的 stale run 可由 concurrency 取消。
- `main` 与显式完整验证仍保留完整 Integration / Supabase clean replay invariants；不得因开发期节流降低发布要求。
- repo migration 文件名 version 必须与 live `supabase_migrations.schema_migrations.version` **完全一致**，不仅 SQL 语义相同。
- **Candidate Freeze 后切换 strict exact-SHA evidence**：Unit / Integration / Build / Preview / Browser / Gate 必须属于同一 candidate SHA；任何代码、migration 或 canonical docs commit 移动 exact head 后，旧 candidate evidence 失效。
- `release-candidate` 必须 fast-forward 到通过要求的 exact feature SHA。
- Vercel Preview `/build-meta.json` 必须与 expected SHA/ref 一致。
- Candidate Browser 与 Exploratory Browser 必须读取同一 SHA；workflow 绿灯不能替代 JSON 内部 `ok/pass/fail` 检查。
- live P0/P1 blocker 为 0 后才能 Release Gate PASS；最终 merge main 必须由用户明确授权。

详细规则见 `docs/RELEASE_GOVERNANCE.md`、`docs/BROWSER_BLACKBOX_BASELINE.md`。

## Audit truth

- `audit_ops.issue_registry` 是正式 backlog 唯一事实源。
- `public.audit_issue_registry_readonly` 只是 backend-only 只读投影。
- 新 AUD 必须通过 `audit_ops.create_issue(...)` 创建/去重，禁止手工编号。
- 总控亲自实施的整改最多推进到 `FIXED_PENDING_VERIFY`；必须由独立巡检/黑盒/Gate 收尾验证。定时整改任务实施的修复可由未参与该次实现的总控独立复核。
- `docs/AUDIT_BACKLOG_SNAPSHOT.json` 只是不可达时的 historical/degraded cache，不是 live truth。

## Development hygiene

- migration 使用 `YYYYMMDDHHMMSS_snake_case.sql`，version 全局唯一；live/repo 必须 same version + same SQL semantics。
- schema/RPC/Edge/Type/UI/权限必须全链路同步。
- private Storage、RLS/RPC/SECURITY DEFINER ACL 与 alias 身份边界必须进入审计。
- 自动化测试不得污染普通 Hall；新身份统一 `TST-*`，legacy 前缀只兼容，不再新增命名体系；长期优先显式 test marker / cleanup / isolation。
- 用户错误不得暴露 JWT/SQL/RPC/RLS/Postgres/raw stack。