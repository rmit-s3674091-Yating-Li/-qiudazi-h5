> 设计研究文档 · 本文记录研究证据与候选方案，不代表代码已实现、费用已批准或正式上线。
> 来源：小程序 MVP、H5 分享邀请的跨端入口；2026-10-21—22 的原始 Handoff，基线 HEAD 39e17fe。
> 状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL；用户尚未批准开发、数据库迁移或付费。

# 球搭子｜小程序 MVP 真实闭环与 H5↔小程序邀请路由契约（第八轮增量）

STATUS=DESIGN_EVIDENCE_CONSUMED  
RESEARCH_TOPIC=小程序 MVP 产品范围收口、跨端分享/邀请/历史球搭子认领路由、零新增成本的里程碑与验收  
BASELINE_REPO=rmit-s3674091-Yating-Li/-qiudazi-h5  
BASELINE_BRANCH=feature/v8-confirmed-20261011  
BASELINE_PR=Draft #26  
BASELINE_HEAD=39e17febc23d5732c867bb2244a02fd2d99e36a8  
BASELINE_READ_AT=2026-10-22 00:03-00:10 Asia/Shanghai  
TARGET_LIBRARY=/球搭子/V8/miniprogram-research/handoffs/  
PATCH_PACKAGE_ID=QD-MP-20261022-MVP-SHARE-ROUTES  
WRITE_BOUNDARY=ONLY_LIBRARY_HANDOFF; NO_GITHUB_SUPABASE_VERCEL_WECHAT_WRITES; NO_P3_CHANGE; NO_PURCHASE  
DECISION_STATE=DESIGN_IN_PROGRESS; NOT_AUTHORIZED_FOR_DEVELOPMENT  

## 0. 本轮新增，不重复前七轮

只读核对远端 PR #26 HEAD、Git tree、`src/main.tsx`、`src/pages/ConnectionsPage.tsx`、`src/pages/EventFriendInvitePage.tsx`、`src/components/EventInviteUI.tsx`、`src/pages/PrivateEventPreviewPage.tsx`、`src/pages/InviteAwareProfilePage.tsx`、`src/pages/EventPage.tsx`、`src/pages/MatchPage.tsx`、`src/pages/QuickStartPage.tsx`、`docs/V8_CONFIRMED_SCOPE.md`、`README.md`、`docs/DOCUMENT_GOVERNANCE.md`、`docs/RELEASE_GOVERNANCE.md`，及 Library 五份未消费 handoff。未对 Supabase 作写操作，也未修改地图 P3。

此前已经确定的结论继续沿用：保留 H5、Taro React/TS 为小程序 PoC 首选、业务规则和后端共用、Supabase Auth 稳定 Profile ID、短信资质与微信会话桥接尚未闭环、G/老郑不得昵称认领、管理员 Auth UUID 独立。**本轮发现新的 MVP 切分关键：赛事分享、好友邀请、临时 Player 历史认领和私有赛事预览，不是“把 H5 链接复制到微信”就能解决；若把跨端入口全推迟到 P2，小程序 P1 无法完整验收真实赛事参与闭环。**

## 1. 代码证据与新增问题

1. `src/main.tsx` 使用 `HashRouter`，H5 业务链接是 `/#/events/:id`、`/#/events/:id/preview`、`/#/connect/:inviterId`、`/#/claim-player/:token`；根入口另解析 URL query `?claim=...`、`?connect=...`，再 Navigate 到 H5 内部路由。**微信小程序的页面栈与 `onLoad`/启动参数不是浏览器 hash URL**，不得直接把 H5 URL 填到小程序分享 `path`。
2. `EventPage.tsx` 使用 `navigator.share` / clipboard 拼接 H5 赛事 URL；`PrivateEventPreviewPage.tsx` 同样分享 `/#/events/:id/preview`，并通过 `get_private_event_preview` RPC 展示脱敏私有赛事。**公开赛事详情链接、私有赛事脱敏预览和具有加入/认领效力的邀请，必须区分**；拿到 preview 链接不等于获得报名/相册权限。
3. `ConnectionsPage.tsx` 的新球搭子邀请通过 `create_connection_invite` 获取 token，构造 `?connect=${token}`；进入 `ConnectionInvitePage` 后先尝试 `get_connection_invite_by_token`，并兼容旧 `get_connection_invite` 的 inviter Profile ID。页面的 `useEffect` 在满足条件时会自动调用 `accept()`；**跨端打开分享后自动接受的 UX/意图边界必须专项审查**，尤其扫码误触、旧链接重放和登录后自动续跳；这是可观察代码行为，不等于已确认安全漏洞。
4. `ConnectionsPage.tsx` 的 `PlayerClaimInvitePage` 使用 `get_player_claim_invite`、`accept_player_claim_invite`，并区分发起者自己；临时球搭子历史认领与 Connection invite 是不同 RPC/不同权限语义。`EventInviteUI.tsx` 的 `respond_event_invite`、`EventFriendInvitePage.tsx` 的 `invite_connection_to_event` 又是**另一类有已登录受邀人的业务邀请**，不能用同一个通用“invite=token”状态直接接收。
5. `InviteAwareProfilePage.tsx` 依据 `next` 选择 `claim-player` / `connect` 返回路径；当前完成资料路径仍依赖昵称及 H5 profile 流程，正式小程序登录后不得借此自动认领旧 Profile。
6. `src/main.tsx` 目前路由中存在赛事大厅/我的赛事/赛事详情/编辑/快速开赛/单场记分/好友/赛事邀请/临时 Player 认领/相册/个人资料/Platform Admin 等多类页面。**H5 页面数与小程序需要重新实现的页面数不等价**：应以最短闭环而非原样迁移 22 个 `src/pages` 文件衡量工时。
7. `docs/V8_CONFIRMED_SCOPE.md` 仍明确 V8 **5 项已确认开发**；小程序设计是独立正式目标，但尚未被授权作为第 6 个 V8 代码开发项。地图 P3 的「绿心」「奥森」验收不得被本研究替换或修改。

## 2. 建议的产品范围：把 P1 的“分享/邀请入口”从增强项提升为必要闭环

| 业务能力 | P0：零新增付费离线 PoC | P1：测试环境真实 MVP（需独立授权） | P2：可延后 | 平台差异与验收 |
|---|---|---|---|---|
| 赛事大厅、我的赛事、详情 | mock 列表/详情与导航 | 真实数据、公开/私有权限、登录后回跳 | 高级筛选 | 小程序页面栈与 H5 hash 分离 |
| 创建赛事、Quick Start | 表单 mock、纯 TS 赛制单测 | 创建→名单→生成对阵→开赛、循环+淘汰 | 高级编辑交互 | server-side 事务、失败恢复与 H5 一致 |
| 参赛者记分 | 同一 scoring fixtures | 真 JWT、角色授权、version/idempotency/离线恢复 | 更丰富的记分动画 | 不能只测单人正常提交 |
| **赛事分享、邀请落地** | **mock 路由与 deep-link 解析** | **必须具备可验证的分享→打开→登录→回跳→查看/报名或拒绝路径** | 小程序码批量生成、海报美化 | 不能把分享推到 P2，否则无法验证真实传播与加入赛事 |
| 好友邀请/历史 Player 认领 | mock 三种邀请类别及失败态 | 明确 token 与原 Profile 控制权、显式确认/拒绝、跨端恢复 | 社交推荐 | 禁止昵称自动认领与越权关联 |
| 相册 | 选择/水印/上传契约 mock | 先保证赛事源照片按权限可读、受保护预览 | 私人相册完整管理/批量导入可分期 | 个人相册私密性不能被分享链接绕过 |
| 地图/场馆 | 微信 Map 与假 POI/mock | 城市约束/手填 fallback/正确位置；根据核心创建流程决定最小真机验收 | 多供应商 POI、智能推荐 | 不修改 H5 P3；小程序适配独立验收 |
| Platform Admin | 无 | **继续 H5 后台**，小程序仅保证普通用户不能越权 | 小程序管理员 UI 不进 MVP | G 现有后台故障独立定位 |
| 订阅消息/支付/Club SaaS | 无 | 无 | 另立需求与预算 | 不作为 MVP 先决条件 |

**建议决策**：小程序 P1 最小真实闭环是“被邀请者打开赛事→验证登录→看到与权限相符的赛事→合法加入或拒绝→参赛记分”；同时支持“创建赛事→分享给好友”。不是把 H5 全部页面迁移，也不能把邀请码安全与登录恢复放到以后。

## 3. 跨端链接契约（设计，不执行）

### 3.1 统一逻辑目标与平台表现

| 逻辑目标 `intent` | H5 现有/目标 URL | 小程序建议页面 | 访问级别 |
|---|---|---|---|
| `event_view` | `/#/events/{eventId}` | `/pages/event/detail?eventId=...` | 公开信息；私有内容由后端 role 判定 |
| `private_preview` | `/#/events/{eventId}/preview` | `/pages/event/preview?eventId=...` | 脱敏预览；非授权不能查看名单/照片 |
| `connection_invite` | `?connect={token}` 或 `/#/connect/{token}` | `/pages/invite/connection?ref=...` | token 仅定位邀请，实际接收必须校验登录主体与状态 |
| `player_claim` | `?claim={token}` 或 `/#/claim-player/{token}` | `/pages/invite/claim?ref=...` | 历史 Player 认领是独立敏感操作 |
| `event_invite` | `/event-invites`，以 JWT 查询邀请收件箱 | `/pages/invite/inbox` | **不能**用赛事 id 或好友 token 代替受邀人身份 |
| `score_match` | `/#/events/{id}/matches/{matchId}/live` | `/pages/match/live?eventId=...&matchId=...` | 实际参赛者/owner 权限服务端判定；分享不能授予记分权 |

设计一个平台无关的 `NavigationIntent`：`{kind, entityId?, inviteRef?, source?, version}`。H5 adapter 输出 hash URL 或 root query，Mini adapter 输出合法 page path + query。**不要在 URL 中传 JWT、refresh token、Supabase magic-link token_hash、微信 session_key、手机号或管理员权限。** 分享给外部用户的 token 应有随机性、有效期/撤销/状态和服务器核验；二维码 `scene` 字段若长度受限，用短 opaque reference 服务端解析，不能截断 token、明文编码 PII 或默认授予权限。微信小程序码真实限制和资质需再从官方后台核验，不能写死未经官方核验的数字。

### 3.2 跳转状态机与可恢复性

`SHARE_OPENED → INTENT_PARSED → (PUBLIC_PREVIEW | AUTH_REQUIRED) → AUTH_VERIFIED → INTENT_REVALIDATED → (ACTION_CONFIRM | READ_ONLY | EXPIRED | CONFLICT | FORBIDDEN) → COMPLETED`。

- 解析时仅验证类型、长度、版本、参数格式；**服务端重新验证**活动/邀请状态与权限，客户端 URL 不构成授权。
- 未登录时先保存短时、**非秘密**的 pending intent；认证成功后重新读取后端状态，防止“旧邀请已取消却被登录回跳继续接受”。若包含敏感邀请 token，须按最小必要、短期/隔离保存并明确清理策略，避免本地明文长期持久化。
- 同一个账号连续收到多个邀请，使用 `request_id` 和最近一次用户显式选择控制回跳，不允许旧异步响应覆盖新登录身份（复用 `AuthAccountGeneration` 原则）。
- `connection_invite` 建议小程序展示邀请人及“接受/拒绝”，不建议因打开链接就自动接受；**这是设计建议，不代表已授权改变 H5 行为**。
- `player_claim` 要求用户确认历史记录归属、核验旧控制权/有效 token 的权限语义，不能用 nickname 自动认领。
- 分享私有赛事仅返回受限预览；相册/受保护照片和参赛者记分必须各自校验后端角色。
- H5 与小程序间不共享浏览器 localStorage 或 Supabase refresh token；跨端绑定需经过既定显式控制权证明。

### 3.3 6 类必须分开测试的邀请

1. 普通公开赛事分享（无资格提升）；2. 私有赛事脱敏预览（不暴露报名/相册）；3. Connection invite token（有效/撤销/过期/已接受）；4. 临时 Player claim token（不能越权认领）；5. 指定受邀人的 Event invite（JWT 指向当前收件人）；6. 双打组队邀请（与普通 Event invite 的 `invite_kind` 区分）。

## 4. API/Adapter 草案与测试矩阵

- `NavigationPort.encode(intent, platform): string`；`decode(entry, platform): NavigationIntent | InvalidIntent`；`resolve(intent, currentAuth): Promise<IntentResolution>`。服务端 `resolve` 必须只返回当前权限允许的最小字段。
- `SharePort.shareEvent(eventId, visibility)`；`shareConnectionInvite(inviteRef)`；`sharePlayerClaim(inviteRef)`；`getMiniCodeRef(intent)` 为**未来可选**，不得默认需要新付费二维码服务。
- `IntentResolution = {status: 'PUBLIC_PREVIEW'|'AUTH_REQUIRED'|'ACTION_CONFIRM'|'READ_ONLY'|'EXPIRED'|'FORBIDDEN'|'CONFLICT', nextRoute?, safeDisplay?}`；客户端只渲染，最终 accept/claim/join 仍走现有受控 RPC。
- 验收 01：H5 分享链接在微信外 Safari/Android 正确打开；02：微信内 H5 打开合法回退页面；03：小程序分享卡片在微信内打开正确 event；04：登录中断后回跳不丢 intent；05：旧邀请过期/撤销后禁止接受；06：重复点击接受幂等；07：两个账号先后打开邀请不串号；08：公开赛事链接不能读私有照片；09：私有赛事 preview 不授权报名；10：历史 Player claim 不以昵称/头像自动合并；11：双打邀请只允许真实受邀人；12：记分深链不绕过参赛者/owner 鉴权；13：弱网恢复后不重复接受；14：不同设备小程序/H5 共享业务 Profile 时不会共享原始 token；15：管理员 URL 不授予 Admin；16：二维码 scene ref 错误/过期可安全提示。

## 5. 成本与里程碑：先可验证的零新增费用，再决定正式上线

| 阶段 | 产物与准入 | 费用与限制 | 是否需要用户另行授权 |
|---|---|---|---|
| M0 文档收口 | MVP scope、路由契约、登录候选与 blocker 台账、16 项验收矩阵 | 本轮研究零新增付费；人工工时非零 | 不需要产品写入，但 GitHub 文档落库仍由主 Chat 审核 |
| M1 本地 mock PoC | Taro 编译、纯 TS scoring fixtures、mock share→intent→auth→resume；不使用真实身份/短信 | 可在现有本地/开源工具中零新增订阅成本 | **是：启动代码 PoC 属开发授权** |
| M2 隔离 TEST 集成 | 已验证的 Auth Session、JWT/RLS、旧用户映射、真实邀请码 RPC、相册 Storage、合法域名、真机弱网 | Supabase 免费额度内有可能零新增订阅，但短信、主体、域名/备案、微信 AppID 及真机条件需单独核验 | **是：任何测试库/Edge/配置变更另行授权** |
| M3 小程序审核/发布 | 资质、隐私指引、域名、真机矩阵、性能、灰度回滚、费用预算 | 微信认证/备案、域名、短信/地图、商业化部署费用**待官方核验** | **是：注册/认证/付费/发布均须确认** |

**TCO 补充事实（2026-10-22 官方复核）**：Vercel Hobby 仅限个人非商业使用；正式商业化不可将 Hobby 计为合法零成本生产托管。Vercel 官方 Pro 基础平台费为 $20/月（含一个可部署席位与 $20/月基础设施抵扣额度；实际其他资源超额另计），但不意味着球搭子必须立刻购买：可继续评估合法低成本替代托管，并先做非商业研究 PoC。现有 H5 不应为小程序开发被强制整体迁移。

**费用决策门槛**：任何短信资质/套餐、微信手机号快捷验证、商业地图 POI、域名备案/认证、付费托管均先查最新官方证据并征求用户确认；不将微信开发者工具模拟“可运行”误判为合法正式上线。短信每月账面成本继续复用上一轮 `20261021-2112_phone-otp-vs-wechat-login-decision_39e17fe.md`，不重复抄表或假定已采购。

## 6. 建议文档级 PATCH_PACKAGE（由主 Chat 批量融合，非本任务写入）

1. `docs/research/miniprogram/cross-platform-product-scope.md`：新增本文件第 2 节 MVP/P0/P1/P2 矩阵；将“分享→登录→回跳→合法加入/拒绝”明确列为 P1 必需。
2. `docs/research/miniprogram/miniprogram-implementation-prd.md`：新增第 3/4 节 `NavigationIntent` / `SharePort` 契约、16 项验收与状态机；明确六类邀请不能混用。
3. `docs/research/miniprogram/identity-architecture.md`：补充登录回跳时 pending intent 隔离、重复请求、跨 Auth generation、隐私保护和账号绑定防接管。
4. `docs/research/miniprogram/official-sources.md`：补充下列已复核官方资料、日期与未核项。
5. `docs/research/miniprogram/handoff.md`：追加 P1 范围提升原因、未决事项与 M0-M3 门槛；不得将本研究自动记为 V8 已确认第六项。

## 7. 官方资料与核验日期

- 2026-10-22 读取 Taro 4 官方分享 Hook（页面转发回调，**不是** H5 hash 路由复用保证）：https://docs.taro.zone/docs/apis/taro.hooks/useShareAppMessage
- 2026-10-22 读取 Taro 4 官方 API 列表（含 `navigateTo`、`switchTab`、`getLaunchOptionsSync`、`getEnterOptionsSync`、分享与定位等）：https://docs.taro.zone/docs/apis/
- 2026-10-22 读取腾讯云小程序网络文档（标注更新 2026-02-11；request/upload/download/socket 分域名配置与 HTTPS/WSS）：https://intl.cloud.tencent.com/zh/document/product/1219/61745
- 2026-10-22 读取 Vercel 官方 Hobby 限制（官方页标注更新 2026-01-07）：https://vercel.com/docs/plans/hobby
- 2026-10-22 读取 Vercel 官方 Pro 价格（官方页标注更新 2026-02-03）：https://vercel.com/docs/plans/pro-plan
- 微信官方 `getUnlimitedQRCode`、`scene` 实时字节限制、二维码审核/收费、微信小程序实际认证/备案/合法域名资质：**官方原文或当前项目后台未能核验，全部标待官方核验**，不引用第三方页面当已确认事实。
- GitHub 证据（2026-10-22 只读 exact SHA）：https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/tree/39e17febc23d5732c867bb2244a02fd2d99e36a8

## 8. 未决事项、验收与消费计划

**未决事项**：SESSION_BRIDGE_UNPROVEN；SMS_DOMESTIC_QUALIFICATION_UNPROVEN；WECHAT_APPID_DOMAIN_QUALIFICATION_UNPROVEN；RLS_ALIAS_COMPATIBILITY_GATE；TEST_NICKNAME_RETIREMENT_GATE；ADMIN_AUTH_SEPARATE_GATE；MVP_SHARE_INTENT_GATE；微信小程序真实扫码/分享与国内网络/地图真机测试未完成。**当前不标记 DESIGN_COMPLETE_CANDIDATE，也不宣布正式微信登录已实现。**

**主 Chat 消费计划**：读取此 handoff 与前五份、重新核对实时 HEAD；去重合并产品范围、路由/API、安全矩阵、官方来源到上述建议文档；仅在用户授权后低频一次性提交文档，禁止把设计稿当代码变更；回读目标文件并检查格式/测试/版本；只有实际落地并对账后才将 handoff 移至 `consumed`。本任务仅允许 Library handoff，禁止任何 GitHub、Supabase、Vercel、微信平台写入或付费。

HANDOFF_STORAGE_STATUS=ARCHIVED_AFTER_GITHUB_READBACK