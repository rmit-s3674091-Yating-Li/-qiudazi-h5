# 球搭子 H5

真实可部署、多人共享赛事数据的移动端 H5 MVP。

## Canonical sources

当前仓库中的可读源码是实现真源。任何较大功能开发、页面重构、AI/Codex 生成代码或部署前审计，必须先阅读：

1. `docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md` — 2026-08-29 大版本增量 PRD；覆盖建议级别区间、报名截止/自动锁定、隐私、受保护赛事照片与双语
2. `docs/PRODUCT_BASELINE.md` — 当前产品/数据/流程长期规则
3. `docs/INTERACTION_BASELINE.md` — 页面职责、交互与避免重复设计规则
4. `docs/VISUAL_DESIGN_BASELINE.md` — 长期视觉设计基线
5. `docs/P0_ACCEPTANCE.md` — 当前 H5 MVP 验收基线
6. `docs/AUDIT_AUTOMATION_GOVERNANCE.md` — 审计、待整改 backlog、并发写入、整改与独立验证的长期治理规则
7. `CHANGELOG.md` — 大版本、架构与部署节点历史
8. 当前已验证源码、共享组件与 `src/styles.css`

若早期 PRD、页面规格、视觉 Demo、旧 bundle 文档与上述当前基线冲突，以当前基线和用户最近明确决定为准。

## Stable product principles

- User/Profile、Player、Connection 必须分离；姓名/昵称不是实体关联键。
- 先允许比赛和记录发生，人可以晚一点进入系统；临时 Player 的历史必须可保留并在真实用户加入后关联。
- 临时球搭子的完整历史档案可在后台持续积累，但前台不向创建者展开完整战绩；以“加入后解锁自己的完整档案/历史记录”形成自然转化。
- 双打以一个 Entry 表示一队，不能拆成两个独立报名人。
- 卡片代表实体，点击卡片进入实体详情；编辑、邀请、删除、报名、管理等属于明确动作。
- 赛事使用“参赛建议级别区间”帮助发现和匹配，不把建议级别当硬报名资格。
- 比赛日期/开赛时间是 P0 必填；最晚报名默认开赛前2小时且只能提前。截止后所有名单写操作必须由服务端拒绝，并进入名单锁定语义。
- 报名截止卡片提示只使用已加载数据在本地做小时级展示，不为倒计时增加数据库轮询。
- 同一业务对象只有一个主要职责入口：赛事大厅负责发现赛事；创建/管理赛事归“我的赛事 → 我创建的”；战绩与赛事严格区分。
- 接受赛事邀请不等于完成报名；只有真正生成有效 Entry 才属于“我参与的”。
- 隐私设置控制个人档案浏览范围，不改写赛事名单、比分、赛果等共同赛事事实；邀请隐私必须由服务端执行。
- 赛事照片是独立受保护用户内容：赛事公开不代表照片公开；只有组织者和有效 Entry 中已关联真实用户的实际参赛者可查看。默认只展示私有水印预览，高清必须显式触发并经服务端重新授权，Storage 不使用长期 public URL；设置与隐私提供有权限照片的一键删除入口。
- H5 MVP 支持简体中文 / English，采用轻量统一 i18n 层和本地语言偏好，不建立复杂国际化后端；English 必须按真实字符长度完成窄屏 Visual QA。
- 稳定数据不做高频轮询；优先缓存、stale-while-revalidate、页面重新激活后的按需刷新和写后精准失效。
- UI 不暴露数据库/RPC/claim/merge 等内部实现术语。
- 不用前端隐藏按钮代替服务端权限；关键状态转换和权限必须由后端保证。
- 测试期昵称身份接管是受控测试方案，不是正式登录设计；正式用户体系后续接入微信等可靠身份。

## Development hygiene

- 同一业务数据应复用统一 query/cache key，避免重复请求。
- 写操作后精准 invalidate 受影响缓存。
- 不保留已经被新路由/新组件替代的整套旧页面实现。
- 数据库 migration 版本必须唯一、顺序清晰且可重放；新增字段必须完成 DB → RPC/repository → type → form → display → permission → acceptance 全链路检查。
- Storage public/private、对象读取/删除权限与产品隐私规则必须进入 migration/clean replay/Release Gate 对照，不能只依赖页面是否显示入口。
- 用户可见错误必须产品化。
- 大版本部署前做一次综合审计；每小时 routine 只判断是否出现新的尚未审计大改。
- 自动化治理规则不得只存在于任务 Prompt；长期规则以 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 为准。

## Vercel quota conservation policy

Vercel Preview 属于稀缺测试资源，不作为日常每次代码/文档修改后的默认验证环境。开发阶段默认优先使用 GitHub feature branch、本地构建/静态检查、GitHub CI 与 Supabase 侧验证，把多个相关修改收口为阶段性候选版本后，再使用 Vercel Preview 做真实页面黑盒测试、Visual QA 和 English QA。

- 不因为单个小改动、纯文档修改、格式调整、审计记录更新或非部署必要 commit 主动触发 Vercel 部署。
- 能合并验证的连续修改尽量批量收口，避免“改一点 → push → Preview → 再改一点 → 再 Preview”的高频消耗。
- Vercel 优先用于：阶段性完整候选版本、必须依赖真实部署环境复现的问题、完整黑盒/移动端 Visual QA/English QA，以及 Release Gate 前的最终候选。
- 自动化整改、代码巡检、安全审计和文档同步不得为了获得 Preview 而主动部署 Vercel；能够通过源码、CI、本地或 Supabase 验证的事项先在这些环境完成。
- 形成 Vercel 测试候选前，应尽量先完成同批 P0/P1 修复、build/CI、migration clean replay 与静态审计，减少因低级错误浪费 Preview 配额。
- Vercel Preview 失败时先区分代码/配置错误与平台 build/deployment quota 限制；额度限制不能被登记成产品代码 Bug。
- Vercel Preview 通过后仍不等于 Release Gate 通过；中国区 CloudBase 继续按独立部署前审计与手动部署流程执行。

## Scheduled audit and remediation roles

当前自动化体系固定为 5 个定时任务。详细治理规则以 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 为准。这里保留角色摘要。

### 正式待整改 backlog 与并发模型

- Supabase `audit_ops.issue_registry` 是正式待整改问题清单和唯一事实源；AUD 的存在、编号、优先级和状态以该 backlog 为准。
- 新问题必须通过 `audit_ops.create_issue(...)` 在一个数据库事务中完成语义去重、原子编号和正式记录创建；任何任务不得自行计算或预留 AUD 编号。
- 多个审计/测试/Gate/安全任务可以并发创建不同 backlog row；这类写入由数据库事务和唯一约束处理，不需要单 writer。
- GitHub Issue #21 正文只是 backlog 的人类可读镜像，不是新问题创建入口，也不得反向覆盖 Supabase 状态。由于正文属于整块共享文本，应由固定镜像同步流程更新。
- Issue #21 评论只用于已经存在 AUD 的整改/验证工作详情，例如认领、修复范围、commit/migration、补充证据、FAILED/BLOCKED 和独立验证结论；评论采用 append-only，多个任务可以并发追加，不需要单 writer。
- 「球搭子问题整改」是唯一自动修复者，而不是整个体系的唯一 writer。它当前同时承担 Issue #21 正文镜像同步职责。
- GitHub repo/canonical/CHANGELOG 文件更新必须采用 optimistic concurrency：写前重新获取完整文件和最新 blob SHA；若 stale/conflict，必须重新读取并重新合并，禁止用旧内容强制覆盖。

### 球搭子代码变更巡检（白盒）

- 角色：白盒代码 Bug 巡检者。
- 目标：从候选分支、PR、migration、RPC/schema 和调用链发现 CI/build 不一定能捕获的逻辑回归。
- 新问题：语义去重后直接通过 `audit_ops.create_issue(...)` 创建正式 backlog 记录。
- 边界：只发现、取证和独立验证；不得修产品代码/数据库，不得整段修改 Issue 正文。对已有 AUD 的验证或补证据可并发追加 Issue 评论。

### 球搭子全功能测试（黑盒 + Visual QA / UX QA）

- 角色：真实用户视角的黑盒功能、视觉和体验验收者。
- 目标：沿完整用户旅程验证所有现有功能真实可用，同时检查实际移动端渲染，不以源码或绿色 CI 替代用户测试。
- Visual/English QA：优先覆盖 375px、390px、430px 或最接近 viewport，并检查中文/English、长文本、长赛事名/用户名及完整页面状态。
- 新问题：语义去重后直接通过 `audit_ops.create_issue(...)` 创建正式 backlog 记录。
- 边界：不自行修复、不整段修改 Issue 正文；已有 AUD 的复现和验证详情可并发追加为 Issue 评论。

### 球搭子周安全审计

- 角色：独立安全审计者。
- 目标：检查身份/会话、邀请、RLS、SECURITY DEFINER/RPC、越权、私有数据边界、数据库并发、Storage、短时授权、依赖供应链和新增攻击面。
- 新问题：语义去重后直接通过 `audit_ops.create_issue(...)` 创建正式 backlog 记录。
- 边界：不直接整改、不整段修改 Issue 正文；已有 AUD 的安全证据和独立验证可并发追加为 Issue 评论。

### 球搭子问题整改

- 角色：自动化体系中唯一的定时自动修复者；不是全局唯一 writer。
- 目标：只从 Supabase backlog 中按 P0 → P1 → P2 认领规则明确、范围可控的问题；发布阻塞优先。
- 认领：先在 backlog 更新 `IN_PROGRESS`、owner、branch/PR/head 和范围，再记录对应工作日志。
- 修复写入：负责自动修改产品代码、必要 migration 和受影响文档；当前同时承担 Issue #21 正文镜像同步。
- 并发保护：对 repo/canonical/CHANGELOG 等完整文件严格执行最新 blob SHA + 重新读取/合并规则；这属于共享文件写入保护，不限制其他任务写 backlog row 或追加评论。
- 状态：修复成功只能进入 `FIXED_PENDING_VERIFY`；不得自行 `VERIFIED`。独立验证后再依据证据归并 backlog 状态，并刷新 Issue #21 镜像。
- 禁止：不得自动合并 `main`，不得主动触发 Vercel，不得自行发明产品规则或执行未经确认的破坏性数据库操作。

### 球搭子部署前审计

- 角色：独立 Release Gate。
- 目标：判断真正准备部署到中国区 CloudBase 的候选版本是否工程完整、可复现且满足发布条件。
- 重点：候选 SHA、migration clean replay、repository↔live Supabase schema/RPC/RLS/Storage、CI、黑盒/Visual/English 证据和所有发布相关 P0/P1 的独立验证状态。
- 新问题：语义去重后直接通过 `audit_ops.create_issue(...)` 创建正式 backlog 记录。
- 边界：只审计和判定 Gate，不修代码/数据库，不整段修改 Issue 正文；已有 AUD 的 Gate 证据可并发追加评论。

### 自动化协作闭环

推荐理解为：`代码变更巡检（白盒）` + `全功能测试（黑盒 + Visual/UX）` + `周安全审计` + `部署前审计（Gate）` 并发发现问题 → 各自通过 `audit_ops.create_issue(...)` 原子创建正式 backlog row → 对已有 AUD 的整改/验证过程通过 append-only 评论并发记录 → `问题整改` 作为唯一自动修复者认领并修复 → 独立检查者回归验证 → 状态归并后刷新 Issue #21 正文镜像 → Release Gate 判定是否可部署。

并发治理原则是：**数据库行级原子写入 + Issue 评论 append-only + Issue 正文固定镜像同步 + repo 文件 optimistic concurrency**，而不是“整个自动化体系只有一个 writer”。

所有任务运行开始都必须读取最新 canonical 文档、`docs/AUDIT_AUTOMATION_GOVERNANCE.md` 和 Supabase backlog。CI/build 绿色不得自动推定功能、视觉、安全或发布条件已经通过。

## Release / change traceability

任何影响产品核心流程、信息架构、数据模型、权限、身份、分享深链、审计治理或部署策略的较大变更，都必须更新 `CHANGELOG.md`。中国区手动部署前必须确认 PRD/基线/P0/治理基线/CHANGELOG 与实现一致，并回填实际部署 head 和真机结果。

## Build

```bash
npm install
npm run build
```

Vercel 与 CloudBase 构建应使用仓库中的当前可读源码。Vercel 限额或平台失败不能被误判为代码构建失败；中国区测试可按当前约定使用 CloudBase 手动部署 feature 分支，但未经真机/E2E 验证不要自动合并 `main`。