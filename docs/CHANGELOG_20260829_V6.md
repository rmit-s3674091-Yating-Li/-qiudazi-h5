# 2026-08-29 — V6 Event lifecycle / privacy / language major update

> **历史快照，不是当前状态真源。** 本文件保留 2026-08-29 当时的大版本变更记录，不用于判断当前 PR head、AUD 状态、照片模型或 Release Gate。当前产品规则请读取 README 指向的 PRD V6 / PRODUCT / INTERACTION / PHOTO_ALBUM / P0；当前整改状态以 Supabase `audit_ops.issue_registry` / `public.audit_list_issues()` 为准；当前发布工程状态以 PR #20 exact head、GitHub CI 与根目录 `CHANGELOG.md` 为准。

**分支**：`feature/20260829-event-lifecycle-privacy-i18n`  
**PR**：#20（部署前保持 draft）  
**当时状态**：共享 Supabase 测试库 migration 已应用；前端分支实现中，待 CI、迁移可重放审计和中国区 CloudBase 真机 E2E 后再合并 main。

## 产品变化
- 赛事单值“赛事级别”改为“参赛建议级别”最低/最高区间；私有脱敏预览允许显示该区间。
- 比赛日期/开赛时间升级为创建赛事必填。
- 新增最晚报名时间：默认开赛前2小时，只允许提前，不能晚于开赛前2小时。
- 截止后服务端统一阻止报名、退赛、接受赛事邀请、接受双打组队邀请和新的赛事/搭档邀请；名单进入锁定语义。
- 共享测试库启用 pg_cron，每5分钟将已过 deadline 且仍为 signup 的赛事物理同步为 locked；精确截止仍由服务端 `event_registration_open()` 即时判断，不能依赖 cron。
- 公开赛事卡增加安静的报名截止提示：>24h显示日期时间，1–24h按整小时提示，<1h显示即将截止；不做分钟/秒倒计时，不增加 Supabase 轮询。
- 私有大厅卡继续隐藏具体时间、场地、报名截止和参与者，避免通过倒计时反推活动时间。
- 设置与隐私升级为真实设置页：头像/水平/城市/约球时间/单双打偏好字段级可见性；普通赛事邀请与双打组队邀请两个独立接收开关。
- 档案隐私由 `get_connected_partner_profile` 服务端裁剪；邀请隐私由邀请 RPC 服务端执行。赛事名单、比分、赛果等共同事实不受个人档案隐私开关改写。
- 新增轻量 `LanguageProvider`，语言偏好本地持久化，当前建立简体中文 / English 基础并覆盖设置页与底部核心导航；核心流程全量英文覆盖列为本分支合并前审计项。

## 数据兼容
- 新字段：`events.suggested_level_min` / `suggested_level_max` / `registration_deadline`。
- 旧 `level`：≤2.0迁为仅 max，≥4.5迁为仅 min，中间档迁为 min=max；旧列暂保留兼容但新保存置空。
- 既有有日期+时间赛事自动回填 `registration_deadline = start - 2h`；无完整时间的历史测试赛事不强制回填，编辑时必须补齐。
- 新表 `profile_preferences` 默认全部可见、允许两类邀请，保证升级后不突然改变现有用户行为。

## 文档
- 新增 `docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md`。
- README 将 V6 PRD 提升到大改/审计的第一阅读顺序。
- 本记录作为 CHANGELOG 大版本历史条目；后续关键规则已同步进入 PRODUCT/INTERACTION/P0/PHOTO_ALBUM 等长期基线，不应再以本历史快照覆盖当前基线。

## 验证重点
截止前/截止瞬间/截止后写入、旧页面超时提交、直接 RPC 绕过、双打未完成 Entry、截止后退赛、私有预览脱敏、邀请隐私、档案字段裁剪、旧 level 迁移、语言持久化、390px窄屏、migration clean replay、CI build。
