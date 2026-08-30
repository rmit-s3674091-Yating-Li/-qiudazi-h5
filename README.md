# 球搭子 H5

真实可部署、多人共享赛事数据的移动端 H5 MVP。

## Canonical sources
较大功能开发、AI/Codex 生成代码、审计和 Release Gate 必须先读：

1. `docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md`
2. `docs/PRODUCT_BASELINE.md`
3. `docs/INTERACTION_BASELINE.md`
4. `docs/PHOTO_ALBUM_BASELINE.md` — 当前赛事照片/参与赛事相册专项真源
5. `docs/VISUAL_DESIGN_BASELINE.md`
6. `docs/P0_ACCEPTANCE.md`
7. `docs/AUDIT_AUTOMATION_GOVERNANCE.md`
8. `CHANGELOG.md`
9. 当前源码、migration、Edge Functions 与 GitHub CI

若早期 PRD、Demo、旧 bundle 或历史评论与上述当前基线冲突，以当前基线和用户最近明确决定为准。

## Stable product principles
- Profile/User、Player、Connection 分离；昵称不是关联键。
- 双打一个 Entry 两个 Player；“我参与的”按有效 Entry→Player 事实判断。
- 参赛建议级别是发现/匹配区间，不是硬报名门槛。
- 比赛日期/时间 P0 必填；报名截止默认开赛前 2 小时且只能提前；截止由服务端强制执行。
- 私有赛事大厅可发现但必须脱敏；可发现 ≠ 详情权限 ≠ 报名资格。
- 服务端 `viewer_role` 等权威事实决定组织者/参与者/受邀者权限，本地 Profile/cache 不能单独授权。
- 邀请关系、赛事邀请、双打组队邀请、临时 Player 历史关联邀请语义独立。
- 稳定数据不做高频轮询；mutation 后精准刷新；用户错误不暴露 JWT/SQL/RPC/RLS/raw stack。
- H5 MVP 支持简体中文 / English，375 / 390 / 430px 需要真实 Visual QA。

## Final photo model
### 赛事源相册
- 一场赛事可多图。
- 只有赛事创建人/organizer 可以上传和删除源照片，管理入口只在赛事页面。
- actual participant 可以看源照片，但不能上传、替换、删除。
- 赛事公开不代表照片公开；普通 viewer、仅 invited 未报名用户、匿名用户均无照片读取权。
- 默认受保护水印预览；高清必须显式触发并重新授权；`event-photos` 保持 private。

### 参与赛事相册
- 系统不自动导入赛事照片。
- actual participant 对当前仍存在的赛事源照片逐张点击“加入我的参与赛事相册”。
- 导入成功后形成该用户自己的独立 private original + protected preview 个人资产，不是 EventPhoto 的简单引用。
- organizer 后续删除赛事源照片：赛事页消失、其他人不能再新导入；**已成功导入的个人副本继续存在，不受影响**。
- `source_event_photo_id` 仅用于溯源，源删除必须 SET NULL / 等价解耦，禁止级联删除个人资产。
- 用户“移出我的相册”只删除自己的个人副本，不影响赛事源和其他用户。

### 个人相册隐私
- “我的 → 设置与隐私”只控制参与赛事相册整体 `仅自己可见`（默认）/ `搭子可见`，不出现赛事源照片管理入口。
- 只有 accepted Connection 可查看开启 partners 的相册。
- 搭子只得到服务端短时签发的水印预览；列表不下发 Storage path；无高清、修改、删除或赛事管理权。

详细规则见 `docs/PHOTO_ALBUM_BASELINE.md`。

## Development hygiene
- migration 版本唯一、顺序清晰、可 fresh replay；schema/RPC/Edge/Type/UI/权限/P0 必须全链路一致。
- private Storage、RLS/RPC/SECURITY DEFINER ACL 与业务身份校验必须进入 Release Gate。
- 共享 repo/canonical/CHANGELOG 文件采用最新 blob SHA + optimistic concurrency；stale 时重新读取合并，禁止旧内容覆盖。
- 不保留已经被新流程替代的可达旧页面/旧权限路径。

## Audit backlog and automation
- Supabase `audit_ops.issue_registry` 是正式 backlog 唯一事实源。
- 新问题通过 `audit_ops.create_issue(...)` 原子创建并语义去重。
- GitHub Issue #21 正文只是人类可读镜像；评论用于已有 AUD 的 append-only 工作日志。
- 不存在全局唯一 writer；数据库 row 和评论可并发写。
- 「球搭子问题整改」是唯一自动修复者，不是唯一 writer；修复后只能到 `FIXED_PENDING_VERIFY`，必须独立验证后才能 `VERIFIED`。
- 正式 backlog 优先通过 `public.audit_list_issues()` 读取；若连接器安全层不允许直接 RPC，可使用受信任只读 SQL 调用同一函数；不得用 Issue #21 镜像替代正式真源。

详细治理见 `docs/AUDIT_AUTOMATION_GOVERNANCE.md`。

## Deployment policy
- `main` 受 ruleset 保护：禁止删除/force push，必须 PR、linear history、分支最新且通过 H5 Build Check，无自动 bypass。
- Vercel Git 自动部署保持关闭；日常开发优先 GitHub CI + Supabase 验证，避免浪费 Preview 配额。
- 完整候选完成 P0/P1 修复、build、migration clean replay、权限审计后，才由总控受控触发一次 Vercel Preview 做真实黑盒 / Visual / English QA。
- Preview 通过不等于 Release Gate；Gate 通过后再进入中国区 CloudBase 手动部署。
- 未通过 Gate 不自动 merge main。
