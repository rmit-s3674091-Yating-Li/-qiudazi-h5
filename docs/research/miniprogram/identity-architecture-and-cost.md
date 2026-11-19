> 当前状态校正（2026-10-27）：本文以下为原日期的研究/证据快照，不是当前实施状态。离线 Taro PoC 已落仓且已有 G1 记录；正式身份仍为 SESSION_BRIDGE_UNPROVEN。当前技术决定与状态分层以[实施 PRD](miniprogram-implementation-prd.md)及[融合入口](handoff.md)为准。本文历史“尚未批准 PoC/没有小程序代码”等句不覆盖较新的授权及源码。历史价格、资质与官方线索未在本轮重新核验。

# 球搭子｜小程序 × H5 统一身份体系：首轮架构与最低成本决策 Handoff

HANDOFF_ID=QD-MP-20261021-0305-identity-cost-first-pass
STATUS=DESIGN_RESEARCH_ONLY
CREATED_AT=2026-10-21T03:05:15+08:00
RESEARCH_SCOPE=微信小程序与 H5 统一身份、登录迁移、零新增成本技术验证
BASE_REPO=rmit-s3674091-Yating-Li/-qiudazi-h5
BASE_BRANCH=feature/v8-confirmed-20261011
BASE_SHA=4117b1861eef11ea77fdd38591fefc1b15e726da
PR=Draft #26（open；尚非小程序开发 PR）
WRITE_MODE=RESEARCH_HANDOFF_ONLY; NO_GITHUB_SUPABASE_VERCEL_WECHAT_MUTATION
NEXT_ACTION=交互式主 Chat 读取本 handoff、核对实时 HEAD 和官方资质条件、决定是否将设计成果写入仓库文档；不得未经用户授权开始迁移/发布。
SUGGESTED_TARGET_FILES=docs/research/miniprogram/identity-architecture.md; docs/research/miniprogram/wechat-login-options.md; docs/research/miniprogram/miniprogram-feasibility.md; docs/research/miniprogram/official-sources.md

## 0. 执行结论（决策候选，不是开发确认）

**推荐「保留 H5 + 增加微信小程序客户端 + 共用既有 Supabase 业务后端 + 稳定 `public.profiles.id`」**。小程序端先验证登录/赛事大厅/赛事详情/参赛记分/分享入口等最小闭环；React/TS 的 domain 逻辑尽可能复用，平台 UI、路由、存储、地图和微信 API 不假设直接复用。微信登录的服务端凭据验证是必须项，但微信授权本身不能代替 Supabase JWT/RLS。当前优先完成无账号、无费用的离线/模拟 PoC；真实微信小程序登录需 AppID/合规域名等条件，不能宣称 0 元可上线。

**新的高优先级成本发现：Vercel Hobby 仅限个人、非商业用途。** 现阶段开发/非商业测试可能利用免费额度，但球搭子一旦用于商业目的不能把 Hobby 免费套餐作为长期生产方案。此项是正式商业化前的预算/部署门槛，不应因零成本原则被隐藏。

## 1. 已核对的实时证据

- GitHub 只读读取 live branch ref：`4117b1861eef11ea77fdd38591fefc1b15e726da`。Draft PR #26 open，更新时间 2026-10-20T14:48:19Z。阅读 `docs/V8_CONFIRMED_SCOPE.md`、`docs/V8_CURRENT_STATE.json`、`docs/DOCUMENT_GOVERNANCE.md`、`docs/RELEASE_GOVERNANCE.md`，当前**已确认开发范围仍是 5 项**；小程序是用户明确授权的**研究/设计**，未被自动纳入现有五项代码开发。
- 当前依赖：React 19.2.0、React Router 7.18.3、Vite 8.2.2、TypeScript 5.9.3、`@supabase/supabase-js` 2.112.4。没有发现已经建立的小程序客户端包或微信小程序登录实现。
- `src/pages/LoginPage.tsx`：测试入口仍提供「使用昵称登录」「创建新的测试昵称」。`src/hooks/Auth.tsx`：`loginByNickname()` 依次调用 `test-identity-exchange`、`verifyOtp()`、加载 `repository.profile()`；已经具备部分 generation/异步串号防护，不应在新方案中回退。
- `supabase/functions/test-identity-exchange/index.ts`：按昵称检索账号，服务端生成 magiclink token_hash 并返回，前端 `verifyOtp`。该机制属于**测试便利登录**，正式开放前必须安全退役；不能仅用昵称证明账号所有权。`20260905132100_test_identity_exchange_lookup.sql` 标记 `V7 TEST-ONLY`，RPC 仅允许 service_role 执行；这并不消除前端昵称可触发服务端凭据交换的正式环境风险。
- `20260829075002_support_test_auth_aliases.sql`：`private.profile_auth_aliases(auth_user_id -> profile_id)` 与 `public.current_profile_id()` 允许历史 Auth 身份指向同一稳定 Profile。**因此不能把所有外键简单改为新的微信 OpenID**，迁移要同时审计 Auth ID 和 Profile ID 两种关联。
- `20261011204000_v8_platform_admin_self_role.sql`：`platform_admin_my_role()` 只以 JWT `auth.uid()` 查 `platform_ops.admin_members.auth_user_id`。管理后台与普通业务 Profile 的别名处理逻辑不同，必须单独迁移/回归。现有 G 登录后台失败的运行时根因仍未证明，不能将此事写成「微信登录一定能修复」。
- Supabase 测试项目 `rtmjzmgrhifjzxaliltm` 只读表清单：`public.profiles` 1224 行、`public.players` 1193、`private.profile_nicknames` 1078、`private.profile_auth_aliases` 306、`platform_ops.admin_members` 2。仅为读取时近似计数，**不是待迁移账号的精确去重清单**。
- 测试库 migration list 末尾包含 `v8_platform_admin_audit_foundation` 与 `v8_platform_admin_self_role`，后续多个 V8 管理接口迁移尚未列入已执行记录；不要把管理后台问题与微信登录研究混在同一个变更批次。
- Library `/球搭子/V8/miniprogram-research/` 执行前不存在；本轮将只创建研究 handoff 路径，不触碰其他 V8 handoff 或 P3 地图任务。

## 2. 统一身份模型（草案）

### 2.1 不变量

1. `public.profiles.id` 是业务层稳定用户标识；`auth.users.id` 是认证主体；微信 `openid` 是 AppID 范围内的外部身份标识；`unionid` 在满足微信条件时可能帮助跨应用识别，但不可保证存在。
2. 用户昵称、头像、微信显示名不作为身份凭据，不允许以昵称相同、头像相同自动合并。
3. 任一微信渠道必须由受信服务端验证凭据，再关联到唯一、有效的内部认证主体；前端不可指定或伪造 actor ID。
4. 数据库 RLS、赛事记分和管理员动作继续以可信 JWT 与服务器权限为准；用户资料和登录会话不可混为一谈。
5. 老用户迁移先证明控制权，再绑定；发生冲突时暂停绑定、人工受控恢复；不能用微信新账号直接覆盖 G/老郑历史身份。

### 2.2 建议新增关系（**仅数据设计，不执行 SQL**）

`private.external_auth_identities`（建议）：

- `id` UUID PK
- `auth_user_id` UUID NOT NULL FK `auth.users`（当前认证主体）
- `profile_id` UUID NOT NULL FK `public.profiles`（稳定业务主体）
- `provider` TEXT NOT NULL：`wechat_miniprogram` / `wechat_official_account` / `wechat_open_platform` / future
- `app_id` TEXT NOT NULL（区分微信应用作用域）
- `provider_subject` TEXT NOT NULL（该 AppID 下 OpenID；私有表，仅服务端访问）
- `union_id` TEXT NULL（仅来源已验证、可用时填写；不能强制非空）
- `verified_at`, `bound_at`, `revoked_at`, `created_at` TIMESTAMPTZ
- `unique(provider, app_id, provider_subject)`：同一外部身份最多绑定一个有效用户；对解绑/重绑应采用部分唯一索引或严格状态事务，具体 DDL 需单独审核。

`private.identity_binding_audit`（建议）：记录绑定、解绑、冲突、恢复动作的操作者、时间、结果、证明方式及不含密钥的审计关联号；敏感外部标识不进入公共审计 JSON。

注意：`auth_user_id` 与 `profile_id` 的一致性不能只靠双 FK；绑定事务必须调用权威 `current_profile_id()` / 受控 resolver 并检查 alias 冲突。可能先只保留一个 canonical `profile_id` 与可追溯 `auth_user_id` 映射；禁止静默自动创建重复 Profile。

### 2.3 服务端登录契约草案

`POST /identity/wechat-mini/exchange`（仅设计）

输入：`{ login_code, request_id }`；**不接收**客户端 `openid`、`unionid`、`profile_id` 或角色声明。

后端：

1. 限流、输入检查、单次/短期 `request_id` 幂等防重放；微信 `wx.login()` 的临时 code 仅交给服务端。
2. 使用服务器保存的 AppID/Secret 调用 `code2Session`，检查官方返回错误、超时、AppID、OpenID 与可选 UnionID；`session_key` 不返回客户端，不写日志。
3. 在私有身份绑定表中原子查询；已有绑定则确认唯一 Auth/Profile；新身份进入受控新用户创建/明确绑定流程；不因 UnionID 相同就无条件合并有历史数据的账号。
4. **待验证的关键技术关口**：如何在托管 Supabase Auth 上安全地给已验证微信主体创建/恢复 Supabase Auth session，且不泄露 magic link/OTP、service_role、JWT 签名密钥。先做官方支持能力 PoC（Custom OAuth2、Auth Admin、其他受控桥接），选定前不得声称已解决。
5. 返回 Supabase 可验证的登录会话/一次性交换结果（具体字段依 PoC 确认）；所有业务操作仍走原有 RLS/Edge 可信授权。

拒绝：将微信 `code` 直接当 Supabase OAuth token；直接让客户端拿 `session_key`；将静态 Supabase service key 打包进小程序；仅用 UnionID/昵称推断老账号并登录；使用无用户证明的 `generateLink` 兑换流程。

### 2.4 G 与老郑的迁移验收

- 分别记录**受控的**现有 Auth ID、Profile ID、别名、历史赛事/成绩/好友/照片关系基线；避免向普通 handoff 输出完整敏感标识。
- 先由已认证的现有会话执行绑定，或者使用经过人工身份确认的专门恢复流程；不能把「昵称=G」当控制权证明。
- 微信小程序首次登录后，G/老郑应解析回原 Profile，历史数据计数及代表性记录不变；管理员 `super_admin` 应根据**当前可信 Auth ID** 正确授权，绝不能因微信昵称为 G 自动授予权限。
- 先回归普通用户越权拒绝、跨账号缓存清除、重放 code、重复绑定冲突、弱网重试、旧登录入口退役，再切换默认登录。

## 3. H5 与小程序产品范围初步划分

| 能力                  | H5               | 小程序 MVP                  | 共享 / 重做                               |
| --------------------- | ---------------- | --------------------------- | ----------------------------------------- |
| 赛事大厅、赛事详情    | 保留             | 纳入                        | 业务查询/领域逻辑复用；小程序页面重做     |
| 常规创建、Quick Start | 保留             | 优先纳入基础闭环            | 规则、校验、RPC 尽量共享；表单与导航重做  |
| 参赛者记分、结果查看  | 保留             | 纳入但须双端并发/幂等测试   | 记分事务复用，UI/弱网处理重做             |
| 邀请、好友关系、分享  | 保留链接         | 微信分享卡片/路径设计       | 关系与邀请码逻辑共享；分享入口平台化      |
| 相册、照片水印        | 保留             | 分阶段纳入                  | 数据/权限共享；上传、保存、授权重做       |
| 场馆选择地图          | 继续独立 P3 修复 | 单独做微信 map/POI 适配研究 | 地点语义共享；H5 Leaflet/百度代理不可照搬 |
| Platform Admin        | H5 内部后台      | 初版不搬入小程序            | 同一权限/审计后端；优先减少重复 UI        |

小程序客户端架构候选：Taro（React/TS 领域代码复用潜力较高）、原生小程序（平台 API 直接、但 UI 重写较多）、uni-app（跨端能力广、当前 React/TS 复用可能受限）。本轮**不拍板**，下一轮需要做一张真实代码可迁移性矩阵，特别测 Supabase JS 的存储适配、WebSocket/Realtime、网络域名、微信文件/相册与 map 组件。

## 4. 成本矩阵：零成本优先但不能误导

| 事项                             | 已有证据/初步判断                                                                                                                              | 零元验证与触发条件                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| H5 现有 React/TS 业务逻辑        | 已有，无新增许可成本                                                                                                                           | 离线 mock 小程序组件与共享 domain 可先研究，不需购买                                                           |
| Supabase 托管 Free               | 官方现行文档：50,000 MAU、500 MB DB、1 GB Storage、500,000 Edge invocations；有免费额度并非无限                                                | 先测现有项目余量；跨端同一用户不应因重复账号浪费 MAU。超额需调整方案或升级；不要自行开通计费                   |
| Supabase Custom OAuth2/OIDC      | 官方文档：Free 项目可添加最多 3 个 custom providers；是否适配微信小程序 code2Session **未证实**                                                | 用 mock provider/协议验证设计；实际微信登录仍需真实资质与受控端到端验证                                        |
| Vercel Hobby                     | 官方明确免费且**仅个人非商业用途**                                                                                                             | 内部非商业 PoC 可复用；商业化/盈利目的正式服务前必须评估合规付费部署或替代托管                                 |
| 微信小程序账号、主体、备案、认证 | **官方收费/资质条件本轮无法直接读取完整官方后台**；第三方 2026 报道常见企业认证 300 元/年、个人/个体部分场景 30 元，**不得据此确认适用球搭子** | 注册/认证/备案是否必需、是否已有可复用资质、具体收费以对应主体的微信公众平台后台及官方协议为准；未经授权不办理 |
| 公众号网页授权 / PC 网站扫码     | 不同主体和应用资质；小程序 AppID 不能默认覆盖                                                                                                  | 若尚无公众号/开放平台网站应用，不为追求全端同日上线先购买；先设计备用 H5 登录方式，具体需官方核验              |
| 微信小程序请求域名、国内可达性   | `supabase.co` 与 `vercel.app` 是否满足微信合法域名/备案及中国境内可用性 **未验证**                                                             | 先做真机/域名合规矩阵；不把开发工具的域名校验关闭当上线方案                                                    |
| 地图、POI、相册与通知            | 微信组件/腾讯位置服务/现有百度 API 额度和平台条件不同                                                                                          | 优先基础 map + 手工场馆输入 fallback；不购买商业 POI/短信/推送，订阅消息按真实必要性评估                       |

**零新增费用 PoC**：仅在本地/现有开发资源中完成小程序 UI 骨架、mock `wx.login`→模拟服务端身份解析、共享领域逻辑编译、业务 Profile 映射单测、G/老郑迁移脚本 dry-run、记分并发契约测试。它**不证明**真实微信登录、AppID/域名/备案可上线或可在中国真机正常联网。所有真实密钥、资质、部署和迁移均须用户单独批准。

## 5. 待主 Chat 消费的具体动作（不由定时任务执行）

1. 在最新 HEAD 上将本研究作为**设计候选**合并到 `docs/research/miniprogram/`（如仓库无该路径，由 Chat 决定新增）；不得将 V8 confirmed scope 从 5 擅自改为 6。
2. 先评审「`external_auth_identities` 模型 + 会话桥接 PoC 可行性」；不要先做大规模页面迁移。写入前核对 `private.profile_auth_aliases` 现有用法和所有 server-side actor 解析逻辑。
3. 单独安排零成本、只在测试环境/本地运行的协议兼容性 PoC，验证真实微信小程序 code 与托管 Supabase Auth 会话衔接的**受支持方法**；无资质时只允许 mock 测试，标明不能完成端到端证明。
4. 确定微信主体/现有 AppID、是否计划商业运营、微信内 H5 是否必须首发、域名和中国大陆可达性；没有用户答复时继续给出条件分支，不阻塞可离线完成的设计。
5. 任何实际数据库迁移、账号绑定、管理员授权、停用昵称登录、购买资质、微信配置或部署必须获得明确授权，并执行备份、dry-run、回滚和权限回归。

## 6. 下轮优先研究（避免重复）

下一轮聚焦「原生微信小程序 vs Taro vs uni-app 的可复用代码/网络/地图/文件接口验证矩阵」，以及最小页面路线图；不重复本轮已明确的登录概念。另核对微信官方 2026 年主体认证与备案的原始证据和实际价格（官方页面无法访问时持续标注未核实）。

## 7. 来源与证据链接（2026-10-21 核验）

- GitHub branch exact ref: https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/tree/feature/v8-confirmed-20261011
- GitHub V8 scope: https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/feature/v8-confirmed-20261011/docs/V8_CONFIRMED_SCOPE.md
- GitHub nickname exchange: https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/feature/v8-confirmed-20261011/supabase/functions/test-identity-exchange/index.ts
- Supabase Custom OAuth/OIDC official: https://supabase.com/docs/guides/auth/custom-oauth-providers (本轮读取，Free 3 个 custom provider)
- Supabase third-party custom OIDC official: https://supabase.com/docs/guides/auth/third-party/custom-oidc (本轮读取；要求 issuer discovery / asymmetric JWT / role claim，不能视为直接微信 code2Session)
- Supabase Free usage official: https://supabase.com/docs/guides/platform/billing-on-supabase (本轮读取)
- Vercel Hobby official: https://vercel.com/docs/plans/hobby (本轮读取；明确 non-commercial only)
- Vercel fair use official: https://vercel.com/docs/limits/fair-use-guidelines (本轮读取；商业使用需 Pro/Enterprise)
- 微信开发者文档（官方目标 URL，当前抓取失败，**未验证原文**）：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html ; https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html ; https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/union-id.html
- 微信认证价格交叉参考（非官方，仅线索，不能作为费用承诺）：https://help.youzan.com/displaylist/detail_4_4-1-286263 ; https://help.youzan.com/displaylist/detail_5_5-1-19368

## 8. 状态与写入证明

STATUS=CHAT_WRITE_REQUIRED。本文仅为设计研究，不是已经验证的微信登录功能。此轮未执行任何 GitHub/Supabase/Vercel/微信服务变更；不涉及 P3 地图修复任务指令或代码；没有新增任何收费项目。只有 Library 上传操作成功回执出现后，才可标记 HANDOFF_STORED。消费归档只能由交互式 Chat 在核验后进行。
