> 设计研究文档 · 本文记录研究证据与候选方案，不代表代码已实现、费用已批准或正式上线。
> 来源：微信到 Supabase Auth 会话桥接的验证门槛；2026-10-21—22 的原始 Handoff，基线 HEAD 39e17fe。
> 状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL；用户尚未批准开发、数据库迁移或付费。

# 球搭子｜小程序 × H5 统一身份：零新增订阅成本的会话桥接可行性与 PoC 决策门槛（第五轮增量）

STATUS=DESIGN_EVIDENCE_CONSUMED  
HANDOFF_ID=QD-MP-20261021-1511-ZERO-COST-BRIDGE-GATES  
RESEARCH_TOPIC=正式微信登录到 Supabase Auth 会话的可信桥接；零成本 PoC；最小 TCO 与技术验收  
RESEARCH_DATE=2026-10-21 (Asia/Shanghai)  
BASE_REPO=rmit-s3674091-Yating-Li/-qiudazi-h5  
BASE_BRANCH=feature/v8-confirmed-20261011  
BASE_SHA=39e17febc23d5732c867bb2244a02fd2d99e36a8  
PR=Draft #26  
RESEARCH_MODE=READ_ONLY_GITHUB_SUPABASE_OFFICIAL_SOURCES  
PERSISTENCE_SCOPE=ONLY_LIBRARY_HANDOFF  
NO_PRODUCT_CODE_OR_DATABASE_OR_DEPLOYMENT_CHANGES=true  
SUGGESTED_TARGET_FILES=docs/research/miniprogram/identity-architecture.md; docs/research/miniprogram/wechat-login-options.md; docs/research/miniprogram/miniprogram-implementation-prd.md; docs/research/miniprogram/official-sources.md; docs/research/miniprogram/handoff.md  

## 0. 本轮相对已有成果的净新增

已读取此前 Library 两份未消费 handoff：`20261021-0904_miniprogram-alias-rls-auth-bridge-audit_39e17fe.md` 和 `20261021-1212_miniprogram-cross-platform-binding-recovery-contract_39e17fe.md`；以及仓库既有 `docs/research/miniprogram/identity-architecture-and-cost.md`、`framework-reuse-matrix.md`。前轮已定义跨端入口、身份绑定状态机、Profile/alias/RLS 风险及 Taro 优先候选，本轮**不重新写这些结论**。

本轮新增三项有官方依据的判断：

1. **Supabase Auth Hook 不能代替登录入口**。官方 `Custom Access Token Hook` 在 Auth **签发 token 之前**修改 claims；它不能凭 `wx.login` code 为尚未登录的微信主体直接创建 Supabase refreshable session。将“免费 Auth Hook”列为微信登录捷径属于错误架构。官方支持 Free/Pro 配置 Hook，但这不是会话签发 API。
2. **Supabase 自身的 OAuth 2.1 Server 与 Custom OAuth Provider 方向相反**。OAuth 2.1 Server 让 Supabase 给其他应用/客户端发 OAuth token，不能将微信小程序 `code2Session` 自动转成 Supabase Auth 登录；Custom OAuth/OIDC Provider 需要标准 OAuth redirect / token / userinfo 或 OIDC discovery/JWKS，微信小程序 code 并不自动满足该契约。`signInWithIdToken` 也需要受支持 IdP 的 ID token，微信 `code2Session` 返回的 OpenID/session_key 不是该 token。
3. **第三方认证的免费额度现在可以用官方数字而不是笼统猜测**：Supabase 官方 2026-10-21 查阅的账单文档列 Free Third-Party MAU 50,000、Pro 100,000 后 $0.00325/MAU；但这只是 Supabase 计费维度，**不代表自建 OIDC issuer、微信资质、合规域名或跨端旧账号兼容免费**。同理 Free Edge 500,000 invocations、Free Auth MAU 50,000；超额不是“自动无限免费”。

结论：**仍未找到经官方证明、可把任意已验证微信小程序 code 一步兑换为 Supabase Auth 原生可刷新 session 的通用托管 API**。现有 `generateLink`→`verifyOtp` 是需要严格受控验证的候选机制，不能宣称正式方案已解决。

## 1. 只读基线与现有系统约束

- GitHub PR #26 仍 Draft，最新 HEAD `39e17fe`；`docs/V8_CONFIRMED_SCOPE.md` 仍确认五项，微信小程序为**正式产品设计目标**，但不自动成为当前 V8 第六项开发；P3 地图专项继续独立。
- 现有 H5：`src/hooks/Auth.tsx` 使用 Supabase Session，`loginByNickname()` 依赖 `test-identity-exchange` + `verifyOtp()`；`src/domain/AuthAccountGeneration.ts` 提供防跨账号异步污染基础。
- 现有测试 Edge `supabase/functions/test-identity-exchange/index.ts` 用 service-role 查昵称，`admin.generateLink({type:'magiclink',email})` 后将 `hashed_token` 返回给客户端。**这只能作为现存测试流程证据，不能当作生产微信身份认证设计**。token hash 在这里是可兑换的 bearer credential；“哈希”不等于无敏感性。
- `20260829075002_support_test_auth_aliases.sql` 的 `complete_profile()` 在昵称命中已完成 Profile 时，存在把新 Auth ID 关联到旧 Profile 的路径；正式登录前必须同步关闭该自动关联，不仅删除前端昵称入口。
- `public.current_profile_id()` / `ensure_profile()` 可解析 alias，但前轮审计指出 `profiles_self_read` 与 RPC 读取规则可能不一致；须先做正反例 RLS 测试。`platform_admin_my_role()` 仍按 JWT `auth.uid()` 直接查询 `platform_ops.admin_members.auth_user_id`，不因 Profile alias 继承管理员权限。
- Supabase 测试项目 `rtmjzmgrhifjzxaliltm` 的 migration list 已只读核对，末尾为 `v8_platform_admin_audit_foundation`、`v8_platform_admin_self_role`；不将 GitHub 中尚未应用的迁移视为已执行。未写入 SQL。

## 2. 四条可行路线的“会话究竟是谁签发”对照

| 路线 | 验证微信主体 | 颁发给小程序的凭据 | 与现有 Supabase Auth/RLS 的关系 | 新增持续费用/TCO | 当前结论 |
|---|---|---|---|---|---|
| A. 微信后端校验 + **受控 Auth Admin OTP 交换 PoC** | 后端 `code2Session`，按 AppID+OpenID 唯一查私有绑定 | **必须**经 Supabase Auth `verifyOtp` 真正产生 Session/JWT/refresh token，不能自行伪造 | 理论上最大化复用既有 Supabase Auth、`auth.uid()`、RLS、Storage/Realtime；需要证明旧 Auth UUID/alias 一致性 | 现有 Supabase Edge/Auth 免费配额内可能无新增订阅；开发、安全测试/维护非零；微信资质/域名待官方核验 | **PoC 优先，未批准生产**；绝不可照抄按昵称返回 token_hash 的测试 Edge |
| B. 标准 OAuth2/OIDC IdP + Supabase Custom OAuth Provider | 自建可信 IdP 先验证微信，提供标准 authorize/token/userinfo 或 discovery/JWKS | Supabase 标准 OAuth 登录后发行 Auth session | 能保留 Supabase Auth，但需真正符合 OAuth 浏览器/小程序交互和身份绑定规范 | Free 最多 3 个 custom providers；自建 issuer、证书、回调/域名/维护有成本 | 备选；**wx.login code 不是直接可填的 OAuth token** |
| C. 自建 OIDC issuer + Supabase Third-Party Auth | 自建 issuer 验微信后签发非对称 JWT | **外部 issuer 的 JWT**，不是 Supabase Auth 原生 refresh token | Supabase Data/Storage/Realtime 可在配置后验证外部 JWT，但 `auth.uid()`/`auth.users` FK/Admin actor/旧 Auth 映射需单独适配 | Supabase Third-Party MAU Free 50k；自建 issuer 的安全运营/密钥轮换/域名成本非零 | 不作为低维护 MVP 默认；不是 A 的等价替换 |
| D. 自建 BFF Session、所有写操作走代理 | 后端验微信并自行维护会话 | BFF cookie/token | 需证明每条 RPC、Storage、Realtime、Admin 的 server-side actor、最小权限和审计；不可把 service_role 下放客户端 | 高维护工时/请求流量/运维成本；免费基础额度并不降低安全责任 | 最后兜底，不作为省钱捷径 |

**明确排除的伪方案**：`wx.login` code 直接传给 `signInWithOAuth` 或 `signInWithIdToken`；拿 OpenID/UnionID/昵称当 JWT `sub`；`Custom Access Token Hook` 当登录签发器；小程序打包 Supabase service-role 或微信 AppSecret；直接签自制 Supabase JWT 规避 Auth refresh/revocation；将已有旧 Profile 自动匹配到相同昵称的新用户。

### 2.1 A 路线必须面对的具体风险，不得以“项目里已经这样做过”跳过

- **账号绑定先于 token 兑换**：后端必须先验证微信临时 code、AppID、OpenID、唯一绑定和旧账号控制权；未经绑定的微信主体不得换取任何旧 Auth 用户的 magiclink/OTP。
- **`generateLink` 面向 email 语义**：官方文档说明它生成 email links/OTP，**不是官方专用的“微信会话签发 API”**。现有 Auth 用户的真实邮箱或合成邮箱如何映射、如何防止邮箱控制权混淆、是否可能被其他 email 登录路径触发、能否在不触发发送邮件的情况下稳定完成服务端受控兑换，必须在隔离测试用户上证明。不得为旧账号擅自替换邮箱。
- **可兑换材料即凭据**：`hashed_token` 虽名为 hash，仍可用于 `verifyOtp`。优先研究在可信后端完成一次性 OTP 验证并只向已验证、绑定请求返回短期安全 Session；若必须客户端 `verifyOtp`，要额外证明一次性短期 challenge 与微信主体/设备/nonce 的关联、防重放、防截获、防并发。两种方式都需要严格 HTTPS、敏感响应禁止缓存/日志、会话撤销和刷新测试。
- **不可“免密登录任意旧用户”**：服务端对目标 Auth UUID 的解析必须来自已验证且已绑定的外部身份，不允许客户端提交 `auth_user_id`、`profile_id`、邮箱或昵称决定登录目标。Admin 授权仍单独核验。
- **服务端 OTP 兑换能否与 GoTrue/SDK 稳定兼容**：官方 `generateLink`、`verifyOtp` 分别存在，但其串联为自定义微信身份桥接的**产品级支持与风险边界尚无官方保证**。如 PoC 失败，回到 B/C 方案评审，不放宽鉴权。

## 3. 可交给交互式 Chat 批量实施的“零新增外部费用 PoC”测试包（本轮不执行）

### Gate 0：本地离线、无密钥、无网络、无 DB 写入（可立即批准为设计验证）

输入为固定 fixture：`app_id`, `openid`, `unionid|null`, `request_id`, `nonce`, `old_auth_id`, `profile_id`, `binding_status`（全部模拟标识）。实现平台无关的 `IdentityResolverPort`、`SessionBridgePort` mock、`BindingChallenge` 状态机及错误码；不调用真实微信、Supabase 管理 API 或付费服务。

验收：

1. 相同 `(provider,app_id,openid)` 两次请求 → 同一绑定、幂等，无重复 Profile。
2. 相同 `request_id` 不同 nonce/actor → 409，拒绝，不泄露目标 Profile。
3. 不同 AppID、相同 openid 文本 → 不碰撞；UnionID 缺失/重复不自动合并。
4. 未绑定微信身份 → 仅 `UNBOUND_IDENTITY`；不得返回 Supabase token。
5. 旧 H5 已认证 Auth 与旧 Profile 关系一致才能进入绑定确认；G/老郑均用匿名化 fixture，不按昵称定位。
6. 新昵称碰撞旧 Profile → `CONFLICT_LOCKED` 或新 Profile 流程，绝不借用旧 Profile。
7. 管理员权限只从已验证 Auth UUID 与 `admin_members` 读取，不能由 Profile alias 推断。
8. A→B→A 的异步响应/缓存/离线记分回放全部校验 `actor_generation`。
9. 过期 challenge、已消费 challenge、重复微信 code → 失败关闭。
10. 敏感日志快照中不得包含 code、session_key、token_hash、refresh token、AppSecret、原始 OpenID。

**Gate 0 证明的是协议状态机与业务不变量，不证明微信或 Supabase 会话真正可兑换。**

### Gate 1：仅未来用户单独授权后，在隔离测试账号/测试环境进行真实 Supabase Auth PoC

1. 使用**专用隔离测试 Auth 用户**（不得是 G/老郑、管理员或真实参赛用户），准备可信绑定映射 fixture；备份/清理策略先审查。
2. 对比官方 `admin.generateLink`→`verifyOtp` 在服务端兑换 vs 客户端一次性交换的实际响应，验证 `getUser`、`getClaims`、`auth.uid()`、refresh token 轮换、退出/撤销、session 多端隔离。严格审查邮箱语义与是否产生意外邮件。
3. 逐条测 `ensure_profile()`、直接 `profiles` SELECT、记分 RPC、相册 Storage、Realtime、管理员拒绝；尤其旧 alias Auth 和原 Auth 同 Profile 的可见性，防止仅 RPC 成功而 RLS 失败。
4. 模拟并发同微信身份绑定两旧账号、重复 OTP、不同浏览器/设备兑换、弱网重试、旧 session 失效、异常回滚；核验唯一约束、审计和无越权。
5. 收集 GoTrue SDK/服务端调用的成功/失败码、最小脱敏日志与可复现测试脚本；失败不得切到 `service_role` 客户端绕过。

**Gate 1 的 pass 定义**：实际拿到由 Supabase Auth 签发的 JWT + 可轮换 refresh token；用 `getUser` 验证 subject 与绑定 Auth UUID；业务 RLS/Edge/Storage 全绿；失败重试/撤销/冲突安全；不依赖昵称或客户端指定主体。仅 API 能返回 token 不构成 pass。

### Gate 2：仅未来用户单独授权、具备真实微信资质和合法域名后进行小程序真机闭环

`wx.login`→后端 code2Session→私有身份绑定→经 Gate 1 证明的 Supabase Auth session 交换→`GET /identity/me`→赛事只读→加入赛事/参赛记分→退出/跨端恢复。iOS/Android、中国真实网络、合法 request/upload/socket 域名、AppID/UnionID 可空、微信 API 限流/失效均需真机验证。不能用开发工具关闭域名校验冒充通过。

## 4. 建议 API 契约新增“桥接完成证明”字段（仅设计）

- `POST /identity/wechat-mini/exchange`: `{login_code, request_id, client_nonce}` → `{status, correlation_id, next_action, expires_at}`；`WECHAT_VERIFIED`/`BOUND_AUTH_FOUND` 不是登录成功。成功状态必须有服务端可信 `auth_user_id` 解析，**但不把 Auth UUID 当作客户端可选输入**。
- `POST /identity/session/complete`（候选；仅 Gate 1 pass 后确定实现）：由可信服务器消费短期一次性 proof，返回 Supabase Auth 支持的会话结果。必须先完成 proof 绑定、签发/兑换及验证；如选择服务端兑换，token 响应标记 `Cache-Control: no-store`、严格来源控制、TLS，不记日志；如客户端兑换，需单独审查 bearer token hash 暴露风险。
- `GET /identity/me`: 仅基于有效 JWT 解析可信 Auth、Profile、capabilities；不得从客户端 nickname/unionid 推导管理员权限。
- 错误状态：`SESSION_BRIDGE_UNSUPPORTED`, `OTP_EXCHANGE_FAILED`, `AUTH_SUBJECT_MISMATCH`, `PROFILE_ALIAS_VISIBILITY_MISMATCH`, `TOKEN_REPLAY_REJECTED`, `ADMIN_AUTH_NOT_GRANTED`。每个状态须有自动化反例测试。

## 5. 最低总拥有成本：2026-10-21 官方证据与触发条件

| 资源 | 官方可核实的当前免费额度/单价 | 本项目成本边界/触发条件 | 零元替代或延期 |
|---|---|---|---|
| Supabase Auth | Free 50,000 MAU；Pro 100,000 后 $0.00325/MAU | 真实微信绑定复用同一 Auth，避免人为重复计 MAU；超限、套餐及具体账单须查看实际项目 | Gate 0 纯 mock；先用现有测试项目，不能自行升级 |
| Supabase Third-Party Auth | Free 50,000 Third-Party MAU；Pro 100,000 后 $0.00325/MAU | 仅适用于真正接入第三方 OIDC JWT 方案；不能把免费 MAU 当作“微信直接受支持” | 首选先测保留原 Auth 的 A；延后自建 issuer |
| Supabase Edge | Free 500,000 invocations；Pro 2,000,000 后 $2/1,000,000 invocations（按包计） | `code2Session` 交换与绑定/恢复 API 增加调用；失败请求也计入调用，OPTIONS 不计 | 合并必要交互、限流、缓存非敏感配置；Gate 0 不调用 |
| Supabase DB/Storage/Realtime/egress | Free DB 500 MB、Storage 1 GB、Realtime 2m messages、200 peak connections、egress 5 GB | 相册、图片/视频、记分实时广播可能比登录先碰到上限；超额价格/计划以官方账单页与实际项目核对 | 先共享现有数据与规则，图片压缩/访问控制；不新增第三方媒体 SaaS |
| Supabase Custom OAuth Provider | Free 最多 3 个 custom providers | 额度不解决微信小程序协议不匹配和 IdP 维护 | 暂不创建 issuer/provider |
| Vercel Hobby | 官方仅允许非商业个人用途 | 商业化/盈利运营必须重新选合法托管方案或付费；不能将 Hobby 作为正式商业免费基础设施 | 当前个人非商业 PoC 复用；商业部署前另作 TCO 决策 |
| 微信主体/认证/备案/AppID/域名 | **待微信官方后台核验**（本轮微信开发者站点原文不可稳定读取） | 正式真机上线前的可能必需支出；不能用第三方流传的 300 元/30 元代替适用主体报价 | 仅离线 mock PoC；不注册、不认证、不购买 |
| 公众号 OAuth / PC 扫码 / SMS / POI | **待官方核验** | 并非小程序 P0 的必要购买；独立 AppID/主体/回调与域名成本 | 首版保留 H5，采用合法可用的既有恢复渠道；不承诺昵称免密找回 |

说明：官方“Free”额度不等于当前账户余量；免费计划超限可能限流/暂停而不是自动免费扩容。开发、测试、人工账号恢复、安全审计和双端维护的人力时间均计入 TCO。**任何新套餐、认证、计费或域名购买均须用户先授权**。

## 6. 最小里程碑与“停止研究”的判定

- M0（0 新增外部订阅）：Chat 消费此前 handoff + 本轮决策矩阵，完成正式设计文档归一；编制 Gate 0 纯 TS/mock 测试清单。估算 0.5–1.5 人日，仅设计与脚本准备，非已执行。
- M1（0 新增外部订阅、但需用户另行授权代码实验）：Gate 0 通过；生成可重复执行的 mock 状态机、actor 隔离、绑定冲突与测试报告。估算 1–3 人日。
- M2（仍可争取在既有免费测试配额内，但必须先授权测试环境写入）：Gate 1 验证是否有可安全使用的 Supabase Auth 会话桥接；同时验证 RLS/alias/Admin 拒绝。估算 2–5 人日；失败则停止 A 路线，评估 B/C 的维护成本。
- M3（资质/域名费用待官方核验，需用户另行批准）：小程序合法域名、真实 wx.login/code2Session、真机测试及 P1 最小赛事闭环。估算依赖微信主体与基础设施，不写虚假工期承诺。

`DESIGN_COMPLETE_CANDIDATE` 的必要条件：五入口产品边界、小程序 P0/P1/P2、身份模型、三种以上登录候选比较、G/老郑迁移、API/安全验收、最低 TCO/官方来源、未决清单均已形成可审核文档。**会话桥接未被真实证明不阻止形成设计候选，但必须作为实现/发布硬 blocker；不能把设计候选等同于已实现微信登录。** 当前仍保留 `SESSION_BRIDGE_UNPROVEN`，本轮不自动宣告设计完成。

## 7. 给主 Chat 的文档级 PATCH_PACKAGE（只建议，不自动写 GitHub）

PATCH_PACKAGE_ID=QD-MP-PATCH-20261021-1511  
PATCH_TYPE=DOCS_ONLY_PROPOSAL  
PATCH_STATUS=DESIGN_EVIDENCE_CONSUMED

- `identity-architecture.md`：加入第 2 节路线 A/B/C/D 的**token issuer / refresh / RLS**差异，明确 Hook/OAuth Server/ID Token 的适用边界；加入第 2.1 节 OTP 交换高风险条件。
- `wechat-login-options.md`：增加「小程序 code2Session≠OAuth2/OIDC/ID token」证据和候选方案优先级；不得宣称 Supabase 官方原生支持微信小程序一键登录。
- `miniprogram-implementation-prd.md`：把 Gate 0/1/2 的正反例验收、`SESSION_BRIDGE_UNSUPPORTED` 错误、会话证明和安全阻断纳入实施验收矩阵。
- `official-sources.md`：录入第 8 节官方来源、核验日期、价格适用范围、无法核实的微信主体费用与域名要求。
- `handoff.md`：标明这轮新增内容，合并此前两份 handoff 时去重；设计阶段不修改 `docs/V8_CONFIRMED_SCOPE.md` 五项、不动地图 P3。

**消费计划**：交互式主 Chat 在最新远端 HEAD 读取本文件 + 既有两份未消费 handoff，按主题去重、审查安全/成本/测试门槛；经用户授权后低频批量写**设计文档**；开发/迁移/测试环境写入另行授权；成功核对目标文档与提交后再移动对应 handoff 至 consumed。当前任务不自行归档。

**风险/依赖/决策点**：
- BLOCKER `SESSION_BRIDGE_UNPROVEN`: 托管 Auth 正式会话签发的支持性和安全性尚未端到端证明。
- BLOCKER `RLS_ALIAS_COMPATIBILITY_GATE`: `profiles` 直接 SELECT 与 alias RPC 行为需真实测试。
- BLOCKER `TEST_NICKNAME_RETIREMENT_GATE`: 前端 + Edge + `complete_profile` 自动 alias 必须同批处理。
- BLOCKER `WECHAT_QUALIFICATION_AND_DOMAIN_GATE`: 主体、备案、认证、合法域名和中国真机可达性待核验。
- SEPARATE `ADMIN_AUTH_GATE`: G 的后台权限不可用根因未查明，不可归因微信登录；管理员授权仍按 Auth UUID 独立审计。
- 用户未来需确认：是否已有小程序主体/AppID、是否商业化、是否已有合规域名、能否使用旧 H5 已登录会话主动绑定、是否授权隔离测试环境 PoC。**本轮不请求互动，不执行购买/配置/开发**。

## 8. 证据与官方来源（2026-10-21 查阅）

**项目只读源码**
- PR #26 / exact branch: https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/tree/39e17febc23d5732c867bb2244a02fd2d99e36a8
- V8 五项范围: https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/39e17febc23d5732c867bb2244a02fd2d99e36a8/docs/V8_CONFIRMED_SCOPE.md
- 昵称测试身份交换: https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/39e17febc23d5732c867bb2244a02fd2d99e36a8/supabase/functions/test-identity-exchange/index.ts
- 自动 alias 路径: https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/39e17febc23d5732c867bb2244a02fd2d99e36a8/supabase/migrations/20260829075002_support_test_auth_aliases.sql
- Admin 自身角色: https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/39e17febc23d5732c867bb2244a02fd2d99e36a8/supabase/migrations/20261011204000_v8_platform_admin_self_role.sql

**官方产品文档**
- Supabase Auth Hooks / Free 支持与作用: https://supabase.com/docs/guides/auth/auth-hooks
- Supabase Custom Access Token Hook: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- Supabase Custom OAuth/OIDC Providers / Free 3 个: https://supabase.com/docs/guides/auth/custom-oauth-providers
- Supabase OAuth 2.1 Server（不是微信身份导入器）: https://supabase.com/docs/guides/auth/oauth-server
- Supabase signInWithIdToken: https://supabase.com/docs/reference/javascript/auth-signinwithidtoken
- Supabase Auth Admin generateLink: https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- Supabase verifyOtp: https://supabase.com/docs/reference/javascript/auth-verifyotp
- Supabase Third-Party Auth 的 issuer/JWKS 限制: https://supabase.com/docs/guides/auth/third-party/overview
- Supabase Third-Party MAU 免费额度/单价: https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users-third-party
- Supabase Edge 免费额度/单价: https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations
- Supabase 计费总表（DB/Storage/Realtime/egress）: https://supabase.com/docs/guides/platform/billing-on-supabase
- Vercel Hobby 官方非商业使用限制: https://vercel.com/docs/limits/fair-use-guidelines
- 微信开发者官方登录文档候选（访问不可稳定核验，**不得标已核实**）: https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html ; https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html

## 9. 结束状态

STATUS=DESIGN_EVIDENCE_CONSUMED。第五轮已形成新证据、可消费的文档级 PATCH_PACKAGE 与严格分层的 0 元 PoC/授权门槛；**没有**执行任何产品代码修改、数据库迁移、RPC/Edge 写入、部署、微信注册、付费、merge 或 P3 地图任务调整。是否已上传 Library 以实际回执为准，不在文件内预先宣称成功。