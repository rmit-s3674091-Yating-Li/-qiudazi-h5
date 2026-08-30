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
7. `docs/ENVIRONMENT_BASELINE.md` — 环境身份、仓库、Supabase、部署与基础配置真源
8. `docs/RELEASE_GOVERNANCE.md` — feature / release-candidate / main 三层发布与 exact-head Preview 真源
9. `docs/AUDIT_AUTOMATION_GOVERNANCE.md`
10. `CHANGELOG.md`
11. 当前源码、migration、Edge Functions 与 GitHub CI

若早期 PRD、Demo、旧 bundle、历史评论或历史运行配置与上述当前基线冲突，以当前基线和运行时重新验证结果为准。

## Environment identity
基础环境与配置的完整真源统一见 `docs/ENVIRONMENT_BASELINE.md`。README 只保留必要摘要，避免多处重复维护后漂移：
- GitHub repository `rmit-s3674091-Yating-Li/-qiudazi-h5` 的 canonical visibility 是 **Private**；CI 会校验 private 状态，意外变回 public 视为环境漂移。
- 当前球搭子共享测试 Supabase 项目名固定为 `qiudazi-test`。
- 当前 canonical Supabase project ref / project_id 为 **`rtmjzmgrhifjzxaliltm`**，前端 API host 对应 `https://rtmjzmgrhifjzxaliltm.supabase.co`。
- 任何自动化、总控或人工脚本在执行 Supabase SQL、migration、Storage、Edge Function 或审计 backlog 操作前，都必须先通过运行时 project list / detail 校验该映射；不得从旧聊天、旧日志、snapshot 或历史上下文复用其它 project_id。
- 若 project list 中看不到 canonical 映射，先视为连接器/账号环境异常；不得用猜测的 project_id 重试写操作。
- `You do not have permission to perform this action` 必须按 `ENVIRONMENT_BASELINE` 的分层顺序诊断，不能直接归因于数据库 ACL。

## Stable product principles
- Profile/User、Player、Connection 分离；昵称不是关联键。
- 双打一个 Entry 两个 Player；“我参与的”按有效 Entry→Player 事实判断。
- 参赛建议级别是发现/匹配区间，不是硬报名门槛。
- 标准赛事比赛日期/时间 P0 必填；报名截止默认开赛前 2 小时且只能提前；截止由服务端强制执行。
- 系统自动报名截止要随开赛时间持续按 T-2h 联动；用户主动提前截止与系统自动值必须区分。
- 私有赛事大厅可发现但必须脱敏；可发现 ≠ 详情权限 ≠ 报名资格。
- 服务端 `viewer_role` 等权威事实决定组织者/参与者/受邀者权限，本地 Profile/cache 不能单独授权。
- 邀请关系、赛事邀请、双打组队邀请、临时 Player 历史关联邀请语义独立。
- 稳定数据不做高频轮询；mutation 后精准刷新；用户错误不暴露 JWT/SQL/RPC/RLS/Postgres/raw stack。
- H5 MVP 支持简体中文 / English，375 / 390 / 430px 需要真实 Visual QA。

## Navigation and Quick Start
- 四个既有一级底部导航保持：**赛事大厅 / 我的赛事 / 球搭子们 / 我的**。
- “我的战绩”继续属于“我的”，不得拆成一级 Tab。
- **快速开赛**是 P1 高频道具型 action：在四导航视觉中心使用凸起圆形按钮，但不是第五个 Tab，不创建第五套信息架构。
- quick flow：单打/双打 → 选择已有或新增临时 Player → 城市/可选场地/赛制/计分 → 确认并生成对阵。
- `event_mode=quick` 跳过报名截止、候补、普通赛事邀请，直接形成 locked Event/Entry/EntryPlayer 并自动生成首次对阵；之后继续使用标准赛事 viewer_role、Match、记分、排名、完赛、战绩、照片模型。
- quick mode 不得放宽或改变标准赛事 deadline / waitlist / invite / Player / Storage 权限。

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
- 基础配置、环境身份、repository visibility、env var 与部署平台角色统一服从 `docs/ENVIRONMENT_BASELINE.md`；发布分支、Candidate Freeze、Preview 与 Gate 顺序统一服从 `docs/RELEASE_GOVERNANCE.md`，不得在不同文档/任务中各维护一份互相独立的真值。
- H5 Build Check 会校验 repository 仍为 Private，并扫描 tracked files 的典型服务器级秘密；publishable/anon browser key 不视为服务器秘密。
- migration 文件统一使用 `YYYYMMDDHHMMSS_snake_case.sql`；14 位 version 在 repo 内必须全局唯一。
- live 通过 `apply_migration` 生成版本后，repo 对应文件必须使用**同一个 version 与同一 SQL 语义**，禁止 live/repo 使用“相近但不同”的时间戳。
- 新增 migration 前同时重读 repo migration 目录与 live migration list；并发 writer 不得凭历史目录快照自行分配版本。
- H5 Build Check 在启动本地 Supabase 前会先做 migration filename + version uniqueness preflight；重复 version / 非法命名必须 fail-fast，再进入 clean replay。
- clean replay 失败必须读实际 SQLSTATE 和 statement；不能因为 UI 显示失败在 `supabase start` 就推断为 Docker/CLI 启动故障。
- schema/RPC/Edge/Type/UI/权限/P0 必须全链路一致；repo/live migration version 不一致也属于 Release Gate 阻塞。
- private Storage、RLS/RPC/SECURITY DEFINER ACL 与业务身份校验必须进入 Release Gate。
- 共享 repo/canonical/CHANGELOG 文件采用最新 blob SHA + optimistic concurrency；stale 时重新读取合并，禁止旧内容覆盖。
- 不保留已经被新流程替代的可达旧页面/旧权限路径。

## Audit backlog and automation
- Supabase `audit_ops.issue_registry` 是正式 backlog 唯一事实源。
- `public.audit_issue_registry_readonly` 只是 backend-only 只读投影，不是第二事实源；H5 `anon/authenticated` 无 SELECT。
- 新问题通过 `audit_ops.create_issue(...)` 原子创建并语义去重。
- GitHub Issue #21 正文只是人类可读镜像；评论用于已有 AUD 的 append-only 工作日志。
- `docs/AUDIT_BACKLOG_SNAPSHOT.json` 是连接器波动时使用的只读工程快照，不是第二事实源；必须带 `generated_at / source_path / source_head`。
- 五个定时任务先按治理基线尝试正式 Supabase 读取；全部正式路径不可达时，可以读取 snapshot 继续检查，但进入降级模式。
- snapshot 只能用于继续检查、识别已知 AUD 和辅助去重；**不得**据此创建 AUD、修改正式 status/owner、把 `FIXED_PENDING_VERIFY` 推成 `VERIFIED` 或声称 live backlog 已同步。
- 发现新问题但 DB 不可达时，记录 `UNFILED_PENDING_DB_ACCESS` 和完整证据，恢复后再正式 `create_issue`；禁止手工编号。
- Release Gate 无法读取 live backlog 时可以继续其它审计，但最终只能 `DEGRADED_LIVE_BACKLOG_UNAVAILABLE`，不能 PASS；snapshot 超过 2 小时只作历史参考。
- 「球搭子问题整改」是唯一自动修复者，不是唯一 writer；DB 不可达时只能继续此前已明确认领的 IN_PROGRESS 工作，不能从 snapshot 新认领 OPEN。
- `public.audit_list_issues()` 返回 `jsonb` 数组，不得误当 table-valued function 使用。

详细治理见 `docs/AUDIT_AUTOMATION_GOVERNANCE.md`。

## Deployment policy
- 详细发布规则以 `docs/RELEASE_GOVERNANCE.md` 为唯一长期真源；README 只保留摘要。
- Repository 必须保持 **Private**。当前账号方案下 private repo 的 GitHub repository ruleset 不可用，因此不能再把“平台 ruleset 已强制保护 main”作为事实或 Gate 证据。
- 当前 main 治理由流程强制：所有开发只写 feature branch，经 PR、exact-head H5 Build Check、`release-candidate` exact-head Preview、Release Gate 后再由用户/总控做 merge 决策；所有自动化禁止直接 merge/push main。若未来升级 GitHub Pro 并重新启用 ruleset，需运行时验证后再恢复平台级保护描述。
- Vercel Git deployment 不是全开：`vercel.json` 默认 `** = false`（globstar 覆盖 `feature/...` 等带斜杠分支），仅 `release-candidate = true` 与 `main = true`。日常 feature/docs/fix push 不产生 Preview，避免浪费 Hobby 配额。
- 标准发布模型固定为：`feature/* → PR → exact-head CI → Candidate Freeze → release-candidate → exact-head READY Preview → 黑盒/Visual/English → Release Gate → main merge 决策 → CloudBase/正式发布`。
- Candidate Freeze 后任何代码、migration 或 canonical 文档提交都会使旧 Preview 失去 exact-head 资格；必须暂停黑盒/Gate，对新 head 重新跑 CI，并重新移动 `release-candidate`。禁止为了省一次 Preview 继续测试旧 SHA。
- 完整候选完成发布相关 P0/P1 修复、build、migration preflight + clean replay、repo/live version/SQL 语义一致性与权限审计后，总控才允许把 `release-candidate` 移动到 PR exact head。Vercel 自动生成 Preview 后必须核对 `state=READY`、`githubCommitRef=release-candidate`、deployment `githubCommitSha` 与 PR exact head 完全一致，才进入真实黑盒 / Visual / English QA。
- `release-candidate` 只作为触发器，不承载独立开发；若 Preview SHA 不匹配，不得用旧 Preview 顶替。
- 不得为了触发部署而提前 merge/push main，也不得用 main Production 替代候选 Preview 验证。
- Quick Start 是 P1，不因“不是 P0”机械阻塞；但若它已进入当前候选并造成四导航/P0 页面回归、权限扩大或标准赛事生命周期回归，Release Gate 必须阻塞。
- Preview 通过不等于 Release Gate；Gate 通过后再进入中国区 CloudBase 手动部署。
- live backlog 暂不可达时 Gate 不得 PASS；待正式 Supabase 路径恢复并重新核对后才能解除 degraded 状态。
- 未通过 Gate 不自动 merge main。

> 发布治理补充：2026-08-30 已完成 `release-candidate` → exact-head READY Preview 的真实闭环验证；具体 SHA/deployment id 属运行时证据，不在 README 固化。