# 球搭子 H5 — CHANGELOG

本文件记录影响产品行为、数据模型、权限、技术架构和发布状态的主要变化。更早的逐提交历史仍可从 Git history 与 Issue #21 append-only 工作日志追溯；当前产品规则以 PRD / PRODUCT / INTERACTION / PHOTO_ALBUM / P0 为准。

---

## 2026-08-30 — 赛事相册 / 参与赛事相册最终模型

**分支 / PR**：`feature/20260829-event-lifecycle-privacy-i18n` / PR #20  
**关联**：`AUD-20260829-017`  
**状态**：`FIXED_PENDING_VERIFY`。最终实现与数据库/权限硬化已完成；实现/CI head `e52e60b7d7caece8187cc0641ee8840d96d6755b` 的 H5 Build Check run `33287779608` 中 build 与 Supabase clean replay 均成功。仍须等待独立黑盒、安全、并发竞态与 Visual/English 验证后才能 `VERIFIED`。该 head 仅是当时实现/CI 证据锚点；任何后续文档或代码提交都会产生新的 PR exact head，发布判断必须重新读取当前 head 并核对对应 CI，不能继承旧 head 的 exact-head 通过结论。

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

## 2026-08-30 — 审计 backlog 并发与读取治理
- Supabase `audit_ops.issue_registry` 成为正式待整改 backlog 唯一事实源。
- 新问题通过 `audit_ops.create_issue(...)` 原子语义去重 + 编号；同 semantic key 并发通过事务 advisory lock 收敛。
- 新增受控只读 `public.audit_list_issues()`；自动化首选 RPC，连接器安全层拦截时可用受信任只读 SQL 调用同一函数，不能拿 Issue #21 镜像替代真源。
- Issue #21 正文仅是镜像，评论为已有 AUD 的 append-only 工作日志。
- 不存在全局唯一 writer；整改师只是唯一自动修复者。

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
- 功能变化必须同步 PRD / PRODUCT / INTERACTION / 专项基线 / P0 / CHANGELOG。
- 修复者只能把正式 AUD 推到 `FIXED_PENDING_VERIFY`；独立测试/审计通过后才能 `VERIFIED`。
- 发布相关 P0 或核心 P1 未独立验证时，Release Gate 必须 BLOCKED。
- 未通过 Gate 不自动 merge main，不进入中国区正式候选部署。