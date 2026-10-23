> 设计研究文档 · 本文记录研究证据与候选方案，不代表代码已实现、费用已批准或正式上线。
> 来源：现有别名、RLS 与管理员权限审计；2026-10-21—22 的原始 Handoff，基线 HEAD 39e17fe。
> 状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL；用户尚未批准开发、数据库迁移或付费。

# 球搭子｜小程序 × H5 统一身份：别名 RLS 与会话桥接专项审计（第三轮增量）

STATUS=DESIGN_EVIDENCE_CONSUMED  
HANDOFF_ID=QD-MP-20261021-0904-ALIAS-RLS-BRIDGE  
RESEARCH_TOPIC=现有身份别名、业务 Profile 可见性、管理员授权边界、微信 code2Session 到 Supabase 会话的受支持路径  
BASE_REPO=rmit-s3674091-Yating-Li/-qiudazi-h5  
BASE_BRANCH=feature/v8-confirmed-20261011  
BASE_SHA=39e17febc23d5732c867bb2244a02fd2d99e36a8  
BASE_PR=Draft #26；小程序仍为设计研究，不是 V8 第六项已确认开发  
READ_ONLY_SUPABASE=qiudazi-test / rtmjzmgrhifjzxaliltm（仅 catalog / aggregate SELECT；未读取 G、老郑个人 ID、邮件、token）  
CREATED_AT=2026-10-21 09:04 Asia/Shanghai  
WRITE_BOUNDARY=仅交互式主 Chat 审核并决定写入；本轮不修改 GitHub/Supabase/Vercel/微信配置，不干扰 H5 P3 地图验收  
SUGGESTED_TARGET_FILES=docs/research/miniprogram/identity-architecture.md; docs/research/miniprogram/legacy-user-migration.md; docs/research/miniprogram/wechat-login-options.md; docs/research/miniprogram/official-sources.md  
PATCH_PACKAGE_ID=QD-MP-DOCS-20261021-0904-ALIAS-RLS

## 1. 与前两轮不同的新证据

已复用仓库现有 `docs/research/miniprogram/identity-architecture-and-cost.md`（首轮）和 `framework-reuse-matrix.md`（第二轮），及 Library 中对应的已消费 handoff；**不重复** Taro/原生/uni-app 选型与一般性微信登录概念。实时 GitHub HEAD 已推进至 `39e17fe`（地图搜索独立提交）；本轮仅阅读代码。

### A. 一个具体的跨 Auth 身份兼容性缺口（新发现，非已证实运行时事故）

测试库 `public.profiles` 的可见 SELECT policy `profiles_self_read` 条件是 `auth_user_id = auth.uid()`，**没有** `current_profile_id()` 别名回退。与此同时 `public.players` 的 `players_owner_read` 使用 `owner_user_id = current_profile_id()`。因此，在一个 Auth 身份经 `private.profile_auth_aliases` 映射到原有 Profile 时，`current_profile_id()` 与玩家记录可以解析旧 Profile，但**直接对 `public.profiles` 发起的客户端 SELECT 可能因 RLS 不可见**。这属于需要真实 session 测试的结构性不一致，不等于已证明 G 登录失败的根因。

- 只读 catalog 发现：`private.profile_auth_aliases` 306 条；306 条均映射到 `profiles.auth_user_id` 不同的 Auth ID（即非主身份）。
- 目前 `profiles` 的可见 SELECT policy 未见任何使用 `current_profile_id()` 的 policy（计数 0）。
- `public.current_profile_id()` 的 SECURITY DEFINER 实现：先 `profiles.auth_user_id=auth.uid()`，其次查 `private.profile_auth_aliases.auth_user_id=auth.uid()`；返回 Profile UUID。
- `public.ensure_profile()` 为 SECURITY DEFINER，别名用户走 RPC 可能正确拿到 Profile；因此必须**区分 RPC 成功与直接表 SELECT 失败**，不能泛化为所有页面必坏。

**建议设计差异**：将 Profile 读取契约统一为服务端安全 resolver（按 JWT `auth.uid()` → 唯一稳定 `profile_id`），再决定是否需调整 `profiles_self_read` RLS；不建议仅为通过前端读取而直接扩大公开可读范围。调整 RLS 之前审计所有 `profiles` SELECT/UPDATE policy、`ensure_profile()` 调用路径、Storage RLS 和管理员读取路径。

### B. 管理员授权不沿用 Profile alias（新确认）

实时测试库 `public.platform_admin_my_role()` 以 `platform_ops.admin_members.auth_user_id = auth.uid()` 且 `active=true` 查询；`admin_members` 当前有 2 条 active 记录（仅汇总数，未提取任何人身份）。**换用新的 Supabase Auth UUID 即使指向同一 Profile，也不会自动获得管理员权限**。这应当保留为安全隔离，而不是改成“Profile 一致自动授予 super_admin”。

- `platform_ops.admin_members.auth_user_id` FK → `auth.users.id ON DELETE RESTRICT`；`platform_ops.admin_action_audit.actor_auth_user_id` FK → `auth.users.id ON DELETE RESTRICT`。
- 这意味着不可随意删除旧 Auth 用户来“去重”：会受到外键限制，也可能破坏历史审计归属。
- G 的后台“权限不可用”目前仍是**未定位的运行时故障**；可能涉及登录的 Auth UUID、JWT、admin_members、请求鉴权、部署版本等，不能仅凭此只读 schema 认定原因，更不能把未来微信登录当修复方案。

### C. 历史业务数据主键仍应保留 Profile（新验证）

数据库 FK 实查：`events.owner_user_id`、`entries.signup_user_id`、`players.owner_user_id/linked_user_id`、`connections` 双方、`connection_invites`、`event_invites`、`event_album_preferences`、`participant_album_photos`、`profile_preferences` 等均指向 `public.profiles(id)`；`profiles.auth_user_id` FK → `auth.users.id ON DELETE RESTRICT`。因此迁移的**最小变更面**应是认证关联，不是重写历史赛事/成绩/好友/照片外键。

### D. 昵称登录与昵称关联是两个必须同时退役的攻击面（新确认）

- `supabase/functions/test-identity-exchange/index.ts` 接受 nickname，service_role 查询身份、调用 `auth.admin.generateLink({type:'magiclink',email})`，向客户端返回 `token_hash`；H5 `loginByNickname()` 再 `verifyOtp()`。该链路仅适合受控测试，不能作为公开产品账号恢复。
- 更容易遗漏的是迁移 `20260829075002_support_test_auth_aliases.sql` 的 `complete_profile()`：当昵称匹配已有已完成 Profile 时，会将**当前 Auth ID 直接插入** `private.profile_auth_aliases` 指向该 Profile；并未验证原 Profile 的控制权。仅关闭登录页昵称按钮，不足以切断此路径。
- 推荐正式身份方案上线前，将 nickname→历史 Profile 的自动关联行为**纳入同一停用门槛**，改为“已认证原会话主动绑定 / 经过独立证明的人工恢复”；先 dry-run 验证依赖和测试数据影响，禁止自动删除旧 Profile/alias。

## 2. Supabase 官方能力实核：微信 `wx.login` 不是现成 OAuth 登录

2026-10-21 官方文档复核：

| 机制 | 官方明确支持的内容 | 与微信小程序的缺口 | 本项目建议 |
| --- | --- | --- | --- |
| Supabase Custom OAuth2/OIDC Provider | Custom OAuth2 需要 authorization/token/userinfo URL 并从 OAuth authorize 重定向开始；OIDC 需 discovery/JWKS；Free 最多 3 个 custom providers | `wx.login()` 给出的临时 code + 服务端 `code2Session` 不是 `signInWithOAuth` 标准浏览器回调流程；不能把 code 直接填成 Supabase OAuth token | **不直接使用**，除非单独证明具体微信入口实现兼容且可安全绑定老用户 |
| Supabase Third-Party Custom OIDC | 接受具有 HTTPS issuer discovery、非对称签名 JWT、`kid`、`role` 的第三方 IdP；通过 `accessToken` 送 JWT | 微信 `code2Session` 不提供可直接作为上述 OIDC JWT 的 Supabase 凭据；另建 OIDC issuer 会新增运维与 RLS/issuer 风险 | MVP **不优先**，非“免费开关”；须评估维护和 Third-Party MAU 计费 |
| Supabase `linkIdentity()` | 受支持的 OAuth 身份链接，要求已登录、完成 OAuth / ID token 验证 | 并非通用“任意 openid 绑定”API；微信小程序 code 不等于可传入的受支持 ID token | 只对真正支持的 OAuth 入口评估，不能拿它当小程序后端绑定方案 |
| Auth Admin `generateLink()` | 官方生成 email magic link/OTP（用于邮件分发/受控管理） | 当前昵称测试 Edge 把 token_hash 回给未验证昵称请求方；不安全。即使前置微信 code2Session，也必须证明唯一外部身份绑定与安全会话兑换 | 仅作为**高风险受控协议 PoC 候选**，禁止直接复制测试 Edge 到生产 |
| 自建后端 session / proxy | 可通过自有服务验证微信身份并保护业务接口 | 不会自动变成 Supabase Auth session；需重新证明所有 JWT/RLS/Storage/Realtime/Platform Admin 授权 | 安全备选，TCO 较高，未证实低成本 |

**关键结论**：现在没有足够官方证据证明“`code2Session` → Supabase Auth 原生 refreshable session”存在无需额外安全设计的一步式托管 API。不得声称微信正式登录桥接已解决。与第一轮相比，本轮确认了 **Supabase `linkIdentity()` 也不是通用 OpenID 绑定捷径**。

## 3. 可执行的最小风险会话桥接 PoC 契约（设计，不执行）

**端点**：`POST /identity/wechat-mini/exchange`；只接收 `{ login_code, request_id, client_nonce }`，不接收客户端指定 `profile_id`、`auth_user_id`、`openid`、`unionid`、管理员角色。服务端调用微信 code2Session，绑定表事务以 `(provider, app_id, openid)` 唯一；可选 UnionID 只作冲突线索，不能未经验证自动合并。

**状态机**：`CODE_RECEIVED → WECHAT_VERIFIED → {BOUND_USER | NEW_USER_PENDING | CONFLICT_REVIEW} → SUPABASE_SESSION_VERIFIED → ACTIVE`。未能获得可验证的 Supabase Auth 会话时停在 `SESSION_BRIDGE_UNSUPPORTED`，不得伪造成功。

**重放/冲突规则**：单次 code；对 `(provider,app_id,openid)` 原子唯一；`request_id` 服务端绑定 nonce/客户端会话，限时幂等、禁止同一 request_id 变更 subject；重试不得重复创建 Profile；解绑需要近期重认证和审计；微信 `session_key`、AppSecret、service_role、任何 OTP/hash/token 均不进入客户端或日志。

**两种安全候选优先级**：
1. **优先验证“保持原有 Supabase Auth session”的受控桥接**：使用真实微信身份后服务端解析已明确绑定的 Auth UUID；评审 Supabase 官方受支持会话签发/兑换 API，确认能安全创建/刷新、撤销 session 且不会暴露可被其他主体重放的登录材料。`generateLink()` 不是默认生产答案。
2. **如 1 不可行**，重新估算独立可信后端 session + BFF（Backend for Frontend）对现有 RLS、Storage、Realtime、Admin 的改造和持续成本；不允许为节省认证费而使用静态 service_role 客户端调用或无签名自制 JWT。

**零新增费用验证**：mock code2Session + 本地状态机测试 + 现有 Auth/Profile/alias 聚合检查 + 只读 RLS 模拟分析；不申请微信资质、不写 DB、不部署、不产生费用。它不证明真机登录可上线。

## 4. G / 老郑迁移：两层身份与两条授权路径

| 层 | 原有关系 | 新微信身份绑定后验收 |
| --- | --- | --- |
| 登录主体 | `auth.users.id`（可能存在历史别名） | 旧身份保留、微信新主体经过证明关联；刷新、退出、换端无串号 |
| 业务主体 | `public.profiles.id` | 不变；赛事、成绩、玩家、好友、相册外键不改 |
| Profile 读取 | `ensure_profile()` 与 `profiles_self_read` 不完全同构 | 已绑定 alias 的 Auth 通过 RPC 与直接读取的可见性一致或明确定义仅 RPC 入口；无跨用户泄露 |
| Admin | `admin_members.auth_user_id` 直接匹配 JWT | 不能凭昵称、Profile alias 或 UnionID 自动提升权限；管理员切换必须独立授权审批、回归审计 |
| 历史审计 | `admin_action_audit.actor_auth_user_id` | 保留旧 actor ID，不能覆盖/重写旧审计记录 |

**受控迁移顺序**：先匿名化 baseline/备份 → 停止新昵称绑定入口（必须覆盖 `complete_profile` 的自动 alias 逻辑）→ 测试库以两个可验证的旧会话分别绑定 → 逐项对账 → 管理员单独验证与授权 → 回滚演练 → 才考虑正式切换。**不可仅用昵称 G / 老郑识别数据库目标**；不在 handoff 中携带实际 ID、邮箱或密钥。

## 5. 需主 Chat 审查的设计级 PATCH_PACKAGE（不得自动写产品）

### Patch A：身份架构文档

在 `identity-architecture.md` 增加“Profile 读取的 alias-aware RLS 与 RPC 契约”小节：
- 明确 `profiles_self_read` 当前只认 `auth_user_id=auth.uid()`，`players_owner_read` 使用 `current_profile_id()`；
- 标记为 `RLS_ALIAS_COMPATIBILITY_GATE`；
- 建议测试两条读取路径（authenticated alias session 下的直接 `profiles` SELECT 与 `ensure_profile()` RPC），并用非拥有者 session 测越权拒绝；
- 在确认所有 policies 后才提最小化 migration；**本 handoff 不包含直接可执行 ALTER POLICY SQL**，避免未知策略组合误授权。

### Patch B：历史迁移文档

在 `legacy-user-migration.md` 增加 `complete_profile()` 的昵称命中自动 alias 行为、旧 Auth ID 不可删除、admin_members 与审计 FK 的独立性；将停用测试昵称登录定义为**前端 + Edge + RPC + 数据迁移/回滚**四处一致性工作。

### Patch C：登录选型文档

在 `wechat-login-options.md` 增加上述四种 Supabase 官方机制的“适用/不适用”结论，新增 `SESSION_BRIDGE_UNPROVEN` 作为正式登录上线 blocker，明确“微信 code 已验证”与“Supabase session 已签发”是两项独立验收。

### Patch D：官方来源文档

追加本轮来源（见第 8 节），并保留微信官方后台资质/费用/域名为 `待官方核验`；不得虚构 0 元上线。

## 6. 验收矩阵（供 Chat 后续批量实现前审查）

| 测试 | 成功条件 | 失败应阻断什么 |
| --- | --- | --- |
| ALIAS-01 | 原 Auth 与经授权 alias Auth 均解析同一 Profile，`ensure_profile`/Profile 可见性契约明确 | 阻断切换默认微信登录 |
| ALIAS-02 | 非拥有者 Auth 直接 SELECT、RPC、Storage 都不能读他人私有数据 | 阻断任何 RLS 扩权 migration |
| ALIAS-03 | 重复昵称、同头像、UnionID 相似不得触发自动合并 | 阻断账号自动合并 |
| ALIAS-04 | 新用户昵称撞上老用户昵称不能获得老 Profile 的历史赛事/照片 | 阻断正式开放 |
| ADMIN-01 | 普通用户即使绑定管理员的业务 Profile 也不获得 admin 权限 | 阻断管理员上线 |
| ADMIN-02 | 管理员 Auth UUID 变更需独立审批；旧审计不变 | 阻断删除旧 Auth/改写审计 |
| BRIDGE-01 | 同一微信 code 不可重放，不同 AppID 同 OpenID 文本不碰撞 | 阻断会话签发 |
| BRIDGE-02 | session JWT 的 `sub` 是真实且已关联的 Auth UUID；服务端 RLS/Edge 校验通过 | 阻断业务写操作 |
| BRIDGE-03 | 断网重试/多端切换/登出清缓存，不串 G/老郑历史数据 | 阻断发布 |
| BRIDGE-04 | 过期、撤销、异常刷新 token 能失败关闭且不会泄露服务端密钥 | 阻断正式认证上线 |

## 7. 成本与决策（零新增费用优先）

- 本轮新增研究和 PoC 设计：**0 元新增付费服务**，只读现有仓库/测试库与官方文档；开发/测试工时仍然存在，不等于零 TCO。
- 方案一：复用现有 Supabase Auth + 可信微信验证桥接（**最少业务改造潜力，但受支持会话签发尚未证明**）。必需成本：现有服务额度内无新增订阅；微信主体认证/域名/备案/上线资质 `待官方核验`；可能的后端 Edge 调用量需监控。阈值：Supabase 免费额度/微信 API 限额，须以账户实际套餐核对。
- 方案二：自建 OIDC IdP + Supabase Third-Party Auth（官方有超额 Third-Party MAU 单价 $0.00325/MAU，但免费配额、项目实际可用性及运营成本仍需逐项确认）。新增 issuer/JWKS、密钥轮换、授权规则、监控；**非最低维护成本默认方案**。
- 方案三：完全自建认证 BFF，避免依赖 Supabase Auth 会话发行但须维护独立鉴权、RLS 接入/服务端代理、审计与故障恢复；在现有小团队下运维成本更高，暂不推荐。
- **零元可行 PoC**：本地 mock 微信 code 与原有 Auth/Profile 解析、RLS 契约测试、状态机单测；不使用短信、付费地图或第三方身份 SaaS。
- **必须延后到确认后才可能支出**：小程序注册/认证、合法域名/备案、微信内网页授权/PC 网站应用资质、商业化托管套餐、第三方短信/身份服务、真实 POI 付费额度。所有未知价格继续标 `待官方核验`，不推定免费。

## 8. 来源与只读证据（2026-10-21）

**GitHub 现行源码**：
- https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/39e17febc23d5732c867bb2244a02fd2d99e36a8/supabase/migrations/20260829075002_support_test_auth_aliases.sql
- https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/39e17febc23d5732c867bb2244a02fd2d99e36a8/supabase/functions/test-identity-exchange/index.ts
- https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/39e17febc23d5732c867bb2244a02fd2d99e36a8/src/hooks/Auth.tsx
- https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/39e17febc23d5732c867bb2244a02fd2d99e36a8/supabase/migrations/20261011204000_v8_platform_admin_self_role.sql

**Supabase 官方（本轮已读取）**：
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/auth/third-party/custom-oidc
- https://supabase.com/docs/guides/auth/third-party/overview
- https://supabase.com/docs/guides/auth/auth-identity-linking
- https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- https://supabase.com/docs/guides/auth/identities
- https://supabase.com/docs/reference/javascript/auth

**Supabase 测试库只读查询**：`information_schema.columns`、`pg_proc`/`pg_get_functiondef`、`pg_policies`、`pg_constraint` 与计数聚合，2026-10-21；不记录私有行/用户标识。微信 `wx.login`/`code2Session` 官方原文与微信资质实际费用仍需在可访问的微信官方渠道复核，不将第三方转载当确认。

## 9. 消费与验证计划

1. 主 Chat 读取此 handoff 与两个已消费研究文档，核对最新 HEAD（可能已被地图专项继续推进），确认与现有设计文档不重复。
2. 仅在用户授权的写入范围内将 **设计文档补丁** 批量落仓库；不得在本轮自动实施 SQL、Edge、登录页或管理员变更。
3. 若用户授权实际开发，先在测试环境设计独立最小迁移与安全验收，特别是 `complete_profile` 昵称别名漏洞与 Profile RLS；安全审核通过后再考虑发布。
4. 本文件只在 Chat 核实落地、对账后方可移至 `consumed`；不因它暂时未消费而重复研究。

**下一轮建议**：聚焦“跨端登录/恢复 UX 与账号绑定冲突交互 + API 错误码/失败恢复矩阵”，不要再重复身份原则；微信官方资质价格与真实 AppID 仍需核验。当前尚不能宣布 DESIGN_COMPLETE_CANDIDATE，因会话桥接及主体/域名合规为真实阻断。

HANDOFF_STORAGE_STATUS=ARCHIVED_AFTER_GITHUB_READBACK