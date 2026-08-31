# 球搭子 H5

真实可部署、多人共享赛事数据的移动端 H5 MVP。

## Canonical sources
较大功能开发、AI/Codex 生成代码、审计和 Release Gate 必须先读：

1. `docs/DOCUMENT_GOVERNANCE.md`
2. `docs/PRODUCT_BASELINE.md`
3. `docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md`
4. `docs/INTERACTION_BASELINE.md`
5. `docs/QUICK_START_BASELINE.md` — Quick Start / 快速赛事专项真源
6. `docs/PHOTO_ALBUM_BASELINE.md`
7. `docs/VISUAL_DESIGN_BASELINE.md`
8. `docs/P0_ACCEPTANCE.md`
9. `docs/ENVIRONMENT_BASELINE.md`
10. `docs/RELEASE_GOVERNANCE.md`
11. `docs/BROWSER_BLACKBOX_BASELINE.md`
12. `docs/AUDIT_AUTOMATION_GOVERNANCE.md`
13. `CHANGELOG.md`
14. 当前源码、migration、Edge Functions 与 CI / Browser evidence

专项规则优先于通用摘要。Quick Start 规则若与旧 PRD/README/历史 CHANGELOG 冲突，以 `docs/QUICK_START_BASELINE.md` 为准。

## Product summary

- Profile/User、Player、Connection 分离；昵称不是关联键。
- 双打一个 Entry 两个 Player；实际参与事实按 Entry → active EntryPlayer → Player 判断。
- 参赛建议级别是发现/匹配信息，不是硬报名资格。大厅按用户选择的**单项级别**筛选，赛事建议区间只要包含该级别即匹配。
- 标准赛事比赛日期/时间必填；报名截止默认 T-2h 且只能提前；服务端强制 deadline。
- 标准赛事：报名 → 锁定名单 → 自动生成首次对阵 → 查看/复核 → 开赛 → 记分 → 完赛。
- 私有标准赛事大厅只给脱敏预览；详情与报名资格仍服从服务端权限。
- H5 MVP 支持简体中文 / English；375 / 390 / 430px 必须真实 Visual QA。

## Quick Start

快速开赛是底部四导航中央的全局主动作，不是第五个 Tab。

当前规则：
- 可选择本人、accepted Connection 的真实球搭子、本人创建的临时 Player，也可现场新增临时 Player；
- 单打至少 2 人；双打至少 4 人且偶数，**双打必须明确确认谁和谁是队友**，不得把勾选顺序当不可见最终组队规则；
- 设置城市、可选场地、赛制和计分后点击**一键开赛**；
- 服务端创建 Event / Entry / EntryPlayer 后名单直接 `locked`，系统自动生成首次对阵；正常路径不要求用户再点一次“生成对阵”；
- 首次 draw 临时失败时保留已创建 Event，只允许对同一 event 执行“恢复开赛”，不得重复建赛；
- 正常 Quick Event 默认 `visibility=public`，`event_mode=quick` **进入赛事大厅**，但不开放报名/候补；
- `locked` 是 Quick Event 名单已固定的正常创建状态，不等于 draw 已完成；
- 自动化 QA 组织者（当前 `QA-*` / `QA15-*`）创建的赛事不得进入公共 Hall，但仍保留为测试证据并可在测试上下文访问；
- 测试 auth alias 必须在 Quick Start RPC、Edge `tournament-command` 与 commit 全链路解析成同一 canonical profile，不能重新假设 `profiles.auth_user_id = auth.uid()` 是唯一映射。

详细规则见 `docs/QUICK_START_BASELINE.md`。

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

详细规则见 `docs/PHOTO_ALBUM_BASELINE.md`。

## Environment

- GitHub repository：`rmit-s3674091-Yating-Li/-qiudazi-h5`，canonical visibility 为 Private。
- canonical Supabase：`qiudazi-test`，project ref `rtmjzmgrhifjzxaliltm`。
- Vercel：feature 不自动部署；`release-candidate` 生成 exact-head Preview；`main` 生产。
- 中国区 CloudBase 作为前端测试部署，仍连接 canonical Supabase；CloudBase 部署成功不替代 Vercel Candidate / Release Gate。

完整环境规则见 `docs/ENVIRONMENT_BASELINE.md`。

## Release / CI

- 开发只写 feature branch；不得自动 merge `main`。
- 每个候选 exact head 必须通过 H5 Build Check + Supabase clean replay。
- repo migration 文件名 version 必须与 live `supabase_migrations.schema_migrations.version` **完全一致**，不仅 SQL 语义相同。
- Candidate Freeze 后任何代码、migration 或 canonical docs commit 都会移动 exact head，旧 Preview / Browser / Gate 证据失效。
- `release-candidate` 必须 fast-forward 到通过 CI 的 exact feature SHA。
- Vercel Preview `/build-meta.json` 必须与 expected SHA/ref 一致。
- Candidate Browser 与 Exploratory Browser 必须读取同一 SHA；workflow 绿灯不能替代 JSON 内部 `ok/pass/fail` 检查。
- live P0/P1 blocker 为 0 后才能 Release Gate PASS；最终 merge main 必须由用户明确授权。

详细规则见 `docs/RELEASE_GOVERNANCE.md`、`docs/BROWSER_BLACKBOX_BASELINE.md`。

## Audit truth

- `audit_ops.issue_registry` 是正式 backlog 唯一事实源。
- `public.audit_issue_registry_readonly` 只是 backend-only 只读投影。
- 新 AUD 必须通过 `audit_ops.create_issue(...)` 创建/去重，禁止手工编号。
- `docs/AUDIT_BACKLOG_SNAPSHOT.json` 只是不可达时的 historical/degraded cache，不是 live truth。

## Development hygiene

- migration 使用 `YYYYMMDDHHMMSS_snake_case.sql`，version 全局唯一；live/repo 必须 same version + same SQL semantics。
- schema/RPC/Edge/Type/UI/权限必须全链路同步。
- private Storage、RLS/RPC/SECURITY DEFINER ACL 与 alias 身份边界必须进入审计。
- QA 自动化不得污染公共 Hall；应优先使用显式 test marker / cleanup / isolation，当前昵称约定只是过渡方案。
- 用户错误不得暴露 JWT/SQL/RPC/RLS/Postgres/raw stack。
