# 球搭子 H5 — CHANGELOG

本文件记录会影响产品行为、数据模型、页面职责、技术架构或部署测试结论的“大版本变化”。

## 记录规则

以下变化应记录：

- 产品信息架构、页面职责、核心用户流程调整；
- User/Profile / Player / Connection / Event / Entry / Match 等核心数据模型变化；
- Supabase schema、RPC、权限、RLS、migration 变化；
- 缓存、实时刷新、身份、分享深链等架构变化；
- 视觉/交互基线发生明确调整；
- 一次较大的功能分支进入部署前审计或中国区手动部署测试；
- 已验证的重要缺陷修复，尤其是可能导致流程错误、数据重复或权限越界的问题。

小型文案、间距、图标、非行为性样式微调一般不单独记录。

每条大版本记录尽量写清：日期 / 分支或 PR / 主要变化 / 背景与原因 / 数据或兼容影响 / 验证与部署状态 / 关键 commit。

---

## 2026-08-29 — Supabase fresh replay / Storage reproducibility closure

**分支 / PR**：`feature/20260829-event-lifecycle-privacy-i18n` / PR #20  
**状态**：`AUD-20260829-001` 的 repository clean replay 与 Storage 可复现性整改已完成，候选实现等待独立 Release Gate 最终验证；`AUD-20260829-007` 的 release traceability 已同步，等待独立复核。

### 数据库可复现性

- 新增 `20260829050000_initial_schema_baseline.sql` 与 `20260829051000_initial_function_baseline.sql`，补齐仓库早期增量 migration 所依赖的初始核心表、RLS 与 RPC 前置定义，使 repository migrations 可以从 fresh database 顺序重放。
- `.github/workflows/build.yml` 增加隔离本地 Supabase clean replay job，GitHub Actions runner 通过 `supabase db reset --local` 验证整条 repository migration 链，不连接 live 项目、不创建收费 Supabase branch。
- H5 Build Check #77 / run `33257182352` 已证明数据库 migration 链从空库完整 replay 成功。

### Storage 可复现性

- 独立代码巡检进一步发现：仅 SQL replay 仍不足以证明 fresh Supabase 环境完整可重建，因为 live 测试库存在 `avatars` / `event-photos` bucket 与 6 条 `storage.objects` policy，而此前仓库没有对应受控定义。
- 新增 `20260829181600_storage_reproducibility.sql`：幂等定义 `avatars`（3MB）与 `event-photos`（10MB）bucket，允许 JPG / PNG / WebP；重建 `qiudazi_avatar_insert/read_own/delete_own` 与 `qiudazi_photo_insert/read_own/delete_own` 六条 Storage policy；规范 `can_upload_photo(text)` 与函数执行 ACL。
- clean replay CI 增加 Storage reconstruction assertion；H5 Build Check #79 / run `33257744262` 的 build、fresh-db replay、bucket/policy/function 断言全部 success。

### live 测试库对齐

- 仅以受控方式应用 `storage_reproducibility` 到当前 Supabase 测试库，没有补推 0500/0510 baseline，也没有重置 live 数据。
- 应用后只读核对确认：两个 bucket 的 public / size / MIME 配置与 repository 一致；六条 Storage policy 与 candidate migration 一致；`can_upload_photo` 仅授予 authenticated / service_role（postgres owner 保留），anon/PUBLIC 不再拥有执行权限。
- 同时修正了 live 旧 `qiudazi_avatar_delete_own` 中错误比较 `players.avatar_url = players.name` 的语义，现统一为 `p.avatar_url = storage.objects.name`，防止仍被 Player 引用的头像对象被误删。

### 关键 commit / migration

- `6821b44f302f57e80373131ba6fb3dbcdb4ed5de` — replayable initial schema baseline
- `d200cc2ec93d7e376ff2dcf15796c596ef301fa0` — initial RPC dependency baseline
- `fb467eee0e043426347d58aba6c2ff7c0c9a539a` — Storage reproducibility migration
- `f5b126371ca50c4ae92f9e387d057dba057b16f1` — CI Storage reconstruction assertions

> 本节仅同步实际数据库/Storage/CI 事实，不改变任何产品规则。修复者不自行将 AUD-001 标记为 VERIFIED，最终状态由独立 Release Gate 决定。

---

## 2026-08-29 — AUD-015 doubles partner withdrawal UI alignment

**分支 / PR**：`feature/20260829-event-lifecycle-privacy-i18n` / PR #20  
**状态**：`AUD-20260829-015` 已完成代码与 P0 验收文档整改，等待独立验证；修复者不得自行标记 VERIFIED。

### 修复事实

- `EventPage` 名单中的普通退出入口不再只依赖 `entry.signup_user_id`，而是复用 `get_my_event_entry_id` / `myEntryQ.data` 形成的 `own` Entry membership；因此双打 Entry 中不是报名提交者的第二位 linked self Player，在报名开放期也能从正常 UI 退出整个 Entry。
- confirmed 与 waitlist 两类名单均使用同一 `entry.id === own?.id` 语义；组织者原有移出能力保持不变。
- 报名截止或名单锁定后继续禁止普通退出；own action bar 不再显示“查看/退出”，改为只表达“查看名单”，避免前端暗示已经不可执行的退赛操作。
- 本批未修改 `withdraw_entry`、`get_my_event_entry_id`、数据库、migration、RLS 或权限模型，只让前端入口与既有服务端 membership 权限一致。

### 文档与验证

- `docs/P0_ACCEPTANCE.md` 新增双打两位真实搭档在报名开放期均可退出整个 Entry、截止/锁定后均不可退出且 UI 不暗示退出的验收场景。
- README、PRD V6、PRODUCT/INTERACTION/VISUAL baseline 已复核：现有规则已明确实际 Entry/Player membership、普通退赛截止边界及前后端权限一致性，不需要重复修改长期规则。
- 代码 commit：`2fc160f13c39f2868147cfbf294e75f5306ac40e`。
- P0 文档 commit：`dd7c1e7eaac819e65fd8074d9ec5e05b9ff282d1`。
- 当前仍需独立双用户回归：A 提交双打 Entry 后，B 作为第二位 linked real partner 在报名开放期看到并可执行退出；截止/锁定后 A/B 均不可退出。

---

## 2026-08-29 — EventPage lifecycle restoration / release traceability sync

**分支 / PR**：`feature/20260829-event-lifecycle-privacy-i18n` / PR #20  
**状态**：`AUD-20260829-013/014` 已完成代码修复并通过 H5 Build Check，当前仅为 `FIXED_PENDING_VERIFY` 候选；`AUD-20260829-006/010/011` 已由独立代码巡检验证为 VERIFIED。本节是当前最新事实快照，覆盖下方较早 addendum 中的旧状态描述，但不改写历史记录。

### EventPage P0 生命周期恢复

- 修复 `AUD-20260829-013`：此前 EventPage 在 i18n/权限改造中被截成展示骨架，报名 Sheet、名单操作和组织者生命周期动作缺失。
- 恢复单打/双打真实报名、临时球搭子代报名、双打搭档邀请/选择、参赛名单与候补展示、报名/候补退出、组织者锁定名单、生成/重新生成对阵、开始赛事、解锁名单、结束赛事等既有 P0 能力。
- 保持 V6 当前规则不变：组织者身份仍使用服务端 `viewer_role === 'owner'`；普通名单动作使用 `isRegistrationOpenClient` 避免 deadline 已过但物理 status 尚未同步时继续开放；最终写权限继续由现有 RPC/Edge Function/数据库状态机约束。
- 本批未新增数据库字段、RPC、migration 或权限模型，也没有改变 Entry/Player/Connection 数据语义。

### 参赛建议级别详情修复

- 修复 `AUD-20260829-014`：完整赛事详情不再读取 legacy `event.level`。
- EventPage hero 使用共享 `suggestedLevelDisplay(suggested_level_min, suggested_level_max, language)`，与赛事卡、私有预览及 V6 基线保持一致；不恢复旧“赛事级别”用户概念。

### 文档与验证

- README、PRD V6、PRODUCT/INTERACTION/VISUAL baseline 与 P0_ACCEPTANCE 已逐份复核；这些文档已经准确规定报名/名单/编排/开赛/结束生命周期、权威 `viewer_role`、截止边界和 suggested level range，因此本批不重复修改长期规则文档。
- `CHANGELOG.md` 本节同步 `AUD-007` 所要求的当前 release traceability，并记录 013/014 修复事实。
- EventPage 修复 commit：`56dc2faef837278bcbce786e0a99fad58a62fc2e`。
- H5 Build Check run `33254307596`：success。
- 本任务不得自验为 VERIFIED；013/014 仍需独立代码巡检/全功能测试验证实际报名、代报名、退出、locked→draw→start、unlock/re-draw 保护、ongoing→finish 及 suggested level 四类展示。

### 当前仍存在的发布阻塞

- `AUD-20260829-001`：clean replay / migration history 与 repository-live 一致性仍待独立证明。
- `AUD-20260829-003`：由其他流程负责的 English 全流程独立验证/闭环尚未完成，本批不改变其所有权。
- `AUD-20260829-004/005`：仍待独立交互/黑盒回归。
- `AUD-20260829-013/014`：代码和构建已完成，等待独立验证。

---

## 2026-08-29 — AUD-003 core English flow remediation

**分支 / PR**：`feature/20260829-event-lifecycle-privacy-i18n` / PR #20  
**状态**：核心 English 界面整改已完成代码收口并通过 H5 Build Check；当前为 `FIXED_PENDING_VERIFY` 候选状态，仍必须由独立全功能测试 / Release Gate 以 English 实际走通核心旅程后才能 `VERIFIED`。

### 本轮整改范围

- 统一轻量 i18n 已覆盖赛事大厅、我的赛事、赛事详情/管理、创建/编辑、公开/私有邀请、报名相关状态、比赛详情、实时记分、直接录分、对阵、排名、合影、球搭子、临时球搭子、邀请记录、我的、打球档案、战绩、设置与隐私、身份恢复以及应用级空/错误状态。
- English 模式下赛事状态、赛制、建议级别、报名截止、费用、排名/签表、逐分计分、赛后水印和常见业务错误均使用英文展示；默认中文模式不再依赖无意义的英文装饰文案表达核心任务。
- `explainError()` 增加 RPC、EventRules、ScoringEngine、TournamentService 与级联更正相关结构化错误码的英文映射；领域层仍保持语言无关，翻译在用户可见边界完成。
- MatchPage 不再通过比较“级联 / 请确认”等展示文案决定比分更正流程；已完成比分的更正继续使用本地结构化赛事快照预演 + 明确确认，再以 `confirmed=true` 提交服务端。
- 未晋级/未确定对阵在 English 模式显示 `TBD`，不再从共享 `entryName()` 的中文 fallback 泄漏“待晋级”。
- 图片上传错误及赛后合影水印跟随当前语言；English 水印使用 Champion / Runner-up / Third place / Match date 等表达。
- 数据库稳定值未因翻译改变：例如 `play_times` 仍保持原稳定值，只在界面映射为英文，避免 i18n 改动污染业务数据模型。

### 验证

- 最新 i18n 收口代码 head 前的 H5 Build Check run `33253992685`：`npm ci` 与 `npm run build` 均成功。
- 本节只记录代码实现与构建事实，不等同于 English 黑盒验收完成；独立验证前不得自标 `VERIFIED`。

### 关键 commit

- `0f738703` — 对阵 / 排名 / 合影面板双语化
- `9a013d6d` — 球搭子主页、关系邀请与历史关联邀请双语化
- `5b82c144` — 私有赛事预览双语化
- `e28f876a` / `aaf90f7a` — 我的战绩 / 我的打球档案双语化
- `c2f741a7` / `0dbe8376` / `a1bb7931` — 球搭子详情、临时球搭子、邀请记录双语化
- `c80b85e3` / `e90d1e81` — 身份建档与 Player 编辑双语化
- `8e0ed09f` / `40d90443` / `6606737e` — 错误、身份恢复、应用 fallback 双语化
- `253c7729` / `2c49d87f` — MatchPage English 计分状态与展示文案逻辑收口
- `ffff39ca` — EventRules / ScoringEngine / TournamentService / cascade 错误英文映射
- `e48481e2` — 未确定对阵 English `TBD` 收口

> 本轮未改变赛事状态机、身份权限、报名截止或排名算法等产品规则，只补齐既有 V6 双语验收要求及展示层错误映射。

---

## 2026-08-29 — V6 release traceability addendum

**分支 / PR**：`feature/20260829-event-lifecycle-privacy-i18n` / PR #20  
**状态**：参与事实与比赛页权威身份修复已完成独立白盒验证；EventPage 已修复原 TypeScript build blocker并恢复绿色构建，等待独立验证。当前候选仍受 AUD-001/003 及其他待回归发布项阻塞，不可部署。

### 已落地并独立验证
- `AUD-20260829-008` VERIFIED：`20260829181400_v6_joined_event_participant_sync.sql` 将“我参与的”统一为 active Entry → entry_players → linked Player 的实际参与事实，覆盖双打两名真实搭档；live `list_events` 定义已核对。
- `AUD-20260829-009` VERIFIED：`MatchPage.tsx` 使用服务端 `viewer_role === 'owner'` 判断组织者记分能力；比分级联预演 actor 使用赛事快照 canonical `owner_user_id`。
- `AUD-20260829-012` VERIFIED：`20260829181500_v6_event_participant_role_sync.sql` 让 snapshot/private preview 按 active Entry/Player membership 识别 participant，并让 participant 优先于历史 invited；live function definition 已核对。

### 已修复待独立验证
- `AUD-20260829-006`：`EventPage.tsx` 已保持 `viewer_role === 'owner'` 的权威身份判断，并修正 DrawPanel/RankingPanel/PhotoPanel/Sheet 的旧 props 调用；commit `19c6f084501947c72585cd92ae527912690c998b` 对应 Actions run `33252030178` 已通过 `npm ci`、`tsc --noEmit` 与 Vite production build。该项仍需独立流程验证后才能 VERIFIED。
- `AUD-20260829-010`：截止后“我参与的 → 喊球搭子一起来”入口改用有效报名状态 helper。
- `AUD-20260829-011`：参赛建议级别展示 helper 按基线统一边界文案并移除重复后缀补丁。

### 当前发布阻塞
- `AUD-20260829-001`：仍需 clean replay / migration history / repository 与 live schema-function 一致性证明；live migration version 与仓库 `181400/181500` 文件名目前不一一对应。
- `AUD-20260829-003`：核心 English 流程代码整改已完成，等待独立 English 黑盒验证后才能 VERIFIED。
- `AUD-20260829-004/005/006/010/011`：等待独立回归/验证；其中 AUD-006 已恢复绿色 build，但尚未独立 VERIFIED。

### 关键实现
- `19c6f084` — EventPage panel props / Sheet build blocker修复，CI 绿色
- `9e874389` — MatchPage 权威身份修复
- `217ef648` — 报名截止后的邀请入口状态修复
- `4d4bd831` — 建议级别展示 helper 收口
- `20260829181400_v6_joined_event_participant_sync.sql`
- `20260829181500_v6_event_participant_role_sync.sql`

> 本 addendum 只修正事实性 release traceability，不新增产品规则；下方历史记录保持原样。

---

## 2026-08-29 — Private event discovery / participant invitation revision

**状态**：已更新 `main` 与当前 Supabase 测试数据库；属于下一次中国区 CloudBase 部署前收口批次。

### 产品决策修订

- 私有赛事不再从赛事大厅完全消失，而是以“可发现、不可直接解锁”的脱敏赛事卡出现。
- 稳定原则改为：**大厅可发现 ≠ 获得完整详情权限 ≠ 获得报名资格。**
- 私有赛事大厅卡仅保留赛事名称、城市、水平、单/双打、赛制和状态；不展示组织者、参赛人、具体日期时间、具体场地、报名/候补人数和费用。
- 公开/私有赛事卡必须在整张卡片视觉语言上有区别。私有卡使用锁图标、低饱和暖灰/中性色和隐私说明，但不做成 disabled / error 状态。
- 未获权限用户点击私有赛事进入专门的受限预览页；预览页仍只读取脱敏字段。组织者、明确被邀请人和已报名参与者才可进入原完整赛事详情。
- 私有赛事预览可以分享，但分享预览 URL 本身不授予完整详情或报名权限。

### 邀请权限修订

- 修正上一轮“普通赛事邀请仅组织者可发”的过严规则。
- **公开赛事**：组织者可以邀请；已经实际报名的普通参与者也可以邀请自己的 Connection 参赛。未报名普通浏览者只能分享赛事链接，不能发正式参赛邀请。
- “我的赛事 → 我参与的”中，报名中的公开赛事增加“喊球搭子一起来”入口；邀请不会让邀请人获得赛事管理权限。
- **私有赛事**：普通赛事邀请仍由组织者控制；普通参与者不能把私有赛事参赛资格无限扩散。
- **私有双打**：已有合法访问/参赛资格的用户仍可以邀请自己的球搭子组队，搭档获得完成组队所需的访问资格，但不获得赛事管理权限。
- 单打普通邀请仅表示一起参加同一赛事，不保证双方一定对阵；双打组队邀请仍是独立语义和独立记录。

### 后端与隐私实现

- `list_events(false, ...)` 现在同时返回公开赛事和私有赛事脱敏预览；私有记录在数据库返回层即将 `owner_user_id / owner_nickname / owner_avatar_url / event_date / event_time / venue / confirmed_count / waitlist_count / fee` 等敏感详情裁剪为 `null`。
- 新增 `get_private_event_preview`，仅返回私有赛事发现所需最小字段，并返回当前用户是否已经具备完整详情访问资格的布尔提示；不返回具体时间、场地、组织者或名单。
- 完整 `get_event_snapshot` 权限保持严格：未获权限用户即使知道完整赛事 ID / URL 仍不能读取私有赛事完整详情。
- `invite_connection_to_event` 权限更新：公开赛事允许 owner 或已真实报名 participant 调用；私有赛事普通邀请只允许 owner。
- 用户可见权限错误新增产品化文案，不直接暴露 `NOT_EVENT_OWNER / JOIN_EVENT_BEFORE_INVITING / NOT_CONNECTION` 等内部错误码。

### 验证

- 在当前测试数据库直接调用大厅列表：私有赛事返回城市/赛事基础分类，但组织者 ID/昵称、具体日期时间、venue、confirmed_count 和 fee 均为 `null`；公开 `test` 赛事继续返回完整公开信息。
- 未登录/无赛事权限上下文调用私有赛事预览，只返回赛事名、北京、单/双打、赛制、状态等最小字段，`can_view_full=false`。
- 完整详情仍由原 `get_event_snapshot` 权限边界保护，没有因为大厅可发现而放宽。

### 文档与 migration

- `PRODUCT_BASELINE.md`：加入私有赛事可发现/详情受限原则，并正式记录公开赛事参与者邀请语义。
- `VISUAL_DESIGN_BASELINE.md`：加入公开/私有赛事整卡视觉区分规则。
- `P0_ACCEPTANCE.md`：加入私有赛事数据裁剪、预览 URL、参与者邀请和公开/私有视觉验收项。
- 新增 migration：`20260829170000_private_event_preview_and_participant_invites.sql`。

### 关键 commit / 节点

- `9e56a83` — 私有赛事大厅卡路由到受限预览
- `2736445` — 新增私有赛事受限预览页
- `67cfd51` — 注册私有预览路由
- `d9ae927` — 私有赛事卡 / 预览页视觉差异
- `5fe08be` — 最终私有预览与公开参与者邀请 migration
- `f5457b8` — 新增公开赛事参与者邀请球搭子页面
- `bcb837f` — “我参与的”公开赛事增加“喊球搭子一起来”入口
- `a0769c0` — 清理旧 link-only 详情逻辑并统一水平人话标签
- `d125c79` — P0 验收基线同步

---

## 2026-08-29 — Pre-deploy mobile / privacy / invitation hardening

**状态**：已更新 `main` 与当前 Supabase 测试数据库，等待下一次中国区 CloudBase 手动部署与真机回归。

### 移动端交互

- 修复赛事邀请卡在窄屏下主/次按钮过度贴合的问题：接受为 Primary、暂不参加为 Secondary、“查看赛事”降为低强调详情入口；390px 及更窄视口自动纵向排列。
- `INTERACTION_BASELINE.md` 正式加入移动端动作区防碰撞规则：按钮/圆角/触控区不得重叠；三个及以上动作不得形成同权重大按钮矩阵；部署前必须检查窄屏文字挤压与动作层级。
- 对阵和排名无数据时不再只有一行提示，增加真实结构骨架，但不伪造球员、比分和名次。
- 合影 P0 明确采用系统照片选择/上传，不因进入页面主动申请摄像头权限；赛事结束后组织者可上传/替换主合影。

### 赛事身份与水平分级

- 测试身份缓存升级并禁止在服务端 canonical Profile 尚未恢复前放行身份敏感页面，降低旧 Profile 缓存导致“创建者被当普通用户”的风险。
- 赛事快照增加服务端 `viewer_role`（owner / invited / participant / viewer）作为权威身份依据。
- 大众业余水平六档统一为：2.0及以下 / 2.5 / 3.0 / 3.5 / 4.0 / 4.5及以上；数据库内部值使用 `≤2.0` / `≥4.5`，UI 统一转换成人话标签。
- 我的页面在 self Player 异常未恢复时显示“待恢复”，不再误导为“需要重新创建打球档案”。

### 临时球搭子隐私与转化

- 修复此前实现与产品基线不一致的问题：临时球搭子详情不再向创建者展示精确已赛、胜场、胜率、近期赛事、对手等完整战绩。
- 后端 `get_managed_player_profile` 同步做数据最小化，只下发基础管理资料 + `has_history`；底层 Player / Entry / Match 历史完整保留。
- 前台仅显示“已经积累比赛记录 / 加入后关联并解锁完整档案”的提示；创建者仍可编辑基础资料、代报名并邀请 TA 加入。
- 已验证：管理者可读取基础资料与 `has_history`；其他用户读取同一临时 Player 返回 `null`。

### 赛事邀请信息与权限

- 赛事邀请卡补齐日期、城市 + 场地、级别、单/双打或双打组队类型；待回应邀请优先显示。
- 普通赛事邀请与双打搭档邀请在数据库中不再共用同一条 `(event_id, invitee)` 唯一记录，避免一种邀请覆盖另一种邀请。
- 普通赛事邀请现在由 `(event_id, invitee_user_id)` 的 event-kind 唯一索引约束；双打搭档邀请按 `(event_id, inviter_user_id, invitee_user_id)` 独立约束。
- 当时版本将 `invite_connection_to_event` 收紧为仅赛事组织者可调用；该决定随后根据真实约球场景修订，当前规则见上方 “Private event discovery / participant invitation revision”。
- `invite_doubles_partner` 对私有赛事增加服务端访问校验：只有组织者、明确被邀请者或已参赛用户可以继续邀请搭档；仅知道赛事 ID 不可绕过私有赛事边界。
- 已通过事务验证：同一赛事/同一两名用户可以同时存在一条普通赛事邀请和一条双打搭档邀请，二者不互相覆盖。

### 文档与验收

- `PRODUCT_BASELINE.md` 更新当前六档水平体系、赛事邀请决策信息和动作层级。
- `P0_ACCEPTANCE.md` 增加临时球搭子 RPC 数据最小化、赛事邀请信息完整度、移动端动作碰撞、照片上传和身份缓存权限检查。
- 新增 migration：`20260829158000_minimize_temp_profile_and_enrich_event_invites.sql`。
- 新增 migration：`20260829159000_separate_event_and_partner_invites_and_harden_permissions.sql`。

### 关键 commit / 节点

- `f2dc0a4` — 固化移动端动作区防碰撞设计原则
- `a8bf061` — 临时球搭子数据最小化 + 赛事邀请信息增强 migration
- `c494c5a` — 临时球搭子前台隐藏精确战绩
- `8d63712` — 赛事卡统一业余水平人话标签
- `71dff7f` — 赛事邀请卡补城市/场地/级别与友好水平标签
- `8a65636` — 分离赛事邀请/双打邀请唯一性并强化后端邀请权限

---

## 2026-08-29 — Test session alias recovery hotfix

**分支**：`fix/test-session-alias-recovery`  
**背景**：合并重复测试 Profile 后，历史浏览器仍可能持有旧 guest auth session。由于旧实现只允许一个 `profiles.auth_user_id` 指向 canonical Profile，这些仍有效的旧 session 无法再解析到 G/老郑的 canonical Profile，表现为“我的打球档案空白”“球搭子列表空白”“查看我创建的赛事时被要求先完成打球档案”。

### 根因

- Profile 数据本身没有消失：数据库仍存在 G 的 self Player、G→老郑 Connection 和 G 创建的 `test` 赛事。
- 问题在 auth session → Profile 解析层。此前把 canonical Profile 只绑定到一个较新的 auth UUID，会使其他历史设备/session 失去身份映射。
- `IdentityGate` 又把“用户身份未恢复”错误描述成“准备你的打球档案”，让用户误以为赛事访问依赖填写水平/城市等打球偏好。

### 修复

- 新增 `private.profile_auth_aliases`，允许多个测试期 auth session 稳定解析到同一个 canonical Profile，但不复制 Profile/Player/Connection 数据。
- `current_profile_id()` 与 `ensure_profile()` 优先支持 alias 恢复。
- `complete_profile()` 在测试昵称对应既有 canonical Profile 时新增 auth alias，而不再不断改写 canonical Profile 的唯一 auth 绑定；避免以后再次把旧设备踢出身份。
- 对当前测试库中已知的历史 G / 老郑 session 做一次性 alias 回填。
- IdentityGate 文案改为“正在恢复你的球搭子身份”，明确身份恢复与“我的打球档案”是两件事。
- “我的打球档案”在 self Player 意外读取不到时不再显示空白页，而是给出明确恢复/重试状态。

### 验证

- 使用一个此前已被解绑的历史 G auth session 调 `current_profile_id()`，现在正确返回 canonical G Profile。
- 同一历史 G session 可以读取 G 的 self Player。
- 同一历史 G session 的“我创建的赛事”重新返回 `test`（北京）。
- 同一历史 G session 的 `list_connections()` 重新返回老郑。
- 因此查看“我创建的赛事”只依赖恢复用户身份，不依赖填写水平、常打城市、单双打偏好或约球时间等打球档案字段。

### 仓库 migration

- `20260829155000_support_test_auth_aliases.sql`

---

## 2026-08-29 — Event city required / public-private visibility

**状态**：已直接更新 `main` 与当前 Supabase 测试数据库，等待中国区前端重新部署验证。

### 产品变化

- `city` 正式改为赛事必填字段；赛事卡直接显示城市，不再只把城市当可选辅助信息。
- 当前测试数据库中原有缺失城市的历史赛事统一补为“北京”；其中 `test` 赛事现在明确为“北京”。
- 创建赛事的可见范围统一为两种：`公开` / `私有`，旧“仅链接可见”模式退出当前产品规则。
- 公开赛事：所有用户可在赛事大厅发现和查看。
- 私有赛事：当时版本不进入公开赛事大厅；该决定后来修订为“大厅可发现但只展示脱敏预览”，当前规则见本文最上方最新记录。
- 被邀请并有权查看私有赛事的用户仍可自行完成报名；完整详情权限由后端 `get_event_snapshot` 强制执行，不依赖前端隐藏。

### 数据与兼容

- 旧 `link_only` 赛事迁移为 `private`。
- `events.city` 改为 NOT NULL。
- `events.visibility` 约束改为 `public/private`。
- 同步修正赛事等级数据库约束；后续六档体系最终收口为当前六档大众业余体系。
- 仓库 migration：`20260829154000_require_event_city_and_private_visibility.sql`。

### 验证

- 当前 `test` 赛事数据库值：城市 `北京`、可见性 `public`。
- 使用当前 G 身份读取 `test` 赛事，快照返回城市 `北京`。
- 私有赛事完整详情在未获授权情况下仍由 `get_event_snapshot` 拒绝读取；大厅发现使用独立脱敏返回，不放宽该权限。

### 关键 commit

- `24b69b9` — 创建赛事表单增加必填城市与公开/私有说明
- `0688744` / `fccc5e3` — 前端赛事规则校验与私有赛事报名兼容
- `4b8d28f` — 数据库 migration 最终版
- `0816dde` — 产品基线同步公开/私有与城市必填规则

---

## 2026-08-29 — Test identity / history consistency hotfix

**分支**：`fix/test-identity-history-consistency`  
**背景**：PR #14 合并 `main` 后，中国区实测发现“大厅显示 test 赛事由 G 创建，但 G → 我的赛事 → 我创建的中缺失”，同时 G 与老郑已经建立球搭子关系，但“球搭子邀请记录”中缺少该历史记录。

### 根因

- 测试期曾多次使用匿名 auth 会话创建同名 Profile，历史上形成多个同昵称测试 Profile。
- `private.profile_nicknames` 已经指定 canonical Profile，但旧赛事、Connection、manual Player 等数据仍可能挂在其他同名 Profile 上，因此同一昵称在前台看起来像同一个人，数据库实际却是多个身份。
- `connection_invites` 是后续才引入的持久邀请表；既有 Connection 可能早于该表存在，因此关系成立但没有对应邀请历史行。

### 修复

- 以 `private.profile_nicknames` 为 canonical 身份来源，合并测试期同昵称重复 Profile。
- 将旧 Profile 下的 Event、Entry、Connection、Event Invite、Player Claim Invite、Connection Invite 与 manual Player 所有权迁移到 canonical Profile。
- 将重复 self Player 的历史 `entry_players` 记录迁移到 canonical self Player，再删除重复 self Player。
- canonical Profile 继续由 auth alias 机制支持历史测试 session 恢复。
- 对早于 `connection_invites` 上线、但已经 accepted 的 Connection 补一条 accepted 邀请历史记录，从而让邀请记录页完整反映历史关系。

### 验证

- 当前数据库同名测试身份已收口为 canonical Profile。
- 当前测试身份可查询到其创建赛事与已建立 Connection。
- 既有 accepted Connection 已能在球搭子邀请记录中反映历史关系。
- 本修复已直接应用到当前 Supabase 测试数据库；仓库 migration 为 `20260829153000_consolidate_test_identity_and_backfill_connection_history.sql`。

---

## 2026-08-29 — Partner lifecycle / H5 architecture consolidation

**分支**：`feat/partner-lifecycle-and-claim`  
**PR**：#14 `Unify partner lifecycle and claim invitations`  
**状态**：已合并 `main`；merge commit `56c246a3a8dcb4d776646f73e7d849bb5617d8de`。合并后继续在中国区 CloudBase 做移动端回归测试。

### 产品与信息架构

- 明确 User/Profile、Player、Connection 三层模型分离：真实用户身份、比赛参赛身份、球搭子关系不再混为同一对象。
- 确立“先比赛、先记录，人可以晚一点进入系统”的长期原则；临时 Player 可以先承载比赛历史，真实用户以后再关联。
- “球搭子们”拆分为“我的球搭子 / 临时球搭子”，禁止使用“正式球搭子”作为用户可见术语。
- 赛事大厅只负责发现、查看和进入赛事；创建和管理赛事统一放在“我的赛事 → 我创建的”。
- “我的赛事 → 我参与的”只展示真正完成报名、存在有效 Entry 的赛事；接受赛事邀请本身不等于报名完成。
- “我的战绩”与“我的赛事”职责分离；战绩只记录真正完成的比赛结果。
- 卡片交互统一为“卡片代表实体，点击进入实体详情；编辑、邀请、删除、报名、管理等是明确动作”。

### 球搭子邀请与历史关联

- 普通球搭子邀请由永久 profile 链接升级为一条一条可追踪邀请记录/token；对方完成必要身份流程后自动建立 Connection，不增加冗余确认步骤。
- 临时球搭子可发起“邀请 TA 加入并关联历史记录”；对方确认后保留此前比赛历史并建立 Connection。
- “球搭子邀请记录”统一展示两类邀请：普通球搭子邀请 + 临时球搭子历史关联邀请，但保持两类业务语义独立。
- 用户可见文案不暴露 claim / merge Player / 数据迁移等内部实现概念。

### 临时球搭子档案策略

- 后端持续保存临时 Player 的真实比赛历史、胜负、赛事与相关档案数据。
- 前台不向创建者展开完整历史战绩，避免提前消耗真实用户自己的档案价值。
- 临时球搭子前台以基础管理信息 + “已有比赛记录 / 加入后解锁完整档案”的方式呈现，用作自然用户转化机制。
- 创建者仍可编辑基础资料、代报名和继续积累比赛记录。

### 赛事发现与卡片

- 赛事卡增加组织者头像 / 昵称标识。
- `events` 增加独立 `city` 字段，不再从 `venue` 文本猜城市。
- 赛事卡重点展示组织者、城市、级别、时间、场地、类型、赛制、报名人数和费用等快速决策信息。
- 赛事等级体系与个人打球档案对齐；后续进一步收口为当前六档大众业余体系。
- 修复赛事表单抢七触发值由 select 写成字符串、但规则按 number 校验的问题。

### 缓存与请求策略

- `useQuery` 改为内存缓存 + in-flight 去重 + stale-while-revalidate。
- 同一业务数据统一 cache key，例如 Player 数据统一复用 `players`，赛事邀请摘要和详情共用 `my-event-invites`。
- 新增按 key / prefix 的精准缓存失效；写操作后只清理受影响缓存。
- 大厅、我的赛事、球搭子、档案、战绩、邀请记录等稳定页面取消固定 10/15 秒高频轮询。
- 进行中赛事详情、比赛和计分等真正多人动态场景暂时保留较短刷新，未来可评估 Realtime。
- Auth 启动可恢复匹配当前 auth user 的 Profile 本地缓存，再后台刷新，降低中国区前端跨境请求导致的首屏等待。

### 错误、空状态与代码卫生

- 用户可见错误文本产品化，减少 Supabase / JWT / SQL / timeout 等底层信息直接暴露。
- 修正“我参与的”空状态，明确只有完成报名后赛事才出现；邀请在独立入口处理。
- 大厅无赛事时不再提供跨职责的“创建赛事”主按钮，而是保持发现型空状态。
- 删除已被新页面替代的 `Basics.tsx` 及其中旧 Players/Profile/PlayerForm/Me 等重复实现，降低后续误改死代码风险。
- migration 文件时间戳整理为唯一顺序，减少新环境重放迁移时的版本冲突风险。

### 文档与开发基线

- 新增 `docs/PRODUCT_BASELINE.md`：当前产品 / 数据 / 流程真源。
- 新增 `docs/INTERACTION_BASELINE.md`：页面职责、实体卡片、动作层级、空状态、轮询等交互规则。
- 新增 `docs/P0_ACCEPTANCE.md`：当前 H5 MVP P0 验收基线。
- 更新 `docs/VISUAL_DESIGN_BASELINE.md`，保持原视觉方向，同时补充已经验证的交互一致性约束。
- 更新 README，明确 canonical source 阅读顺序与部署前审计规则。

### 验证与部署

- Supabase 中普通球搭子邀请创建 → 查询 → 接受 → Connection 已做事务验证。
- 临时 Player 详情 RPC 已验证：本人管理对象可读取，其他用户返回 `null`，匿名角色无执行权限。
- 赛事 `city` 字段已通过真实 `save_event` RPC 做事务验证。
- 当前 Vercel check 仍受 Hobby build-rate-limit 影响，不能作为代码编译失败依据。
- PR #14 已合并 `main`，之后继续以中国区 CloudBase 实际移动端测试结果作为回归依据。

### 关键 commit / 节点

- `c23e264` — Event card organizer identity
- `4e0f47f` — Restore cached test profile before network refresh
- `0503661` — Connected partner card/detail flow
- `c019a07` — Align hall level filters with player levels
- `6be5136` — Canonical product / interaction / acceptance documentation consolidation
- `56c246a` — PR #14 merged into `main`

---

## 2026-08-29 — V6 lifecycle / privacy / i18n release traceability

**分支 / PR**：`feature/20260829-event-lifecycle-privacy-i18n` / PR #20  
**状态**：长期产品与验收基线已同步；对应代码缺陷仍按 Issue #21 独立整改/验证，当前候选版本尚不可部署。

### 本轮长期规则同步

- 用户侧只使用“参赛建议级别”区间，不再恢复旧单一“赛事级别”作为筛选/资格概念。
- 比赛日期、开赛时间进入创建赛事 P0；最晚报名默认开赛前2小时，只能更早，修改时间导致越界时必须自动收紧并提示。
- 报名截止是服务端权限边界；截止瞬间后所有普通名单变更路径、旧页面/深链和直接 RPC 均不得绕过。
- 私有大厅脱敏卡不展示 registration deadline、比赛时间或可反推活动时间的信息。
- “我的 → 设置与隐私”承载真实字段可见性、赛事邀请与双打邀请开关；隐私设置不改写赛事共同事实。
- 简体中文 / English 正式验收要求核心流程全量覆盖；业务逻辑不得通过比较展示文案判断状态或权限。
- 赛事详情的 owner / invited / participant / viewer 以服务端赛事快照 `viewer_role` 等权威事实判断，本地 Profile/cache 不能单独决定组织者管理入口。
- “我的赛事 → 我参与的”按有效 Entry 内实际 Player 参与事实判断；双打两名已关联真实用户的搭档都应进入，邀请接受但未形成 Entry 不提前进入。

### 文档同步

- `docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md`：补齐权威身份、“我参与的”双打参与事实、核心英文验收与展示文案禁入业务逻辑。
- `docs/PRODUCT_BASELINE.md`：已同步 V6 长期产品规则。
- `docs/INTERACTION_BASELINE.md`：同步 V6 截止时间、建议级别、身份、参与事实、隐私和 i18n 交互规则。
- `docs/P0_ACCEPTANCE.md`：重构为完整 V6 P0 验收基线，加入边界/权限/双打/i18n/clean replay 等发布前检查。
- `CHANGELOG.md`：保留全部历史记录并追加本节，建立 release traceability。

### 关键文档 commit

- `db4bd944` — PRODUCT_BASELINE V6 同步
- `a06da645` — PRD V6 身份与参与语义补齐
- `42eaf2bf` — INTERACTION_BASELINE V6 同步
- `66f4209a` — P0_ACCEPTANCE V6 同步

### 发布状态说明

- 本节是最初建立 V6 文档依据时的历史快照；最新实现/验证状态以上方更新的 release traceability 节为准。
- 当时 `AUD-20260829-006` 已知存在 EventPage 权威身份/build 阻塞。
- 当时 `AUD-20260829-008` 尚未完成；现已由后续 migration 修复并独立验证，见上方 addendum。
- `AUD-20260829-001` clean replay / migration history 一致性仍待证明。
