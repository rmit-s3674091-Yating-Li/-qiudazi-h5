> 设计研究文档 · 本文记录研究证据与候选方案，不代表代码已实现、费用已批准或正式上线。
> 来源：账号绑定、冲突恢复与跨端会话隔离；2026-10-21—22 的原始 Handoff，基线 HEAD 39e17fe。
> 状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL；用户尚未批准开发、数据库迁移或付费。

# 球搭子｜小程序 × H5：跨端账号绑定、冲突恢复与会话隔离契约（第四轮增量）

STATUS=DESIGN_EVIDENCE_CONSUMED  
HANDOFF_ID=QD-MP-20261021-1212-BIND-RECOVERY  
PATCH_PACKAGE_ID=QD-MP-DOCS-20261021-1212-BIND-RECOVERY  
RESEARCH_TOPIC=微信小程序/H5跨端登录、已有账号主动绑定、冲突恢复、前端状态机、API错误码及安全验收  
BASE_REPO=rmit-s3674091-Yating-Li/-qiudazi-h5  
BASE_BRANCH=feature/v8-confirmed-20261011  
BASE_SHA=39e17febc23d5732c867bb2244a02fd2d99e36a8  
BASE_PR=Draft #26（仍为 V8 五项开发；小程序仅研究）  
BASE_READ_AT=2026-10-21 12:12 Asia/Shanghai  
WRITE_BOUNDARY=定时研究只读 GitHub/官方资料；本文件仅 Library handoff；不修改 GitHub、Supabase、Vercel、微信配置、自动化或 P3 验收  
SUGGESTED_TARGET_FILES=docs/research/miniprogram/identity-architecture.md; docs/research/miniprogram/wechat-login-options.md; docs/research/miniprogram/legacy-user-migration.md; docs/research/miniprogram/miniprogram-implementation-prd.md; docs/research/miniprogram/official-sources.md; docs/research/miniprogram/handoff.md  
DELIVERY_TYPE=DOCS_ONLY_PATCH_PACKAGE; NO_EXECUTABLE_MIGRATION; NO_LOGIN_IMPLEMENTATION

## 0. 与已有研究的差异

已复用仓库 `docs/research/miniprogram/identity-architecture-and-cost.md`（首轮）、`framework-reuse-matrix.md`（第二轮），以及 Library 中 `20261021-0904_miniprogram-alias-rls-auth-bridge-audit_39e17fe.md`（第三轮，仍待 Chat 消费）。不重复 Taro 框架选型、`wx.login`/`code2Session` 概念、alias RLS 风险与 Admin UUID 独立授权结论。本轮输出的是**可交给产品/开发/安全共同验收的具体交互、协议、失败恢复规则**。实时 HEAD 与第三轮相同；本轮没有发生远端产品变更。

新增源码核对：
- `src/hooks/Auth.tsx`：`start()` 允许 guest-session 创建测试凭据；`loginByNickname()` 经 `test-identity-exchange` 和 `verifyOtp()`；登录异步响应已有 `AuthAccountGeneration` 与 `NicknameLoginAttempt` 防旧响应覆盖机制；`observeSession()` 在 **Auth UUID** 改变时清查询缓存、Profile 缓存。
- `src/domain/IdentitySession.ts`：`PROFILE_CACHE_KEY` 与 `GUEST_CREDENTIALS_KEY`、`LOGIN_REQUIRED_KEY` 存在浏览器 `localStorage`；`clearIdentityClientStorage` 清除特定前缀，但不等同于清理小程序端持久化 Storage/离线请求队列。
- `src/domain/AuthAccountGeneration.ts`：基于 Auth UUID + generation，JWT 同主体刷新不改变 generation；小程序跨端不能直接复用 Web Storage，必须保留同等防串号语义。
- `src/pages/LoginPage.tsx`：登录页仍明确为“测试身份”，并非正式用户恢复机制。
- `src/repositories/supabase.ts`：现有 H5 Supabase Auth `persistSession/autoRefreshToken` 依赖浏览器环境；不可直接假设小程序 SDK 和本地 Storage、WebSocket 可运行。
- `docs/V8_CONFIRMED_SCOPE.md`：当前仍是五项确认开发；V8 地图 P3 独立进行，禁止以小程序适配为由更改其代码/验收。

**新增决策建议**：正式跨端身份上线应采用“显式绑定、先验旧会话、双端不自动合并、冲突失败关闭”作为 MVP 的统一交互语义。只有 `code2Session` 成功、但 Supabase 会话桥接尚未得到官方支持性验证时，不显示“登录成功”。

## 1. 五类入口的最小登录/恢复 UX（产品可直接写 PRD）

| 入口 | 首次访问 | 已有账号恢复 | 绑定前置条件 | MVP 约束 |
|---|---|---|---|---|
| 微信小程序 | 展示赛事只读内容（以现有匿名读权限为准）；点击报名/记分等受限动作才引导微信登录 | 已绑定微信身份经服务端验证恢复原 Profile；未绑定的显示“已有球搭子账号？先绑定” | 旧 Auth session 或受控人工核验；不可仅填昵称 | `wx.login` 不等于业务会话；失败可回到只读入口 |
| 微信内 H5 | 维持 H5 功能与邀请链接；不要假设小程序 AppID 可用于公众号网页授权 | 若存在受支持 H5 正式登录渠道，独立完成认证；可从小程序分享进入但不得自动共享 token | 经验证的双方凭据/同一已登录旧账号 | 未获公众号资质前不假设网页授权可用 |
| 微信外手机 H5 | 保留可访问邀请/赛事页 | 使用经过验证的现有 Auth 登录/恢复方式；正式方案未定时标记阻断 | 旧 Auth session/经验证恢复 | 不强迫安装微信或付费短信 |
| PC H5 | 保留后台和赛事管理 | 原有正式认证方式或未来已获资质的网站扫码；不可把小程序 code 用于 PC 网页 | 已验证当前 Auth 主体 | Admin 继续只在 H5，单独授权 |
| 小程序 ↔ H5 切换 | 分享链接只承载赛事/邀请引用，不携带 access/refresh token | 新端分别完成身份认证后通过同一稳定 Profile 查历史记录 | 绑定前必须证明对旧 Profile 的控制权 | 不因昵称/头像/UnionID 相似自动合并 |

**关键 UX 文案状态**：`未登录` → `正在验证微信身份` → `正在确认球搭子账号` → `进入赛事`；对于未绑定旧账号，必须显示“新建账号”和“绑定已有账号”两条**明确且可撤销**的路径，默认不替用户选择。存在历史冲突时显示“账号需要核验；现有赛事和照片不会删除”，而非“系统已自动合并”。

## 2. 绑定/恢复状态机（不得用 UI 文案替代服务器事实）

- `ANONYMOUS`: 无可信 Supabase session；仅允许当前业务公开读权限。
- `WECHAT_CODE_PENDING`: 客户端调用 `wx.login()` 并把短期 code 交给可信后端；不记录 code、`session_key` 到日志。
- `WECHAT_VERIFIED`: 后端 code2Session 成功且校验 app_id、provider_subject；**仍未登录 Supabase**。
- `BOUND_AUTH_FOUND`: `(provider,app_id,openid)` 找到唯一有效绑定，准备受支持的会话桥接；失败转 `SESSION_BRIDGE_UNSUPPORTED`。
- `UNBOUND_IDENTITY`: 未绑定；展示 `CREATE_NEW` / `BIND_EXISTING`，**不自动创建可写入历史数据的 Profile**。
- `OLD_SESSION_PROOF_PENDING`: 已登录的旧 H5 会话通过服务器 `getUser`/JWT 校验并取可信 `auth.uid()` → `current_profile_id()`；不能用客户端提供的 Profile UUID 替代。
- `BINDING_CONFIRM_PENDING`: 展示拟绑定的账号（最小必要资料）及风险提示，要求明确确认；服务端检查外部身份未被占用、Profile 关系唯一、没有管理员权限越权。
- `BIND_COMMITTED`: 原子提交绑定记录与审计；随后需再次验证 session 和 `current_profile_id()`，才能进入 `ACTIVE`。
- `CONFLICT_LOCKED`: 外部身份已绑定其他 Profile、同一请求不同 actor、旧账号凭据不足、UnionID 暗示多身份、重复昵称、迁移数据异常 → 失败关闭，**禁止后台自动覆盖**。
- `RECOVERY_REVIEW`: 用户主动申请恢复，需受控人工核验并审计；不得以昵称、微信头像、UnionID 单独认定身份。
- `SESSION_BRIDGE_UNSUPPORTED`: 已验微信 code 但未能合法安全创建 Supabase session；不得返回假 token 或开放写权限。
- `SIGNED_OUT`: 当前端撤销会话、清本端 token/私有缓存/待提交写操作；其他设备是否同时登出由明确产品策略决定，不假定跨设备即时撤销。

**原子约束**：在私有绑定表对活动状态 `(provider, app_id, provider_subject)` 唯一；若解绑历史需要保留审计，则以部分唯一索引 + 受控事务/锁实现；绑定必须校验 `auth_user_id ↔ profile_id` 与既有 alias 一致性。`unionid` 允许空，不能作为全局主键。不要将管理员授权合并进绑定事务。

## 3. API 契约草案（非已实现接口）

### 3.1 `POST /identity/wechat-mini/exchange`
请求：`{login_code:string, request_id:uuid, client_nonce:string}`。请求不得携带 `openid/unionid/profile_id/auth_user_id/role`。服务端调用 code2Session 并按 AppID + OpenID 唯一解析。**成功返回值必须分阶段**：`{status:'BOUND_AUTH_FOUND'|'UNBOUND_IDENTITY'|'CONFLICT_LOCKED'|'SESSION_BRIDGE_UNSUPPORTED', correlation_id, next_action, expires_at}`；只有在支持性 PoC 通过后才定义真实 Supabase session 的安全交换载荷。客户端不能把 `BOUND_AUTH_FOUND` 当作“已登录”。

### 3.2 `POST /identity/bind/start`（已认证旧会话）
Authorization: Bearer `<现有 Supabase access JWT>`；body `{provider:'wechat_miniprogram', challenge_id, request_id}`。后端 `getUser(jwt)` 或验证 JWT claims，并以服务端 resolver 取 Profile；校验账号近期重新认证策略（何种强证明仍待 PoC）。返回短期绑定 challenge（不得是可登录 token）。

### 3.3 `POST /identity/bind/confirm`
请求 `{challenge_id, verified_wechat_proof_ref, user_confirmation:true, request_id}`；`verified_wechat_proof_ref` 必须是后端持有的已验证单次微信身份证明引用，**不是客户端自报 OpenID**。同事务检查 challenge 的 Auth UUID、Profile、外部身份、TTL、状态、nonce、已消费标记；写绑定+审计。返回 `{status:'BIND_COMMITTED', profile_ref, correlation_id}`；`profile_ref` 仅用于展示，不作为后续鉴权凭据。需再走独立会话验证关卡。

### 3.4 `POST /identity/recovery/request`
请求只提交最少必要联系/问题描述；返回统一 `RECOVERY_REVIEW`，不暴露“某昵称是否存在”、关联邮箱、旧账号 ID 或管理员身份。恢复结果必须人工受控审计，不能通过客户端 self-service 提交目标 Profile ID 直接换绑。免费恢复渠道可先考虑**已登录旧设备确认**；如果旧设备也不可用，人工核验成本非零，应作为服务承诺与 SLA 决策，不假设可用免费短信。

### 3.5 `GET /identity/me`（会话真实性和 UI 一致性）
由后端基于**经过验证的 JWT**返回 `{auth_session_state, profile_state, profile_display, binding_state, capabilities}`；能力列表由服务端确定，不允许客户端推导管理员角色。若直接表 SELECT 的 alias-aware RLS 尚未修复/统一，先明确仅通过安全 RPC/服务端 resolver 获取 Profile，禁止绕过 RLS。

### 3.6 幂等与错误响应格式
统一 `{error:{code, message_key, correlation_id, retryable}, request_id}`；相同 `request_id` + 相同 actor/nonce/操作在有效期内返回同一逻辑结果；相同 ID 携带不同主体/载荷必须拒绝。日志记录不可逆脱敏关联号，不写 token、`session_key`、openid 原值。重试时服务端判断已提交状态，禁止客户端重复创建 Profile。

## 4. 错误码 × 用户恢复动作 × 安全策略

| code | HTTP 建议 | 前端动作 | 服务端硬边界 |
|---|---:|---|---|
| `WECHAT_CODE_EXPIRED` / `WECHAT_CODE_REPLAYED` | 401/409 | 重新点击登录，重新获取 code；不自动无限重试 | 单次 code、TTL、请求幂等 |
| `WECHAT_UPSTREAM_UNAVAILABLE` | 503 | 保留赛事上下文，稍后重试/继续只读 | 不能将超时当作“新用户” |
| `IDENTITY_UNBOUND` | 200（状态响应） | 明确选择新建或绑定旧号 | 不静默新建重复 Profile |
| `BIND_PROOF_REQUIRED` | 403 | 返回旧账号认证步骤 | 禁止昵称、头像、UnionID 作为证明 |
| `BIND_SUBJECT_CONFLICT` | 409 | 暂停绑定，申请人工恢复 | 不覆盖已有绑定，不泄露被占账号资料 |
| `BIND_REQUEST_MISMATCH` | 409 | 重新开始完整流程 | challenge 必须绑定 actor/nonce/TTL |
| `SESSION_BRIDGE_UNSUPPORTED` | 501/503 | 明确提示“微信身份已验证，但暂无法完成登录”；回只读页 | 不能把 code/session_key 当 JWT |
| `PROFILE_ALIAS_VISIBILITY_MISMATCH` | 409/500 | 不展示别人的 Profile；联系支持 | RPC/SELECT/RLS 契约未统一不得切换 |
| `AUTH_SESSION_EXPIRED` | 401 | 安全刷新或重新认证，保留非敏感草稿 | 不把 `getSession()` 本地 user 对象当服务器权限证据 |
| `ADMIN_AUTH_NOT_GRANTED` | 403 | 展示无管理权限；单独联系管理员 | `admin_members` 仍按可信 Auth UUID 授权，不因 Profile 绑定提升 |
| `ACCOUNT_SWITCH_STALE_RESPONSE` | 客户端状态 | 丢弃旧异步响应并清旧 actor 缓存 | 不允许 A→B→A 竞态污染页面 |

## 5. 多端/弱网/分享与缓存隔离的 12 个验收场景

1. 同一微信身份在小程序反复 `wx.login`，仅一条活动绑定、同一稳定 Profile；不重复创建 players/赛事。
2. 已登录旧 H5 账号发起主动绑定：服务器重新验证旧 JWT、显示绑定确认，用户拒绝时不写任何映射。
3. 微信 OpenID 已绑定 B，A 申请绑定：409 冲突，A/B 业务数据与管理员权限不变。
4. 同昵称、同头像、UnionID 为空或相同线索：绝不触发无证明合并。
5. G、老郑分别从已有受控旧会话绑定，`profiles.id`、赛事/成绩/球搭子/相册数据前后逐项对账；不得通过昵称自动恢复。
6. G 的 Admin 权限在 Auth UUID 切换前后分别用真实 JWT 检验；若权限不可用先独立诊断，不把微信绑定当修复。
7. H5 A 用户登出后登录 B，延迟返回的 A `repository.profile()`、邀请/记分请求不能覆盖 B 页面或缓存。
8. 小程序 A 登出、B 登录时清理 wx Storage 中 A 的 token/私有 Profile/上传草稿/待重放记分队列；保留非敏感 UI 设置。
9. 同一 Profile 的两端刷新 token，refresh token 按各自 session 正确轮换；不把一端 refresh token 复制到另一端。
10. 小程序断网时点击记分，恢复网络后必须先重新认证 actor 并校验 operation idempotency/version；不可将 A 的待发送写操作以 B 的身份发送。
11. 微信分享赛事路径只包含受限且可验证的 event/invite reference；无 access/refresh token、code、session_key、手机号等；私有赛事由后端检查受邀资格。
12. 微信小程序真实设备 iOS/Android + 微信内 H5 + 微信外手机 H5 + PC，分别测首次登录、旧账号绑定、换端恢复、主动退出、过期、权限拒绝与弱网重试。

**特别说明**：现有 `AuthAccountGeneration` 与 `NicknameLoginAttempt` 的竞态保护应提取为平台无关的 session generation 契约；小程序需要额外把 `actor_generation` 写入内存请求上下文，所有异步响应和离线队列回放必须比对当前 Auth UUID、Profile ID、generation。Profile 缓存键不应仅按显示昵称，也不能因为同一 Profile 的两个不同 Auth UUID 就共享未经校验的私有缓存。

## 6. 数据迁移与安全威胁清单（只给设计，不给可执行 SQL）

建议表：`private.external_auth_identities`、`private.identity_binding_challenges`、`private.identity_binding_audit`。挑战表最小字段：`challenge_id`、`initiator_auth_user_id`、`resolved_profile_id`、`provider/app_id`、`subject_digest_or_ref`、`nonce_digest`、`created_at/expires_at/consumed_at`、`request_id`、`status`；原始微信临时 code、`session_key` 不落库。外部标识需要服务端保密、受控查询和密钥轮换策略；不建议仅靠无盐普通 hash 对低熵标识做“脱敏”。

风险：账号接管（昵称命中/自动 alias）、重放与并发双绑、AppID 作用域碰撞、UnionID 缺失、过期旧会话、跨账号 UI 缓存、弱网重放记分、管理员角色错误继承、隐私枚举、服务端日志泄漏、回滚后孤儿映射。每个风险均需要独立 AC；绝不通过开放 `service_role`、自制无签名 JWT、复制 refresh token 或绕过 RLS 来降低成本。

迁移顺序（需要主 Chat 后续明确授权）：schema/RLS 与身份 resolver 设计审查 → 备份及无 PII 的对账基线 → **同时** 处理测试昵称 Edge、`complete_profile()` 自动 alias、前端入口、旧 guest 凭据 → 两个受控旧账号 dry-run → 最小权限双端测试 → 管理员独立授权审查 → 受控灰度 → 回滚演练。旧 Auth ID/历史 Admin audit 不得删除或重写。

## 7. 最低成本与真实可行性边界

- **0 元新增外部服务的可执行 PoC**：纯 TypeScript 状态机 + mock `wx.login`/code2Session + 现有 Auth generation 单测 + API 错误契约 + mock 多端 actor 切换 + 历史关系只读对账设计；不需要购买微信资质/短信/地图 API。开发人力与已有基础设施用量仍是 TCO。
- **最小 TCO 优先候选**：H5 继续使用现有 Supabase Auth/业务 RPC；小程序新增微信身份验证与经过支持性证明的会话桥接；业务 Profile、domain、数据库共用，Platform Admin 保留 H5。**会话桥接尚未证明**，因此不能据此宣布上线费用为零。
- **备选但高维护**：自建 BFF/session 或 OIDC issuer 需额外证明 RLS/Storage/Realtime/管理员鉴权、密钥轮换和可撤销性；仅在低成本桥接不可行后重新核算。
- **可延后**：公众号 H5 OAuth、PC 网站扫码、付费短信找回、商业地图 POI、微信订阅消息、付费第三方身份 SaaS；不是首版小程序的强制购买项。
- **资质/费用未证实**：小程序注册主体/认证、备案、合法域名/国内访问、公众号及开放平台资质/年费、API 额度及超额价格均标 `待官方核验`；不能凭第三方文章或开发工具跳过域名校验就断言正式可用。需要任何注册、升级、购买前必须取得用户确认。
- **运营成本阈值**：正式部署前核对实际 Supabase MAU/DB/Storage/Edge 配额与增长曲线；Vercel Hobby 的非商业使用边界沿用首轮官方核对结论。对无法核实的免费额度/超额价格不填估算数字。

## 8. 本轮官方来源（2026-10-21 阅读）

1. Supabase 官方 Auth `getSession()`：本地存储的 user 数据不可直接作为服务器授权事实；应验证 token / 使用 `getUser()`：https://supabase.com/docs/reference/javascript/auth-getsession
2. Supabase 官方 `getUser()`：向 Auth 服务端查询可信当前用户：https://supabase.com/docs/reference/javascript/auth-getuser
3. Supabase 官方会话：JWT + refresh token、刷新与登出语义、refresh token 一次性轮换：https://supabase.com/docs/guides/auth/sessions
4. Supabase 官方身份绑定：`linkIdentity()` 是受支持 OAuth 身份绑定，不是任意微信 OpenID 映射接口：https://supabase.com/docs/guides/auth/auth-identity-linking
5. Supabase 官方 JS Auth/自定义 Storage：https://supabase.com/docs/reference/javascript/auth
6. 微信官方候选原文（本轮访问失败，**不能标已核验**）：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html 及 https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html。正式上线前需在微信官方开发者文档/控制台人工核验真实主体、资质、域名、接口及费用。
7. GitHub 源码基线： https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/tree/39e17febc23d5732c867bb2244a02fd2d99e36a8 （本轮仅只读）。

## 9. Chat 消费计划、阻断项与决策点

**PATCH A（`identity-architecture.md`）**：纳入第 2/3/6 节状态机、唯一约束、JWT 验证和审计边界；不得直接生成生产 SQL。

**PATCH B（`wechat-login-options.md`）**：加入五入口 UX 与小程序 code 验证≠Supabase session 签发的明确分界；微信内 H5 与 PC 登录方案需分别核验资质。

**PATCH C（`legacy-user-migration.md`）**：加入 G/老郑旧会话证明、前后数据对账、Admin 独立授权、昵称 Edge + RPC 同步退役及回滚门槛。

**PATCH D（`miniprogram-implementation-prd.md`）**：纳入第 4 节错误码、12 项验收、双端弱网/离线队列、邀请路径安全及 0 元 PoC。

**PATCH E（`official-sources.md`、`handoff.md`）**：记录本轮已核实的 Supabase 文档、微信官方原文暂不可访问及未决事项，不覆盖已消费前两轮事实。

**阻断项**：`SESSION_BRIDGE_UNPROVEN`、`RLS_ALIAS_COMPATIBILITY_GATE`、`TEST_NICKNAME_RETIREMENT_GATE`、`WECHAT_QUALIFICATION_AND_DOMAIN_GATE`、`ADMIN_AUTH_SEPARATE_GATE`。这些问题未闭环前，不能称 `DESIGN_COMPLETE_CANDIDATE`，更不能宣称微信登录已实现。

**需用户未来确认，但本轮不提问/不执行**：正式小程序主体及是否已有 AppID；是否必须首发微信内 H5/PC 扫码；已有可验证旧账号恢复渠道；是否商业运营；是否愿意承担人工恢复支持；是否授权在测试环境开展协议 PoC/迁移（与设计研究授权分开）。

**消费步骤**：主 Chat 读取本 handoff 和第三轮未消费 handoff → 重新读取实时 HEAD 与相关治理文件 → 去重合并到指定设计文档（仅用户授权时）→ 记录文件差异/安全验收/成本变化 → 之后才允许将 handoff 移到 `consumed`。本定时任务不移动、不写 GitHub、不修改数据库、不部署、不干扰 V8 P3。

HANDOFF_STORAGE_STATUS=ARCHIVED_AFTER_GITHUB_READBACK