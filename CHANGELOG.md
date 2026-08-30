# 球搭子 H5 — CHANGELOG

本文件记录影响产品行为、数据模型、权限、技术架构和发布状态的主要变化。更早的逐提交历史仍可从 Git history 与 Issue #21 append-only 工作日志追溯；当前产品规则以 PRD / PRODUCT / INTERACTION / VISUAL / PHOTO_ALBUM / P0 / ENVIRONMENT_BASELINE / AUDIT_AUTOMATION_GOVERNANCE 为准。

---

## 2026-08-30 — Vercel 候选分支白名单部署机制

- 根因确认：此前 `vercel.json` 使用 `git.deploymentEnabled=false` 全局关闭 Git deployments，因此 feature 与 main push 都不会自动产生新 deployment；这不是 feature branch、private repository 或 Supabase 问题。
- 为兼顾 Hobby 配额与 exact-head 可追溯性，Vercel Git deployment 改为白名单：`** = false`，仅 `release-candidate = true` 与 `main = true`。这里必须使用 globstar `**` 才能覆盖 `feature/...` 这类包含 `/` 的分支名；单星号 `*` 会漏掉斜杠分支。
- 日常 feature/docs/fix push 继续不触发 Vercel；candidate freeze 后，总控只把专用 `release-candidate` 分支移动到已经通过 exact-head CI 的 PR head，从而触发一份 Preview。
- 黑盒与 Release Gate 仍只接受 deployment metadata 中 `githubCommitSha` 与 PR exact head 完全一致的 READY Preview；`release-candidate` 只作为触发器，不承载独立开发。
- Gate 通过前不 merge/push main；main 允许 Git deployment 仅用于最终人工 merge 决策后的正式部署。
- `docs/ENVIRONMENT_BASELINE.md` 与 README 已同步该机制；已实测 globstar 生效后，后续 feature 分支文档提交不再产生新的 Vercel deployment。

---

## 2026-08-30 — 总控 / 整改师 CONTROL_NOTE 协作机制

- 正式确定 owner 边界：`OPEN + owner=null` 可由总控或整改师认领；已有 owner 的 AUD 不抢占、不并发修改同一整改项。
- 总控仍可审阅已有 owner 的整改实现，并在正式 `audit_ops.issue_registry.evidence` 追加 `[CONTROL_NOTE ...]`，用于实现建议、风险提示、边界澄清与验收提醒；CONTROL_NOTE 不改变 owner/status，也不代表整改或验证完成。
- 整改 owner 每轮处理 AUD 时必须同步读取 `details + evidence`；CONTROL_NOTE 与 canonical 产品基线冲突时必须显式报告，由总控/用户决策，不得静默忽略。
- 普通单项建议优先写正式 AUD，不反复膨胀 automation prompt；跨多个 AUD 的长期规则才同步 automation/canonical governance。
- `AUD-20260829-016` 已写入首条正式 CONTROL_NOTE：singles 批量临时 Player 代报名应使用 `join_event_manual_batch()`，在 confirmed 剩余容量内一次服务端请求原子创建多个独立 singles Entry，不前端循环 `join_event`，不自动跨 confirmed→waitlist；doubles 保持一次一队。

---

## 2026-08-30 — 标准赛事锁定后自动首次编排（AUD-20260830-007）

- 总控一致性审计发现：当前 `EventPage` 与 live `lock_event_roster()` 仍沿用旧两步交互——锁定只改变 `status=locked`，页面随后要求组织者再点击一次“生成对阵”；与已确认的标准赛事生命周期“锁定名单 → 自动生成首次对阵 → 查看/复核 → 开始赛事”不一致。
- 前端已改为组织者确认锁定后先调用权威 `lock_event_roster`，成功后立即自动调用现有 `tournament-command` draw engine；正常成功路径只需一次“锁定名单”确认，不再额外寻找首次“生成对阵”按钮。
- 若 lock 已成功而首次 draw 因网络/Edge 临时失败，页面刷新为真实 locked 状态并显示“继续生成对阵 / Retry draw”；恢复只重试当前赛事 draw，不重复 lock、不修改 roster、不创建新赛事。
- 首次对阵已生成后，组织者主要动作调整为“查看对阵 / 开始赛事”；“重新生成对阵”和“解锁名单”为次级受保护动作。
- 开赛前人员变化继续走“解锁 → 清空签表 → 调整名单/候补 → 重新锁定并自动生成”；已有真实比赛开始或结束后仍禁止解锁或无保护重建签表。
- PRD V6、PRODUCT、INTERACTION、P0 同步固定上述标准赛事 lifecycle；该修复不改变 Quick Start 的 `create_quick_event → draw` 独立恢复机制。

---

## 2026-08-30 — Quick Event Mode 全链路一致性补漏

- 一致性复查发现：后端已经存在 `events.event_mode` 与 `create_quick_event`，但 TypeScript `Event` 类型和 `list_events()` 返回链路未显式保留 `event_mode`，属于 DB schema → RPC → TypeScript 链路漏同步。
- 同时发现 quick event 虽然产品定位为“不经过招募、报名、候补”，但旧 `list_events()` 对普通大厅仍可能把它作为 private 脱敏赛事卡返回，导致 quick/standard 发现边界不清。
- 已补 `Event.event_mode: 'standard' | 'quick'`；live + repo migration `20260830052402_hide_quick_events_from_hall_and_surface_mode.sql` 让 `list_events()` 显式返回 `event_mode`，并在非 `p_mine` 的普通大厅查询中只返回 standard event。
- quick event 继续可由 owner / actual participant 从“我的赛事”进入；`get_event_snapshot()` 通过 `to_jsonb(events)` 保留完整 `event_mode`，不得通过 status/deadline/name 反推模式。
- PRD V6、PRODUCT、INTERACTION、P0 已同步明确：quick event 既不以 public 招募卡，也不以 private 脱敏卡进入普通赛事大厅；create 成功但首次 draw 失败时必须恢复已有 event，禁止重复 create。
- H5 Build Check 新增 `Assert quick event mode boundaries`：fresh replay 必须存在 event_mode default、`create_quick_event` 和 `list_events` 的显式 mode 返回/大厅过滤逻辑，防止未来 schema/RPC/type 再次漂移。

---

## 2026-08-30 — 黑盒测试改为 Candidate-driven Preflight

- 复盘确认：黑盒自动化在没有 current-head Preview 时仍执行 backlog/环境检查，会产生“没有东西可测”的噪声报告；这不是产品缺陷，而是调度顺序错误。
- 「球搭子全功能测试」现改为 candidate-driven condition watch。每轮最先读取 PR #20 exact head 与 Vercel deployments；只有存在 `READY` 且 Git source commit SHA 与 exact head 完全一致的 Preview 时，才进入正式 backlog 读取和真实页面测试。
- 若不存在 exact-head READY Preview，本轮状态为 `WAITING_FOR_CANDIDATE`：不是 `BLOCKED`、不创建 AUD、不改 backlog、不测试旧 Preview、不继续执行后续黑盒步骤，并应静默结束，避免向用户重复发送“无法测试”的无效通知。
- 一旦候选存在，黑盒锁定该 deployment id / URL / head SHA 作为本轮唯一测试对象；旧 Preview、HTTP 200、源码或 CI 结果均不能替代真实页面黑盒。
- 黑盒任务只消费候选，不负责生产 Vercel Preview。候选由总控在发布相关修复收口、exact-head CI green、repo/live 一致性达到候选条件后受控创建一次，从而继续控制 Preview 配额。
- `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 已新增 Candidate Preflight，并修正“所有任务先读 backlog”的旧顺序：黑盒必须先确认有 current-head 可测候选，再读 backlog。

---

## 2026-08-30 — GitHub Repository 转为 Private / 基础配置安全收口

- GitHub repository `rmit-s3674091-Yating-Li/-qiudazi-h5` 已由 Public 转为 **Private**，并经运行时 `get_repo` 重新确认 `visibility=private`。
- Private 转换后已确认：PR #20 仍为 Open + Draft；ChatGPT GitHub connector 仍具备当前 repo 的 admin/push/pull 访问；Vercel 项目 `qiudazi-h5` 的 Git link 仍指向同一 GitHub repository。
- 当前 GitHub 账号方案下，private repository 的 repository ruleset API 返回需升级 GitHub Pro；因此原“main 由 ruleset 平台强制保护”的描述不再成立。当前 main 保护改为流程治理：feature branch → PR → exact-head H5 Build Check → Release Gate → 人工 merge 决策；所有自动化继续禁止直接 push/merge main。
- `docs/ENVIRONMENT_BASELINE.md` 将 repository visibility=Private 纳入基础配置真源，并记录 private-repo ruleset 能力边界、Vercel private-repo 授权边界和未来若升级 Pro 后的恢复条件。
- H5 Build Check 新增 `Validate repository visibility`，若 repository 意外变回 public 直接 fail-fast；新增 tracked-file server-secret preflight，阻止典型 service secret、GitHub PAT、private key、含密码 PostgreSQL URL 等服务器级凭据进入仓库。Supabase browser publishable/anon key 不作为服务器秘密处理。
- README 与 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 已移除“当前 main 受 ruleset 强制保护”的错误事实，统一为 private repository + PR/CI/Gate 流程治理。
- Repository 曾经公开过，因此“转 Private”不等于撤销历史暴露。后续安全审计应继续关注历史提交中是否曾出现服务器级秘密；如发现必须立即轮换，不能只依赖删除 Git 历史。

---

## 2026-08-30 — 环境身份 / Migration 一致性治理加固

- 复盘确认此前 Supabase `You do not have permission to perform this action` 的主要成因并非数据库 ACL，而是历史上下文混入了当前连接器不可见的旧 project_id；当前 canonical 测试环境固定为 `qiudazi-test → rtmjzmgrhifjzxaliltm`。
- 任何自动化、总控或人工流程在执行 SQL、migration、Storage、Edge Function、Advisor 或正式 backlog 操作前，必须通过 project list / project detail 运行时确认 canonical project mapping；禁止复用旧聊天、旧日志、历史 snapshot 或模型上下文中的 project_id。
- 权限错误诊断顺序固定为：project ref 可见性 → ChatGPT 插件权限 → Supabase 项目角色 → 数据库 grant/RPC/RLS，禁止跳步直接归因于 PostgreSQL ACL。
- clean replay 失败复盘确认：repo 曾同时存在两个 `20260830032000_*` migration，导致 Supabase CLI 在 start 阶段应用 migration 时触发 `schema_migrations_pkey` / SQLSTATE `23505`；失败 step 名称为 `supabase start` 并不代表 Docker/CLI 启动故障，必须读取实际 SQLSTATE/statement。
- Quick Start migration 已从临时 repo version `20260830032000` 对齐到 live `20260830031620_quick_start_event_mode.sql`；readonly audit view 已对齐到 live `20260830032055_add_readonly_audit_issue_registry_view.sql`；照片 RPC 修复已从 repo `20260830041000` 对齐到 live `20260830041107_fix_list_event_photos_ambiguous_id.sql`。
- `.github/workflows/build.yml` 新增 migration preflight：在启动本地 Supabase 前验证 `YYYYMMDDHHMMSS_snake_case.sql` 命名与 14 位 version 全局唯一；重复 version / 非法命名直接 fail-fast。
- 新治理规则要求 live `apply_migration` 与 repo migration 使用同一 version、同一 SQL 语义；新增 migration 前必须同时重读 live migration list 与 repo migration 目录，并发 writer 不得依据旧目录快照自行分配版本。
- `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 与 README 已同步 environment identity、migration version、clean replay 根因判定与 Release Gate 阻塞规则；整改自动化也已增加 live/repo migration preflight。

---

## 2026-08-30 — 审计自动化连接器容错 / Snapshot 降级机制

- 手工复现确认：自动化/当前会话可能在 Supabase Connector 层收到 `You do not have permission to perform this action`，该事件可能发生在数据库 view/RPC 本身仍正常的情况下；因此“无法直连 Supabase = 数据库故障”这一假设不成立。
- Supabase `audit_ops.issue_registry` **继续是唯一正式 backlog 真源**，不改变事实源治理。
- 新增 `docs/AUDIT_BACKLOG_SNAPSHOT.json` 作为只读工程快照，包含 `generated_at / source_path / source_head` 与非敏感审计元数据；它不是第二 backlog，也不是 Issue #21 的替代品。
- 正式读取仍优先走 backend-only readonly view → 受控 RPC → 受信任 SQL function fallback；三条正式路径都因连接器权限/安全层暂不可达时，自动化改为读取 snapshot 并进入降级模式，而不是整轮停止。
- Snapshot 只允许用于继续白盒/黑盒/安全/Gate 检查、识别已知 AUD 和辅助语义去重；禁止据此创建 AUD、修改正式 status/owner/evidence、将 `FIXED_PENDING_VERIFY` 变更为 `VERIFIED` 或声称 live backlog 已同步。
- 新问题在 DB 不可达时使用运行标记 `UNFILED_PENDING_DB_ACCESS` 保存证据，待后续能访问 Supabase 时再调用 `create_issue`；禁止手工编号。
- Release Gate 无 live backlog 时可继续检查 exact head、CI、repo/live 其它一致性、Visual/English 与安全项，但最终只能 `DEGRADED_LIVE_BACKLOG_UNAVAILABLE`，不能 PASS；snapshot 超过 2 小时只能作历史参考。
- 「球搭子问题整改」在 DB 不可达时只能继续此前已明确认领的 IN_PROGRESS 工作，不得根据 snapshot 认领新的 OPEN。
- `docs/AUDIT_AUTOMATION_GOVERNANCE.md`、README 与五个现役自动化任务已同步该降级协议；旧部署前审计/旧安全审计保持 disabled，现役为 V2。

---

## 2026-08-30 — 快速开赛 P1 / 导航主动作

- 在现有四个底部一级导航 **赛事大厅 / 我的赛事 / 球搭子们 / 我的** 的基础上增加中央凸起圆形“快速开赛”主动作；它不是第五个 Tab，不改变现有 IA，“我的战绩”继续属于“我的”。
- 新增 `event_mode = standard | quick`。quick mode 用于人已经在其他渠道约好、希望直接编排/记分/沉淀战绩与照片的场景。
- 快速流程：单打/双打 → 选择已有或新增临时 Player → 城市/可选场地/赛制/计分 → 确认并生成对阵。
- quick event 跳过标准赛事报名截止、候补、普通赛事邀请流程，原子创建 locked Event/Entry/EntryPlayer，并自动生成首次对阵；之后复用现有 viewer_role、Match、记分、排名、完赛、战绩和照片模型。
- quick mode 不得放宽标准赛事 deadline / waitlist / invite / Player / Storage 权限。
- 快速开赛属于 P1，不重定义原 P0；但若进入当前候选后造成四导航遮挡、既有 P0 页面不可用、权限扩大或标准赛事生命周期回归，则按发布回归处理。
- live migration `20260830031620_quick_start_event_mode` 已应用并同步到 repo；真实页面仍需后续 exact-head Preview 黑盒/Visual 验证。

---

## 2026-08-30 — 审计 backlog 读取治理三路径收口

- Supabase `audit_ops.issue_registry` 继续是正式 backlog **唯一事实源**。
- 新增 `public.audit_issue_registry_readonly` 作为 backend-only 只读投影，只解决自动化连接器对 SECURITY DEFINER RPC 调用兼容性，不形成第二份 backlog。
- 正式读取协议统一为：① backend-only readonly view；② `public.audit_list_issues()` RPC；③ 受信任 SQL `select * from public.audit_list_issues();`。
- `public.audit_list_issues()` 实际 `RETURNS jsonb`，fallback 返回一列 JSON 数组；自动化不得把它误当 `RETURNS TABLE` 使用。
- 已实际验证：readonly view 可读取当前 OPEN/IN_PROGRESS backlog；`anon/authenticated` 无 SELECT，后台角色仅保留必要 SELECT；RPC/SQL function fallback 也可取得正式 JSON backlog。
- migrations：`20260830032055_add_readonly_audit_issue_registry_view`、`20260830032103_restrict_readonly_audit_issue_registry_view`、`20260830032403_restrict_audit_readonly_view_to_select_only`。
- 后续若三条正式路径因连接器权限/安全层同时不可达，不再机械整轮 `BLOCKED`；当前最终降级规则以本文件上方“Snapshot 降级机制”与 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 为准。

---

## 2026-08-30 — 赛事相册 / 参与赛事相册最终模型

**分支 / PR**：`feature/20260829-event-lifecycle-privacy-i18n` / PR #20  
**关联**：`AUD-20260829-017`  
**状态**：`FIXED_PENDING_VERIFY`。最终实现与数据库/权限硬化已完成；实现/CI head `e52e60b7d7caece8187cc0641ee8840d96d6755b` 的 H5 Build Check run `33287779608` 中 build 与 Supabase clean replay 均成功。仍须等待独立黑盒、安全、并发竞态与 Visual/English 验证后才能 `VERIFIED`。该 head 仅是当时实现/CI 证据锚点；任何后续文档或代码提交都会产生新的 PR exact head，发布判断必须重新读取当前 head并核对对应 CI，不能继承旧 head 的 exact-head 通过结论。

### 产品最终决策
- 赛事相册是 source album，一场赛事允许多张照片。
- 只有赛事创建人/organizer 可以在赛事页面上传和删除赛事源照片；设置与隐私不再承担赛事照片管理。
- actual participant 可以查看自己参赛赛事当前存在的照片，但不能上传/替换/删除源照片。
- 系统不自动把赛事照片塞入个人相册；participant 必须逐张主动“加入我的参与赛事相册”。
- 加入成功不再只是 EventPhoto 收藏引用，而是复制/固化成该 Profile 自己的独立 private original + protected preview 个人资产。
- organizer 之后删除源照片，只让赛事页源照片消失并阻止未来新导入；此前已经成功导入的 participant 个人副本继续存在，不受源删除影响。
- participant “移出我的相册”只删除本人个人副本，不影响赛事源或其他用户。
- 参与赛事相册整体默认“仅自己可见”，可在设置与隐私切换为“搭子可见”；只有 accepted Connection 能看，并且只得到短时水印预览，无高清、Storage path 或管理权。
- 当前 P0 已明确：赛事上下文中的 organizer / actual participant 可显式查看短时高清；本人在“我的参与赛事相册”查看高清原图不是当前 P0 必需能力。若现有代码已提供本人个人高清，只能视为受控附加能力，仍须服务端重校验 + 短时 URL，不能因此成为黑盒/Gate 的额外发布阻塞项。

### 数据与后端
- `20260830020252_participant_album_independent_assets.sql`：`event_photos` 取消单赛事唯一约束，支持一场多图；新增 `participant_album_photos` 独立个人资产表，包含 owner Profile、赛事上下文快照、nullable `source_event_photo_id`、个人 original / watermarked path、import time。
- `source_event_photo_id` 使用 `ON DELETE SET NULL`，禁止赛事源照片删除级联删除个人资产；个人资产表启用 RLS，anon/authenticated 无直接表读取 grant。
- `profile_preferences` 增加 `participant_album_visibility = private | partners`，默认 private。
- 新增/重构受控 RPC：`list_event_photos`、`add_event_photo`、`delete_event_photo_metadata`、`prepare_personal_album_import`、`finalize_personal_album_import`、`list_my_past_event_albums`、`get_personal_album_asset`、`list_partner_visible_event_albums`、`delete_my_personal_album_metadata`。
- `20260830020857_photo_asset_model_hardening.sql`：源照片删除与 source add/finalize 共用 event 行锁边界；旧 version、metadata 已不存在或 DELETE 0-row 均返回可重试 `VERSION_CONFLICT`，不得误报删除成功；同时移除旧单图/自动历史兼容 RPC，避免旧调用路径绕过最终模型。
- `20260830021240_photo_multi_snapshot_compat.sql`：旧 snapshot 的单图兼容字段停止承载照片对象路径，赛事照片统一从受控多图 RPC 获取。
- live `photo-management` 已升级到 v7 / ACTIVE / verify_jwt=true：organizer source upload/delete、participant personal import/delete、self personal preview/original、partner preview 均经服务端路径；source delete 在 metadata 不存在或版本冲突时返回 409，而非成功。
- personal import 由服务端从 private source 下载并复制到 `personal/<profile_id>/...` 路径，再落个人 metadata；源照片之后可独立删除。
- 所有照片仍使用 private `event-photos` Storage；partner list 不下发 object path；accepted partner 只能按服务端 visibility/Connection 校验获取短时水印预览。
- live 基础校验已确认：`event-photos.public=false`；`participant_album_photos.source_event_photo_id` 为 `ON DELETE SET NULL`；个人资产表 RLS=true 且 anon/authenticated 无直接 SELECT；legacy photo RPC 已不存在；空 photo_id 调用 source delete 正确产生 `VERSION_CONFLICT`。

### 前端
- Event PhotoPanel 改为多图：organizer 多选上传、逐张真删除；participant 逐张加入个人参与赛事相册。
- “我的”入口统一命名“参与赛事相册”；这里只展示本人主动导入的独立个人照片资产。
- 本人个人相册支持受保护预览、短时高清与“移出我的相册”；其中短时高清是现有实现能力，不构成当前 P0 必需项。
- PrivacyPage 删除全部 organizer photo management，仅保留参与赛事相册 private / partners 设置。
- Partner album 继续只展示服务端短时水印预览。

### 文档
- `docs/PHOTO_ALBUM_BASELINE.md` 成为照片专项真源。
- PRD V6 §5.1、PRODUCT_BASELINE、INTERACTION_BASELINE、VISUAL_DESIGN_BASELINE、P0_ACCEPTANCE、README 已同步最终规则。
- 2026-08-30 再次完成基线一致性收口：明确“个人参与赛事相册本人高清”不是当前 P0，避免 INTERACTION / P0 与 PHOTO_ALBUM 专项真源产生不同 Gate 结论；`docs/CHANGELOG_20260829_V6.md` 已标记为历史快照，禁止用于当前状态判断。
- 废弃以下旧规则：单图主合影、设置页删除赛事照片、自动给所有参赛者归档、organizer “移除但后台保留给 participant”、源删除级联个人收藏失效。

---

## 2026-08-30 — 审计 backlog 并发基础治理
- Supabase `audit_ops.issue_registry` 成为正式待整改 backlog 唯一事实源。
- 新问题通过 `audit_ops.create_issue(...)` 原子语义去重 + 编号；同 semantic key 并发通过事务 advisory lock 收敛。
- Issue #21 正文仅是镜像，评论为已有 AUD 的 append-only 工作日志。
- 不存在全局唯一 writer；整改师只是唯一自动修复者。
- 读取协议的当前最终版本以本文件上方“三路径收口 + Snapshot 降级机制”与 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 为准。

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
- Vercel Git 自动部署关闭，改为完整候选后受控触发一次 Preview；中国区继续 CloudBase 手动部署。

---

## 发布原则
- Repository 必须保持 Private。当前 GitHub 方案下 private repo 无 repository ruleset 平台强制保护，main 采用 feature branch → PR → exact-head H5 Build Check → Release Gate → 人工 merge 的流程治理；所有自动化禁止直接 push/merge main。
- 功能变化必须同步 PRD / PRODUCT / INTERACTION / VISUAL / 专项基线 / P0 / ENVIRONMENT_BASELINE / AUDIT_AUTOMATION_GOVERNANCE / CHANGELOG。
- 修复者只能把正式 AUD 推到 `FIXED_PENDING_VERIFY`；独立测试/审计通过后才能 `VERIFIED`。
- 黑盒测试只消费 exact-head READY Preview；没有可测候选时静默等待，不把旧 Preview 当成当前候选。
- 发布相关 P0 或核心 P1 未独立验证时，Release Gate 必须 BLOCKED。
- live backlog 不可达时 Release Gate 只能降级为 `DEGRADED_LIVE_BACKLOG_UNAVAILABLE`，不得 PASS；待正式路径恢复后重新核对。
- P1 新能力不因“不是 P0”机械失败，但进入候选后若造成既有 P0 回归、权限扩大或核心流程不可用，仍是 Release Gate 阻塞项。
- 未通过 Gate 不自动 merge main，不进入中国区正式候选部署。