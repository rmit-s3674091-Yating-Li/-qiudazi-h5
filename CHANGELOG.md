# 球搭子 H5 — CHANGELOG

本文件记录影响产品行为、数据模型、权限、技术架构和发布状态的主要变化。更早的逐提交历史仍可从 Git history 与 Issue #21 append-only 工作日志追溯；当前产品规则以 PRD / PRODUCT / INTERACTION / VISUAL / PHOTO_ALBUM / P0 / AUDIT_AUTOMATION_GOVERNANCE 为准。

---

## 2026-08-30 — 审计自动化连接器容错 / Snapshot 降级机制

- 手工复现确认：自动化/当前会话可能在 Supabase Connector 层收到 `You do not have permission to perform this action`，该事件可能发生在数据库 view/RPC 本身仍正常的情况下；因此“无法直连 Supabase = 数据库故障”这一假设不成立。
- Supabase `audit_ops.issue_registry` **继续是唯一正式 backlog 真源**，不改变事实源治理。
- 新增 `docs/AUDIT_BACKLOG_SNAPSHOT.json` 作为只读工程快照，包含 `generated_at / source_path / source_head` 与非敏感审计元数据；它不是第二 backlog，也不是 Issue #21 的替代品。
- 正式读取仍优先走 backend-only readonly view → 受控 RPC → 受信任 SQL function fallback；三条正式路径都因连接器权限/安全层暂不可达时，自动化改为读取 snapshot 并进入降级模式，而不是整轮停止。
- Snapshot 只允许用于继续白盒/黑盒/安全/Gate 检查、识别已知 AUD 和辅助语义去重；禁止据此创建 AUD、修改正式 status/owner/evidence、将 `FIXED_PENDING_VERIFY` 变更为 `VERIFIED` 或声称 live backlog 已同步。
- 新问题在 DB 不可达时使用运行标记 `UNFILED_PENDING_DB_ACCESS` 保存证据，待正式数据库路径恢复后再调用 `create_issue`；禁止手工编号。
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
- 后续若三条正式路径因**连接器权限/安全层**同时不可达，不再机械整轮 `BLOCKED`；当前最终降级规则以本文件上方“Snapshot 降级机制”与 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 为准。

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
- organizer 之后删除源照片，只让赛事页源照片消失并阻止未来新导入；**此前已经成功导入的 participant 个人副本继续存在，不受源删除影响**。
- participant “移出我的相册”只删除本人个人副本，不影响赛事源或其他用户。
- 参与赛事相册整体默认“仅自己可见”，可在设置与隐私切换为“搭子可见”；只有 accepted Connection 能看，并且只得到短时水印预览，无高清、Storage path 或管理权。
- 当前 P0 已明确：赛事上下文中的 organizer / actual participant 可显式查看短时高清；**本人在“我的参与赛事相册”查看高清原图不是当前 P0 必需能力**。若现有代码已提供本人个人高清，只能视为受控附加能力，仍须服务端重校验 + 短时 URL，不能因此成为黑盒/Gate 的额外发布阻塞项。

### 数据与后端
- `20260830020252_participant_album_independent_assets.sql`：`event_photos` 取消单赛事唯一约束，支持一场多图；新增 `participant_album_photos` 独立个人资产表，包含 owner Profile、赛事上下文快照、nullable `source_event_photo_id`、个人 original / watermarked path、import time。
- `source_event_photo_id` 使用 `ON DELETE SET NULL`，禁止赛事源照片删除级联删除个人资产；个人资产表启用 RLS，anon/authenticated 无直接表读取 grant。
- `profile_preferences` 增加 `participant_album_visibility = private | partners`，默认 private。
- 新增/重构受控 RPC：`list_event_photos`、`add_event_photo`、`delete_event_photo_metadata`、`prepare_personal_album_import`、`finalize_personal_album_import`、`list_my_past_event_albums`、`get_personal_album_asset`、`list_partner_visible_event_albums`、`delete_my_personal_album_metadata`。
- `20260830020857_photo_asset_model_hardening.sql`：源照片删除与 source add/finalize 共用 event 行锁边界；旧 version、metadata 已不存在或 DELETE 0-row 均返回可重试 `VERSION_CONFLICT`，不得误报删除成功；同时移除旧单图/自动历史兼容 RPC，避免旧调用路径绕过最终模型。
- `20260830021240_photo_multi_snapshot_compat.sql`：旧 snapshot 的单图兼容字段停止承载照片对象路径，赛事照片统一从受控多图 RPC 获取。
- live `photo-management` 已升级到 **v7 / ACTIVE / verify_jwt=true**：organizer source upload/delete、participant personal import/delete、self personal preview/original、partner preview 均经服务端路径；source delete 在 metadata 不存在或版本冲突时返回 409，而非成功。
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
- `main` 受 GitHub ruleset 保护：禁止删除/force push、必须 PR、linear history、分支最新、H5 Build Check 通过、无 bypass。
- 功能变化必须同步 PRD / PRODUCT / INTERACTION / VISUAL / 专项基线 / P0 / AUDIT_AUTOMATION_GOVERNANCE / CHANGELOG。
- 修复者只能把正式 AUD 推到 `FIXED_PENDING_VERIFY`；独立测试/审计通过后才能 `VERIFIED`。
- 发布相关 P0 或核心 P1 未独立验证时，Release Gate 必须 BLOCKED。
- live backlog 不可达时 Release Gate 只能降级为 `DEGRADED_LIVE_BACKLOG_UNAVAILABLE`，不得 PASS；待正式路径恢复后重新核对。
- P1 新能力不因“不是 P0”机械失败，但进入候选后若造成既有 P0 回归、权限扩大或核心流程不可用，仍是 Release Gate 阻塞项。
- 未通过 Gate 不自动 merge main，不进入中国区正式候选部署。
