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

## 2026-08-29 — Partner lifecycle / H5 architecture consolidation

**分支**：`feat/partner-lifecycle-and-claim`  
**PR**：#14 `Unify partner lifecycle and claim invitations`  
**状态**：开发与部署前审计阶段；尚未合并 `main`；中国区 CloudBase 待统一手动部署验证。

### 产品与信息架构

- 明确 User/Profile、Player、Connection 三层模型分离：真实用户身份、比赛参赛身份、球搭子关系不再混为同一对象。
- 确立“先比赛、先记录，人可以晚一点进入系统”的长期原则；临时 Player 可以先承载比赛历史，真实用户以后再关联。
- “球搭子们”拆分为“我的球搭子 / 临时球搭子”，禁止使用“正式球搭子”作为用户可见术语。
- 赛事大厅只负责发现、查看、报名公开赛事；创建和管理赛事统一放在“我的赛事 → 我创建的”。
- “我的赛事 → 我参与的”只展示真正完成报名、存在有效 Entry 的赛事；接受赛事邀请本身不等于报名完成。
- “我的战绩”与“我的赛事”职责分离；战绩只记录真正完成的比赛结果。
- 卡片交互统一为“卡片代表实体，点击进入实体详情；编辑、邀请、删除、报名、管理等是明确动作”。

### 球搭子邀请与历史关联

- 普通球搭子邀请由永久 profile 链接升级为一条一条可追踪的 token 邀请记录。
- 普通邀请维持低摩擦体验：打开邀请后可自动建立球搭子关系，不增加冗余确认步骤。
- 临时球搭子可发起“邀请 TA 加入并关联历史记录”；对方确认后保留此前比赛历史并建立 Connection。
- “球搭子邀请记录”统一展示两类邀请：普通球搭子邀请 + 临时球搭子历史关联邀请，但保持两类业务语义独立。
- 用户可见文案不暴露 claim / merge / Player 合并等内部实现概念。

### 临时球搭子档案策略

- 后端持续保存临时 Player 的真实比赛历史、胜负、赛事与相关档案数据。
- 前台不向创建者展开完整历史战绩，避免提前消耗真实用户自己的档案价值。
- 临时球搭子前台以基础管理信息 + “已有比赛记录 / 加入后解锁完整档案”的方式呈现，用作自然用户转化机制。
- 创建者仍可编辑基础资料、代报名和继续积累比赛记录。

### 赛事发现与卡片

- 赛事卡增加组织者头像 / 昵称标识。
- `events` 增加独立 `city` 字段，不再从 `venue` 文本猜城市。
- 赛事卡重点展示组织者、城市、级别、时间、场地、类型、赛制、报名人数和费用等快速决策信息。
- 赛事等级体系与个人打球档案对齐，补齐 `4.5` / `5.0+` 等级。
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
- 大厅无公开赛事时不再提供跨职责的“创建赛事”主按钮，而是保持发现型空状态。
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
- 本批变化在进入 `main` 前必须先完成中国区 CloudBase 手动部署和移动端 E2E 验证。

### 关键 commit / 节点

- `c23e264` — Event card organizer identity
- `4e0f47f` — Restore cached test profile before network refresh
- `0503661` — Connected partner card/detail flow
- `c019a07` — Align hall level filters with player levels（本轮功能整合前的主要 head）
- `6be5136` — Canonical product / interaction / acceptance documentation consolidation

> 注：本分支包含多个连续小 commit。最终部署节点应以部署时实际 branch head 为准，并在本文件后续版本记录中补充。
