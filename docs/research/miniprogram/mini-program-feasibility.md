> 当前状态校正（2026-10-27）：本文以下为原日期的研究/证据快照，不是当前实施状态。离线 Taro PoC 已落仓且已有 G1 记录；正式身份仍为 SESSION_BRIDGE_UNPROVEN。当前技术决定与状态分层以[实施 PRD](miniprogram-implementation-prd.md)及[融合入口](handoff.md)为准。本文历史“尚未批准 PoC/没有小程序代码”等句不覆盖较新的授权及源码。历史价格、资质与官方线索未在本轮重新核验。

> 设计研究文档 · 本文记录研究证据与候选方案，不代表代码已实现、费用已批准或正式上线。
> 来源：正式发布备案、匿名赛事预览与设计收口；2026-10-21—22 的原始 Handoff，基线 HEAD 39e17fe。
> 状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL；用户尚未批准开发、数据库迁移或付费。

# 球搭子｜小程序 × H5：分享入口匿名可达性审计、备案关键路径与设计收口候选

STATUS=DESIGN_EVIDENCE_CONSUMED
DESIGN_STATE=DESIGN_COMPLETE_CANDIDATE_CONDITIONAL（仅设计评审候选；尚未取得用户批准、尚未完成登录或上线）
HANDOFF_ID=QD-MP-20261022-0307-ENTRY-AUTH-FILING-CLOSURE
RESEARCH_TOPIC=小程序首版分享→预览→登录→加入的实际授权缺口；APP/小程序备案法律要求；最低成本实施决策收口
BASELINE_REPO=rmit-s3674091-Yating-Li/-qiudazi-h5
BASELINE_BRANCH=feature/v8-confirmed-20261011
BASELINE_PR=Draft PR #26
BASELINE_HEAD=39e17febc23d5732c867bb2244a02fd2d99e36a8
BASELINE_READ_AT=2026-10-22 03:07–03:20 Asia/Shanghai
BASELINE_SUPABASE=qiudazi-test / rtmjzmgrhifjzxaliltm（仅只读系统 catalog 查询；不读取身份或业务个人数据）
TARGET_LIBRARY=/球搭子/V8/miniprogram-research/handoffs/
WRITE_BOUNDARY=ONLY_LIBRARY_HANDOFF; NO_GITHUB/SUPABASE/VERCEL/WECHAT_WRITES; NO_PURCHASE; NO_P3_CHANGE
PATCH_PACKAGE_ID=QD-MP-DOCS-20261022-ENTRY-AUTH-FILING-CLOSURE

## 0. 与前六份 handoff 的关系：只补新增证据和决策收口

已只读核对 GitHub PR #26 的实时 exact HEAD、`docs/V8_CONFIRMED_SCOPE.md`、`docs/V8_CURRENT_STATE.json`、`docs/DOCUMENT_GOVERNANCE.md`、`docs/RELEASE_GOVERNANCE.md`、`docs/research/miniprogram/{identity-architecture-and-cost,framework-reuse-matrix}.md`、`src/main.tsx`、`src/hooks/Auth.tsx`、`src/pages/{LoginPage,EventPage}.tsx`、`src/repositories/supabase.ts`、`supabase/functions/test-identity-exchange/index.ts`、`supabase/migrations/20260829075002_support_test_auth_aliases.sql` 和 `20261011204000_v8_platform_admin_self_role.sql`。复用 Library 中六份未消费的研究 handoff（alias/RLS、绑定恢复、会话桥接、网络媒体、Phone OTP vs WeChat、分享/邀请路由），不再重复这些方案正文。

**本轮净新增 3 件事：**

1. **源码 + 测试库 catalog 双重证明**：现有赛事详情路由看似公开，但核心赛事读取 RPC 不允许 `anon` 执行；私有赛事预览路由还包在 `IdentityGate` 里。因此“用户打开分享后可先看到赛事预览，再决定是否登录”不是已实现的能力，不能作为小程序 MVP 默认前提。需要正式选择「登录先行」或「新建最小脱敏匿名预览 API」。
2. **工信部官方备案依据**：2023 年工信部信管〔2023〕105 号文明确将小程序分发平台纳入 APP 备案治理；在中国境内开展 APP 互联网信息服务的主办者须备案，新增服务应先备案后开展业务。材料齐全且准确时，省级通信管理局应在 20 个工作日内备案；这不是项目端到端办理总时长承诺。备案应列为正式发布前置，而不是只在“微信认证费用”一栏顺带提及。
3. **设计收口建议**：既有六份研究已覆盖产品范围、平台适配、统一身份、旧账号迁移、短信/微信成本、安全、分享路由和分阶段 PoC。除新增的“匿名预览”选择与主体资质外，继续每轮扩充概念方案边际价值很低；建议以 `DESIGN_COMPLETE_CANDIDATE_CONDITIONAL` 交由主 Chat 集中评审，而非宣称实现完成。

## 1. 关键新增证据：分享入口与匿名读取权限不一致

### 1.1 当前源码（exact HEAD）

- `src/main.tsx`：`/#/events/:id` 路由渲染 `<EventPage/>`，没有包 `IdentityGate`；但 `/#/events/:id/preview` 渲染 `<IdentityGate><PrivateEventPreviewPage/></IdentityGate>`。
- `src/pages/EventPage.tsx`：进入页面立即通过 `useQuery` 调用 `repository.event(id)` 和 `rpc('get_my_event_entry_id',...)`；后者属于当前用户私有信息，不应匿名开放。
- `src/repositories/supabase.ts`：`repository.event(id)` 调用 `get_event_snapshot(p_event_id)`；没有独立的“仅返回公开字段”接口。
- `src/hooks/Auth.tsx`：`IdentityGate` 在需要身份时进入登录/资料完成流程；`start()` 无 Session 时可能走 `guest-session` 自动创建测试 Auth 身份，并把测试 guest 邮箱/密码放在浏览器 localStorage。**正式微信小程序不能直接复用这种测试凭据作为生产认证。**
- `src/pages/LoginPage.tsx` 仍有昵称登录和创建测试昵称；`complete_profile()` 在历史昵称命中时有自动 alias 关联分支。两者均是正式身份切换必须退役的测试路径，不能只删除登录按钮。

### 1.2 TEST catalog（只读 SQL；无业务数据）

查询 `pg_proc`/`pg_namespace` 与 `has_function_privilege('anon',p.oid,'EXECUTE')`，获得：

| `public` 函数                                  | `anon EXECUTE` | `authenticated EXECUTE` | `SECURITY DEFINER` |
| ---------------------------------------------- | -------------- | ----------------------- | ------------------ |
| `get_event_snapshot(p_event_id uuid)`          | **false**      | true                    | true               |
| `get_private_event_preview(p_event_id uuid)`   | **false**      | true                    | true               |
| `get_my_event_entry_id(p_event_id uuid)`       | **false**      | true                    | true               |
| `get_connection_invite_by_token(p_token uuid)` | **false**      | true                    | true               |
| `get_player_claim_invite(p_token uuid)`        | **false**      | true                    | true               |

另查所有名称含 `event`/`preview` 且 anon 可执行的 public 函数，仅见 `event_registration_open(e events)` 辅助函数；**没有发现可直接替代上述读取流程的已授权匿名赛事详情 RPC**。这只证明当前权限和代码路径，不证明不存在其它 HTTP/Edge 或未来扩展；不得据此笼统声称系统绝对无法匿名展示任何内容。

**影响：**前轮设计的 `SHARE_OPENED → PUBLIC_PREVIEW → AUTH_REQUIRED` 不能直接复用现有 `get_event_snapshot`/`get_private_event_preview`；如果小程序“先预览后登录”是 MVP 产品承诺，就必须新设计安全的最小只读预览契约。尤其私有赛事不得因分享链接被错误开放名单、报名状态、相册、精确联系方式或记分权限。

### 1.3 两条合规且低成本的实现路线（由用户确认，不擅自选择）

| 方案                     | 用户打开赛事分享                                                                          | 额外开发/运维                                                    | 风险与验收                                                                                     | 推荐条件                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **E1：登录先行**         | 打开分享后先展示非业务敏感的静态说明，再进入正式登录，成功后服务端查询赛事                | 最少新增公开数据面；继续现有 authenticated RPC；仍需完成正式登录 | 分享转化率可能受影响；必须保留 intent、失败/取消/过期回跳，不能使用测试昵称/guest 代替正式登录 | **最小工程/TCO 的保守首版默认候选**，尤其身份方案未闭环时             |
| **E2：最小脱敏匿名预览** | 分享链接打开后先读赛事标题/日期/城市/公开场馆概览等经批准字段，报名/记分/好友操作时再登录 | 需要新增受控只读 RPC/Edge、字段白名单、枚举/限流、缓存与隐私审计 | 匿名 token 不授予加入/相册/私有成员读取；测试私有赛事、取消、过期、滥用爬取、隐私泄漏          | 真实增长目标重视“先看赛事再注册”，且愿意批准独立 API 设计与安全测试时 |

**不得做的“省事方案”**：直接把 `get_event_snapshot`/`get_private_event_preview` 的 EXECUTE 授予 `anon`，或把原 `SECURITY DEFINER` 函数复制后移除角色检查。若选择 E2，必须设计新的字段最小化读取面，经过数据分类/隐私评审、限流与独立安全测试后再申请代码/DB 授权。

**费用判断**：E2 可能减少用户为了“只看赛事”而发送的 OTP，但无法仅凭单价推断实际节约。可用模型：`避免的短信量 = 纯浏览分享次数 × 原本会触发短信比例 × 单次所需短信数`，乘官方有效单价后再与新增开发/安全维护人日比较。若是微信免短信登录，E2 的直接短信节约趋近零，价值主要是用户转化而非短信账单。不得虚构分享打开量、转化率或新增 RPC 免费无限额度。

## 2. 正式发布的法律/平台依赖：备案不能被“零元 PoC”替代

### 2.1 已从国家主管部门核实的法定要求（2026-10-22 读取）

- 工信部《工业和信息化部关于开展移动互联网应用程序备案工作的通知》，工信部信管〔2023〕105 号，2023-08-04 发布，发给包括**小程序、快应用等分发平台**在内的主体。其第一部分明确在中国境内从事互联网信息服务的 APP 主办者须依法备案；新增 APP 先备案后开展业务。链接：https://www.miit.gov.cn/jgsj/xgj/wjfb/art/2023/art_dd783a581c9644a4aee10afa582811db.html
- 工信部同期官方解读明确：经接入服务提供者或应用分发平台提交备案，已有网站备案的主体可复用部分主体身份信息；材料齐全准确时省级通信管理局在**20 个工作日内**予以备案。该时限不包含准备资料、平台初审、整改和其它依赖。链接：https://www.miit.gov.cn/jgsj/xgj/hlwgl/art/2023/art_564bf0759d7e41d5b4aa8ce4996b9e84.html
- **APP/小程序备案、网站/域名 ICP 备案、微信账号认证、微信类目审核、短信签名/模板审核是不同事项。**不得将一项完成等同于其它事项自动通过。微信公众平台当前具体认证价格、账号主体适用性、合法域名的备案/所有权规则及平台审核周期，本轮微信开发者官方页面仍无法直接读取：`待官方核验`，不填写猜测费用。
- 工信部文件说明了备案义务，**并不意味着所有备案环节零费用**；具体项目主体和服务商支出需要正式申请前确认。未办理任何备案/认证/域名变更。

### 2.2 最低 TCO 关键路径（不是工期承诺）

- **D0：立即可做的零新增订阅设计/离线 PoC（未来另获开发授权）**：Taro mock 页面、共享纯 TS 规则、NavigationIntent 解析、账号绑定冲突 fixtures、E1/E2 UX mock；不使用真实手机号、微信 code、正式数据库或真实短信。新增外部采购预算可为 ¥0，但工程工时非零。
- **D1：必须先由项目负责人确认**：拟用小程序主体（个人/企业/其他合格主体）、是否有已认证小程序/备案主体、是否有可合法报备国内 SMS 签名的企业主体/授权、是否商业运营、首发是否必须 +86 之外的号码。未确认前不申请资质，不承诺上线日期。
- **D2：条件式登录 PoC**：若短信资质具备，先隔离测试 Supabase Phone OTP + 供应商 Hook（需授权与可能付费）；若无短信资质且小程序为主入口，先只读设计/离线验证 wx.login→可信后端→可刷新 Supabase Session，真实微信 Gate 2 须 AppID/合法域名及授权；邮箱仅限有可用 SMTP/国内送达证明的备用渠道。
- **D3：资质/备案与合法网络环境**：APP/小程序备案、适用主体审核、request/upload/download/socket 等合法域名、真实国内 iOS/Android 网络、必要隐私说明与权限弹窗，均需真机和后台证据。备案主管部门法定处理时限不能当作“注册到上线仅 20 个工作日”。
- **D4：产品 P1 测试环境集成（需独立授权）**：赛事创建→分享→邀请落地→正式登录→加入/拒绝→参赛者记分；并发/幂等、Photo/Storage、G/老郑恢复、Admin 角色分离、P3 地图独立验收。
- **D5：上线审批（需独立授权）**：合规/安全/成本/真机 Gate 全过后再讨论发布与商业托管；不自动触发 V8 Release Gate，也不修改 main/Production/release-candidate。

## 3. 设计收口：推荐的“条件化”方案，而不是继续扩张研究范围

**产品策略**：继续 H5 + 微信小程序并行；小程序 P1 覆盖赛事大厅/详情、创建与 Quick Start、参赛者记分、邀请/分享/登录回跳、必要好友与历史 Player 认领、最小场馆选择；H5 保留完整后台与个人相册高级能力。Taro React/TS 为优先 PoC 候选，独立 UI/路由/网络/媒体适配，复用 domain/backend；未实测不能承诺具体复用率。

**登录策略（条件化推荐）**：

- 已有合法大陆短信签名主体且希望最短跨端实现：优先 A（Supabase Phone OTP + 合规短信供应商），因为原生可刷新 Supabase Auth 会话更直接；但短信费、反滥用、国际号和 Taro SDK 兼容性均须验证。
- 暂无短信主体且微信小程序是核心入口：优先 B 的微信身份桥接 Gate 0/1 研究，**不是宣布 B 可直接上线**；小程序 wx.login→服务端 code2Session 与 Supabase Auth Session 的可信交换仍为硬阻断。
- 微信小程序与 H5 两端都高频、短信主体合规且 B 已实测：再考虑 D 混合方案；不要一开始为跨端登录同时承担两套桥接维护。
- 微信手机号快捷获取 C 不独立替代登录；官方 2026 价格仍待核验。邮箱 E 作为恢复/低成本 PoC 候选，不承诺国内免费送达。

**分享入口策略**：以 E1 登录先行为最低工程成本首版默认候选；若用户确认必须“无需登录就看赛事”，则新增 E2 的独立安全设计/验收范围。E1/E2 的选择与正式登录路线 A/B/D **正交**，不能为了减少短信费用放宽数据访问。

**账号与数据不变量**：稳定 `public.profiles.id`；微信 OpenID 以 `(provider, app_id, openid)` 唯一，不依赖 UnionID 一定存在；真实 Auth JWT/RLS/Storage/Realtime 保持后端鉴权；G/老郑需旧控制权证明，历史赛事/成绩/关系/相册不丢；Admin 继续独立按真实 Auth UUID 授权；`profiles_self_read` 与 alias 映射先修正并通过正反例；昵称登录、guest-session 与 `complete_profile()` 自动昵称认领必须作为**同一测试身份退役包**审查。

## 4. 阶段与验收矩阵：区分设计完成、技术 PoC 和可上线

| Gate                   | 必须有的证据                                                                                                               | 失败时处理                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| G0 文档设计评审        | 主 Chat 将本文件与前六份 handoff 去重融合至建议八份文档，用户确认小程序 MVP 与 E1/E2；成本假设、主体资质、官方证据均有状态 | 保持 `DESIGN_COMPLETE_CANDIDATE_CONDITIONAL`，不标 `APPROVED` |
| G1 本地零新增付费 mock | Taro 编译、共享评分规则单测、NavigationIntent/邀请六分类、身份状态机、账号切换防串号、模拟短信/微信费用计算                | 不接入真实服务；失败则调整 adapter                            |
| G2 Auth 隔离 TEST      | SMS 原生 Session 或微信桥接受支持的可刷新 Session；`getUser`/RLS/alias/Storage/Edge/刷新/撤销/重放/冲突/管理员拒绝全绿     | 不启用正式登录；不使用昵称 token_hash 作为替代                |
| G3 分享与隐私          | E1 登录后回跳正常；若 E2，最小匿名预览字段白名单、私有/取消/过期、枚举/滥用、相册与受邀权限拒绝全绿                        | 不开放 `anon` 读取原业务 RPC                                  |
| G4 小程序合法运行      | APP 备案/主体/合法域名/权限说明/国内真机/分享二维码/地图/上传/弱网/安全审核均有证据                                        | 不发布，不把开发工具模拟当真机                                |
| G5 业务闭环            | 创建→分享→打开→登录→报名→记分；G/老郑历史数据不变；Admin 不串号；两端照片授权一致                                          | 不发布，不自动进入 V8 Release Gate                            |

**正式身份尚未实现**：`SESSION_BRIDGE_UNPROVEN`、`SMS_DOMESTIC_QUALIFICATION_UNPROVEN`、`WECHAT_APPID_DOMAIN_QUALIFICATION_UNPROVEN`、`ALIAS_RLS_GATE`、`TEST_IDENTITY_RETIREMENT_GATE`、`ADMIN_AUTH_SEPARATE_GATE`、`APP_FILING_PENDING`、`ANONYMOUS_PREVIEW_PRODUCT_DECISION`。G 的后台权限故障仍是独立运行时问题，不能归因于微信登录。

## 5. 主 Chat 批量消费 PATCH_PACKAGE（只建议，自动任务不得写入）

目标文档（如仓库尚不存在，由主 Chat 评审后新建；遵循 `docs/DOCUMENT_GOVERNANCE.md` 的唯一 canonical/支持文档引用规则）：

1. `docs/research/miniprogram/mini-program-feasibility.md`：加入工信部 APP/小程序备案硬门槛与 20 工作日条件，微信资质/域名仍待官方核验；成本只写可证实项。
2. `docs/research/miniprogram/cross-platform-product-scope.md`：补充 E1/E2 分享登录决策；私有赛事预览不自动公开，H5 当前路由与 RPC 权限区别。
3. `docs/research/miniprogram/identity-architecture.md`：列出 `Auth.start` guest-session、昵称登录、`complete_profile` 自动 alias 绑定三重退役边界；不得直接扩大 `anon` RPC。
4. `docs/research/miniprogram/wechat-login-options.md`：沿用前轮 A/B/C/D/E 官方价格及条件排序，不重复新造单价；新增 E1/E2 正交选择与账号生命周期。
5. `docs/research/miniprogram/legacy-user-migration.md`：G/老郑旧 Auth/Profile/相册/成绩/关系基线、后台 Auth UUID 独立验证；旧测试入口退役须备份与回滚。
6. `docs/research/miniprogram/miniprogram-implementation-prd.md`：加入分享打开→登录→回跳→加入闭环与 E1/E2 Gate；区分匿名展示与有权操作。
7. `docs/research/miniprogram/official-sources.md`：登记工信部两份官方文件、核验日期与微信未核费用；避免非官方数字成为 canonical。
8. `docs/research/miniprogram/handoff.md`：汇总六份既有 handoff + 本文件，标记 `DESIGN_COMPLETE_CANDIDATE_CONDITIONAL`、未决事项、用户批准与 G0–G5 门槛；不把小程序设计自动改成 V8 已确认第六项。

**消费计划**：主 Chat 批量读取七份 handoff → 重查实时 PR HEAD 与 repo/live migration parity → 按主题去重合并 8 份目标设计文档 → 用户批准文档写入后低频一次提交 → 格式与回读核验 → 仅在实际写入且对账后归档相应 handoff。产品代码、SQL、Edge、配置、资质、付费和发布须分别获得用户明确授权；本轮不得操作。

## 6. 官方来源、状态与可复核性

**本轮 2026-10-22 官方核验：**

- 工信部 APP 备案通知（2023-08-04 发布，含小程序平台、先备案后服务）：https://www.miit.gov.cn/jgsj/xgj/wjfb/art/2023/art_dd783a581c9644a4aee10afa582811db.html
- 工信部 APP 备案官方解读（2023-08-04 发布，材料齐全准确 20 工作日，平台提交）：https://www.miit.gov.cn/jgsj/xgj/hlwgl/art/2023/art_564bf0759d7e41d5b4aa8ce4996b9e84.html
- Supabase Custom OAuth/OIDC（2026-10-22 读取；标准 OAuth2 授权/回调/Token/UserInfo，不能视作直接支持小程序 wx.login code）：https://supabase.com/docs/guides/auth/custom-oauth-providers
- Supabase Third-Party Auth（2026-10-22 读取；要求外部 OIDC 非对称签名 JWT，仍不能把 OpenID/session_key 当 JWT）：https://supabase.com/docs/guides/auth/third-party/overview
- 微信小程序备案操作指引（官方目标链接本轮无法直接打开，价格、适用主体与平台流程仍待后台核验）：https://developers.weixin.qq.com/miniprogram/product/record_guidelines.html
- 微信 code2Session（官方目标链接本轮无法直接打开，仍需真机/官方后台核验）：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html

**GitHub exact-SHA 证据：** https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/tree/39e17febc23d5732c867bb2244a02fd2d99e36a8
**TEST catalog 查询**：仅检查五个命名 RPC 的 `anon/authenticated EXECUTE` 和 `SECURITY DEFINER`，及含 `event`/`preview` 的匿名可执行函数名称；没有写 SQL、迁移或配置。

**待用户决策（不在自动任务内询问/替代授权）**：E1 登录先行 vs E2 匿名最小预览；小程序主体/已有 AppID/APP 备案；合格国内短信签名主体/授权；是否商业化；是否必须国际号码；小程序/H5 活跃比例；是否允许独立离线 PoC、TEST 账号和安全验证。未获授权不得进入任何开发/资质/计费/部署阶段。

STATUS=DESIGN_EVIDENCE_CONSUMED
HANDOFF_STORAGE_STATUS=ARCHIVED_AFTER_GITHUB_READBACK（以 Library 上传成功回执与二次列表核验为准）
