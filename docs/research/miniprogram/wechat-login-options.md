> 设计研究文档 · 本文记录研究证据与候选方案，不代表代码已实现、费用已批准或正式上线。
> 来源：手机号 OTP 与微信登录最低 TCO 对比；2026-10-21—22 的原始 Handoff，基线 HEAD 39e17fe。
> 状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL；用户尚未批准开发、数据库迁移或付费。

# 球搭子｜手机号短信 OTP vs 微信登录：最低 TCO 与跨端统一身份决策（第七轮增量）

STATUS=DESIGN_EVIDENCE_CONSUMED  
RESEARCH_TOPIC=手机号短信 OTP、微信小程序 wx.login、微信手机号快捷验证、混合/邮箱备用登录的真实比较与最低合规成本  
BASELINE_GITHUB=rmit-s3674091-Yating-Li/-qiudazi-h5  
BASELINE_BRANCH=feature/v8-confirmed-20261011  
BASELINE_PR=Draft PR #26  
BASELINE_HEAD=39e17febc23d5732c867bb2244a02fd2d99e36a8（2026-10-21 21:12 Asia/Shanghai 只读核验）  
TARGET_LIBRARY=/球搭子/V8/miniprogram-research/handoffs/  
WRITE_BOUNDARY=ONLY_LIBRARY_HANDOFF; NO_GITHUB_SUPABASE_VERCEL_WECHAT_WRITES; NO_PURCHASE; NO_P3_CHANGE  
RESEARCH_DATE=2026-10-21（Asia/Shanghai）  

## 0. 本轮与此前六轮的差异、复用与决策结论

本轮读取 GitHub PR #26 的实时 HEAD、`docs/research/miniprogram/identity-architecture-and-cost.md`、`framework-reuse-matrix.md`、`docs/V8_CONFIRMED_SCOPE.md`、`supabase/functions/test-identity-exchange/index.ts`、`package.json`，以及 Library 四份尚未消费的研究 handoff。沿用既定的“稳定 Profile ID / 旧 Auth UUID 保留 / 昵称不得认领身份 / Admin 独立授权 / 微信 code 不等于 Supabase session / Taro+React/TS 小程序 UI 与 H5 共用 domain/backend”结论。本轮新增：**手机号 OTP 是可真正直接签发 Supabase Auth session 的正式候选；国内短信资质可能是比代码更大的上线阻断；已用阿里云、腾讯云官方 2026 年价格测算不同使用规模。**不重复已有会话桥接状态机或 P3 地图研究。

**决策建议（条件化，不是已批准上线）：**

1. **如果项目暂时没有可用于国内短信签名报备的中国大陆公司主体/有效授权：不要把“短信验证码为所有人唯一主登录”设为正式上线默认方案。**2026-10-21 核验的阿里云、腾讯云官方规则都说明个人自用短信签名资质无法完成运营商报备，国内短信签名须由中国大陆公司授权。此前“短信很容易接”是技术层面的真话，但合规落地前提不成立时不可行。应先验证主体条件，再决定 A/D。
2. **如果已有合格短信主体且优先统一 H5/小程序/PC、可接受每次登录的短信成本：A（Supabase Phone OTP + 合规国内短信 Hook）是“最少身份桥接改造”的优先 PoC**，它有官方 `signInWithOtp` → `verifyOtp` → 原生 Auth Session 路径，可能比 B 的微信会话桥接更快落地；不能保证小程序 `supabase-js` 无适配运行，也不能以号码相同自动认领 G/老郑旧账号。
3. **如果小程序为主要用户入口、目标零新增短信经常性费用：B（小程序 wx.login + 可信会话桥接，H5 保留独立可验证登录）仍可能有更低长期可变成本，但 SESSION_BRIDGE_UNPROVEN 是硬阻断。**先进行离线 Gate 0；真实 Gate 1/2 需要另行授权，不能靠“免费”绕过认证与 RLS。
4. **D（小程序微信登录 + H5 SMS OTP + 显式跨端绑定）适合两端都高频使用且短信资质已具备时**，但需维护两种认证、绑定/恢复流程，工程与运维成本可能高于 A；不能自动认为 D 最便宜。
5. **C（微信手机号快捷验证）不是微信登录，也不是 Supabase Phone OTP 的免费替代品。**获得手机号与微信身份、建立可刷新 Auth session 是三个不同步骤；微信手机号组件历史报道存在按成功调用计费，**本轮无法从微信开发者官方页面直接核实 2026-10-21 价格，全部标“待官方核验”，不得按 ¥0.03/次签采购预算。**
6. **E（邮箱 OTP / Magic Link）可作为无短信 PoC 与少量旧用户恢复备选**，但 Supabase 内建邮件发送默认限额为 2 封/小时/项目；正式公开用户登录需要可用 SMTP/邮件 Hook 和真实国内投递验证，不可直接宣称免费可运营。

**排序并非一成不变：**对具备国内短信资质、追求最短开发路径的团队，A 优先于 B；对缺乏短信资质且小程序为主要入口的团队，B 的设计 PoC 优先，A 暂时合规不可上线；对已有微信会话桥接经测试通过且短信主体合格的团队，B+D 视 H5 登录占比与运营负担再比较。

## 1. 可核实的官方事实与重要纠偏

### 1.1 Supabase Phone Auth 真的可以发原生 Session，但并不自带免费的中国短信

- 官方 Phone sign-in：启用 Phone Auth **仍需配置 SMS provider**；当前文档列 MessageBird、Twilio、Vonage、TextLocal（community-supported）。`signInWithOtp({phone})` 发起，`verifyOtp({phone,token,type:'sms'})` 成功后返回 Supabase `access_token` + `refresh_token`，与现有 Auth/RLS 最兼容。手机号建议 E.164 `+86...` 或其他国家码；SDK 接收国际格式不等于任一国家短信必可送达。
- 官方 **Send SMS Hook**（Free/Pro 可配置）允许自定义地区性短信供应商，Hook 能获得 OTP 并替代默认发送；**不是“控制台点选阿里云/腾讯云即可无代码接通”**。必须自行实现安全 HTTP/PG Hook、验证 webhook 签名、调用服务商短信 API、保管凭据、处理错误/超时、日志脱敏、限流和模板，且短信商资质与计费不消失。
- 官方 rate limits：当前默认全项目每小时 30 条 SMS；同一用户 OTP 重发默认 60 秒窗口；IP 认证接口也有限流。需要根据实际业务容量审查并设置 IP/手机号/设备/用户/项目/供应商多级预算限制及 CAPTCHA；**不能把 Supabase 自带限流等同于完全防短信轰炸**。对登录成功率/短信重发成本设置监控与日预算熔断。
- 换号、SIM 交换、运营商回收号码会造成旧账号被新号码持有人接管风险；关键动作、旧账号迁移、Admin 需额外近期重认证/独立证明，不能只凭收到 SMS 自动继承旧 Profile/角色。

### 1.2 中国大陆国内短信签名主体：实际是硬前提

- **阿里云官方资质说明（本轮核验）：**国内短信仅支持中国大陆公司授权申请签名；个人认证自用资质无法通过签名实名制报备，需“他用资质”或企业认证。签名申请前需要资质；企业资料、法定代表人和管理员信息、授权材料、短信模板及运营商实名报备都可能耗时。官方近期观察运营商报备约 5–7 工作日，部分 7–10 工作日，非服务承诺。
- **腾讯云官方实名资质审核标准（更新 2026-09-18）：**国内短信仅支持中国大陆公司授权申请签名；自 2025-09-18 起个人自用资质不可创建/修改，个人认证账号如申请签名须使用具备公司授权的“他用资质”。**个人认证账号可买短信套餐，不等于个人可合规申请国内短信签名。**
- 阿里云签名来源最新限制：公众号/小程序、已备案网站、已上线 APP 等不再是通用可选签名来源；需依官方合格主体名与材料申报。不能假设“球搭子”小程序名字自然通过签名审核。
- 两家都需要实名资质、签名、模板审核及运营商政策满足。尚未核验项目是否有符合条件的主体，因此 **SMS_DOMESTIC_QUALIFICATION_UNPROVEN**。

### 1.3 微信手机号快捷验证不等于 `wx.login`，价格不可直接引用旧报道为 2026 官方价格

- 小程序 `wx.login` 后端 `code2Session` 用于验证微信 AppID 范围内身份；`getPhoneNumber` 类组件是另一个需要用户同意的手机号获取/验证能力；获取的手机号不能自动替代 `auth.users`、不能自动证明历史业务 Profile 归属、不能直接生成 Supabase Session。
- 2023 年微信平台收费公告曾被多家媒体转述：快速验证 ¥0.03/成功调用、实时验证 ¥0.04/成功调用、1000 次体验额度（一次性而非月度）。**本轮微信官方开发者页面访问失败，2026 年价格、体验额度、主体条件、有效期均未从官方核实。只能作为待核验历史线索，不计入已确认报价。**需未来用户在微信公众平台付费管理后台核实并提供价格/资质截屏或官方可访问链接，不能开通/充值。
- 该组件即便成功获取号码，若 H5 仍使用短信 OTP，则并没有减少 H5 的短信发送费用；若希望完全免短信跨端登录，仍需独立可信身份桥接或显式双端绑定。

## 2. 五类入口与 A/B/C/D/E 路线的可行性矩阵

记号：◎较顺畅；○可做但需额外适配；△强依赖/不宜默认；×无法作为该端通用登录。

| 路线 | 微信小程序 | 微信内 H5 | 微信外 iOS/Android H5 | PC | 认证主体/会话 | 技术复杂度 | 可变费用/前提 |
|---|---|---|---|---|---|---|---|
| A. Supabase Phone OTP + 国内 SMS | ○ 输入手机号/短信、Taro 网络适配 | ◎ | ◎ | ◎ | Supabase Auth 原生 JWT/refresh；号码持有验证 | **低–中**（登录核心最直接，SMS Hook+安全/资质不简单） | 每条短信；中国大陆公司签名资质是关键门槛；国际短信另计 |
| B. 微信小程序 `wx.login` + 微信内 H5 公众号 OAuth + PC 开放平台扫码（分开评估） | ◎ 小程序原生微信身份；**会话桥接未证实** | △ 公众号 AppID/网页授权资质 | △ 微信外 H5 无通用网页授权；需备用方式 | △ 网站应用扫码资质/回调 | 各微信 AppID OpenID 不通用；UnionID 可空；Supabase Auth 桥接未证实 | **高** | 小程序资质/域名；公众号/开放平台可能另有资质及费用；待官方核验 |
| C. 微信小程序手机号快捷验证 + 可信服务端桥接 | ○ 用户授权手机号，须先有小程序及 API 权限 | × 非通用 H5 手机号获取能力 | × | × | 手机号证明与 Auth Session 分离，需额外登录/绑定路径 | **中–高** | 历史按成功调用收费，2026 官方价/额度待核验；不能独立覆盖多端 |
| D. 小程序 B + H5/PC A + 显式跨端绑定 | ◎（取决于桥接） | ○ 手机短信 | ◎ 手机短信 | ◎ 手机短信 | 两种主体映射到稳定 Profile，绑定需两侧控制权 | **最高**（两套入口+冲突恢复） | 小程序资质 + H5 短信；低短信占比时可控，维护较高 |
| E. 邮箱 OTP / Magic Link 作为备用 | ○ 输入邮箱，真机邮箱跳转/深链另测 | ○ | ○ | ◎ | Supabase Auth 原生 Session | **低–中** | 自定义 SMTP/邮件 Hook、国内送达率、邮件滥用；内建邮件 2 封/小时不足公开运营 |

注：B 中“微信内 H5 公众号 OAuth”“PC 开放平台扫码”不是使用同一个小程序 AppID 的同一种登录，且微信外 H5 不能依赖公众号网页授权。**任何手机号相同、昵称相同、微信头像相同都不能触发自动合并。**

## 3. 价格：官方确认、假设与 100/1,000/10,000 规模测算

### 3.1 本轮官方价格（核验日 2026-10-21）

| 资源 | 官方证据 | 当前可用于测算的价格/前提 | 注意事项 |
|---|---|---|---|
| 阿里云国内验证码 SMS 按量 | 2026-05-20 生效官方调价公告 | 月量 ≤100,000 条 **¥0.045/计费条**（含税） | 真实账户是否可按量开通、最低预充值/签名资质、分段计费与实际送达另核；不可宣称“无需先付任何钱” |
| 阿里云国内 SMS 通用套餐 | 同上 | 1,000 条 ¥50（¥0.05/条） | 低量按量标价优于购买小包；采购与开通仍需资质审核 |
| 腾讯云国内短信自定义预付 | 2026-08-11 更新官方价格页 | 最少 1,000 条，1,000–9,999 条 **¥0.05/条**；10,000–99,999 条 **¥0.047/条** | 预付最低 ¥50；套餐 2 年有效；真实按包购买及适用条件需控制台核验 |
| 腾讯云首次开通赠送 | 同一官方价格页 | 企业首次认证主体可领 200 条、个人首次 100 条（特定领取/3 个月有效） | **不可把赠送视为持续免费或国内短信签名资质豁免** |
| 微信手机号快捷验证 | 微信官方原文无法读取 | **待官方核验** | 历史第三方报道 ¥0.03/成功调用、1000 次体验额度，不作当前官方报价 |
| 微信小程序 `wx.login`/code2Session | 微信官方原文无法读取 | **调用价格/配额待官方核验** | 不等于零元正式上线：主体认证/备案/域名与可信桥接成本独立 |
| Supabase Auth | 官方 Phone sign-in、Send SMS Hook、Rate limits | Phone Auth 会话由 Supabase 签发；SMS 供应商另计；Free Hook 可用 | 项目具体免费额度与超额价格另按当前实际账户核验，不能将 MAU 免费额度视为短信免费 |
| 邮箱备用 | Supabase 官方 rate limits | 内建邮件 **2 封/小时/项目** | 公开登录须自有 SMTP/邮件 Hook、国内送达测试及反滥用；费用待服务商核验 |

### 3.2 月活与验证码请求量：不要混淆

**假设**每位 MAU 每月成功登录需要 1 次或 3 次短信验证码请求，所有请求都是国内 1 个计费条；未计发送失败、重试、短信长度拆分、恶意请求、运营商限制、认证/域名/人工维护费。这里是**短信变量成本模型**，不是正式全包 TCO，也不是用户必然每月登录一次的预测。计算公式：`月 SMS 请求数 = MAU × 人均每月 SMS 请求数`。

| MAU | 1 SMS/MAU：月请求 | 阿里按量 ¥0.045 | 腾讯预付包所需最低采购 | 3 SMS/MAU：月请求 | 阿里按量 ¥0.045 | 腾讯预付包所需最低采购 |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 100 | ¥4.50（账面按量，不代表零门槛开通） | ¥50（买至少 1,000 条，剩余可后用） | 300 | ¥13.50 | ¥50（剩余可后用） |
| 1,000 | 1,000 | ¥45 | ¥50 | 3,000 | ¥135 | ¥150 |
| 10,000 | 10,000 | ¥450 | ¥470（10,000 条 × ¥0.047） | 30,000 | ¥1,350 | ¥1,410（30,000 条 × ¥0.047） |

腾讯云数字是**一次采购现金流**，未用余额可在有效期内继续消耗；阿里数字是官方按量公式测算，是否可开通/充值另核，不能直接比较为“腾讯每月必付 ¥50”。腾讯套餐可能出现发送拆分与运营商计费条数不同，最终账单以官方规则为准。

**D 混合例子（纯假设）**：若 1,000 MAU 中 30% 在 H5 每月请求 1 条 SMS，约 300 条/月，阿里按量账面 ¥13.50/月，腾讯最少需先采购 ¥50 包（剩余可留用）；10,000 MAU 则 3,000 条/月，阿里 ¥135/月、腾讯 ¥150 采购。B 纯小程序用户无需每次用短信 OTP，但**微信身份桥接费用/运维与 H5 恢复成本不可直接记 0**。

**短信滥用压力测试**：10,000 次恶意或失败短信请求在阿里 ≤10万阶梯可产生约 ¥450 的计费条成本（实际计费取决于发送/回执规则），所以每手机号冷却、IP/设备风险控制、项目级日上限、CAPTCHA、失败熔断与异常报警是上线必备，不是优化项。

**国际号码**：`+86` 外号码可以按 E.164 格式建模，但短信服务商对国家/地区、路由、签名和费率各不相同，不能将国内 ¥0.045 适用国际号码。腾讯云官方国际短信按国家计价，套餐自定义最低 ¥50，需核验目标国家覆盖与实际送达。首版可明确只支持 +86，境外用户使用其他正式认证/恢复渠道；不可用昵称兜底。

## 4. 工程与安全：为什么 A “更容易”但不等于“零开发”

### A Phone OTP：建议的受控流程（只设计）

`phone input (E.164) → risk/captcha + project budget → Supabase signInWithOtp → verified regional SMS Send SMS Hook → provider API/sign/template → user submits OTP → Supabase verifyOtp(type=sms) → native Auth session → GET /identity/me → resolve stable Profile + alias visibility → business RPC/RLS`。

服务端/数据库约束：手机号唯一性以已验证 Auth 身份为准；旧 Profile 必须在用户证明旧 Auth 控制权后**显式绑定**，不得按手机号/昵称猜测；Admin 继续按 Auth UUID 独立授予和审计。`send_sms` Hook 处理 Supabase OTP 时须验证调用来源、保存服务商密钥仅服务端、对失败状态返回正确错误、不把 OTP 打进日志。不同国家/短信长度与运营商成功率需真机验证。

小程序适配：网络 fetch、存储、WebSocket 与 Supabase SDK 兼容性另做 P0 mock/isolated PoC；A 的“认证协议更简单”不等于 `supabase-js` 在微信运行时开箱即用。若使用后端中转，不能把 service_role 放客户端或绕过 RLS。

### B wx.login：身份验证易用，但会话桥接依然未知

`wx.login → backend code2Session → (app_id, openid) lookup → bound Auth UUID/explicit bind → supported Supabase session bridge (unproven) → GET /identity/me`。小程序用户不必每次输入手机号；但会话发行、刷新、退出、RLS、旧用户绑定均须通过 Gate 1/2，不能拿 `session_key`/OpenID 当 Auth token。

### C getPhoneNumber：号码取得不是登录

`user consents → 微信服务端核验手机号 code → phone proof → account link (requires verified old Auth or controlled recovery) → separate Supabase session path`。不得因手机号一致就自动把既有 Auth user 变成微信主体；每次成功调用可能计费且官方最新价格待核验。单独作为登录主方案不覆盖 H5/PC。

### D 混合：双端认证但同一业务用户

小程序 B，H5/PC A，旧账号双侧明确证明后绑定到稳定 `profiles.id`；同一微信身份/手机号只能绑定一个有效内部认证主体，冲突锁定并审计。**最难的是两套 Auth subject 映射、迁移与恢复，不是两个按钮。** G/老郑的赛事、记分、相册和 `platform_ops.admin_members` 独立回归，不能自动移植 Admin 角色。

### E 邮箱：无短信 PoC，不保证免费可用

保留 H5 可验证旧账号会话，允许用户主动绑定邮箱；邮件 Magic Link/OTP 在真实小程序中需要安全深链/回跳处理，国内邮箱服务商送达、反滥用、SMTP/Hook 成本需验证。Supabase 内建 2 封/小时/项目，不应作为大规模生产登录方案。

## 5. 安全与合规验收矩阵（正式上线硬门槛）

| Gate | 测试与证据 | 不通过时 |
|---|---|---|
| SMS-QUAL | 短信签名主体为合规大陆公司或取得有效授权，资质/签名/模板/运营商报备通过；供应商实际发送权限 | 禁止 A/D 国内正式发送 |
| SMS-HOOK | Supabase Send SMS Hook 与选定国内商 API 的签名验证、异常/重试、模板/密钥管理、日志脱敏、限流及预算熔断；使用隔离测试账号 | 禁止短信上线；不改成客户端直连云短信 |
| SMS-AUTH | `signInWithOtp`→短信到达→`verifyOtp` 返回可刷新 Supabase Session，RLS/Storage/Realtime 正确 | 不宣布已实现跨端认证 |
| PHONE-RECYCLE | 旧号注销/换号、SIM 交换、号码回收后不凭手机号继承高风险权限；G/老郑需旧凭据证明 | 阻断迁移和管理员功能 |
| WECHAT-BRIDGE | 微信 code 防重放、AppID 作用域、UnionID 可空、可信会话发行与撤销、RLS 对齐 | 禁止 B/C/D 微信正式登录 |
| ALIAS-RLS | 原 Auth/授权别名与稳定 Profile 可见性一致，不能放宽其他用户读取 | 阻断默认登录切换 |
| ADMIN | `platform_ops.admin_members` 仍按真实 Auth UUID 验证，G 的现有后台故障单独定位 | 不将管理员权限随 Profile 继承 |
| CROSS-DEVICE | 微信内/外 H5、iOS/Android 小程序、PC 的跨端绑定/退出/会话切换无串号，冲突不合并 | 阻断跨端统一身份发布 |
| COST-ABUSE | 100/1000/10000 请求的短信费用预算、项目总量上限、单号/设备/IP 限速、CAPTCHA、每日熔断 | 禁止开放公网发送 |
| PRIVACY | 手机号非必填的只读场景不强制收集；告知用途、最小留存、访问/删除、更换、第三方短信委托与日志脱敏 | 不发布 |
| WECHAT-QUAL | 小程序 AppID、主体/认证/备案、合法域名、微信手机号组件实际收费/权限，按官方后台核验 | 不购买/不上线微信功能 |
| INTERNATIONAL | 非 +86 号码的国家覆盖、资费、模板/送达及回退渠道有证据 | 不承诺国际号码可登录 |

## 6. 可决策的 PoC 顺序、里程碑与估算

- **Gate 0（零新增外部付费、只设计/离线模拟）**：用 mock SMS provider/微信 code、纯 TS 身份解析状态机、成本计算器、OTP 冷却/防刷状态、G/老郑绑定冲突 fixtures 做安全反例测试。估算 0.5–1.5 人日；不使用真实手机号/密钥，不开通短信/微信配置。
- **Gate 1A（须另行用户授权测试环境写入）**：仅隔离测试账号，使用 Supabase 本地/测试 OTP mock 验证 `verifyOtp`、Auth session/RLS/alias/退出、Taro 网络兼容；不能靠 Supabase 默认 SMS 服务真实发中国短信。估算 1–3 人日，不包括资质申请。
- **Gate 1B（须主体+付费+用户确认）**：选定合规国内短信商，完成资质/签名/模板及 Hook 的真实验证码收发、失败处理、费用限额，核验 2 个以上运营商和弱网；资质时间不可承诺。
- **Gate 2B（须另行授权微信环境）**：真实 `wx.login` → 后端 code2Session → 受支持 Auth session → 旧 Profile 绑定；如桥接不可行，不能降级成不安全自制 JWT。
- **决策检查点**：先确认“是否有合格国内短信主体”和“小程序是否主要入口”；再分别用 A 的 Auth PoC 与 B 的桥接 PoC 实测难度，依据真实 TCO 与可用性确定 A、B 或 D。C 仅可作为有充分业务必要性、官方费用可接受的辅助绑定方式。
- **正式设计候选完成条件**：入口策略、短信/微信/邮箱路线选择与回退、旧用户迁移、API 契约、资质费用、风险/验收矩阵及未决事项已由主 Chat 合并并审查后，可标 `DESIGN_COMPLETE_CANDIDATE`；但 `SESSION_BRIDGE_UNPROVEN`、`SMS_DOMESTIC_QUALIFICATION_UNPROVEN` 等仍是**实施/发布 blocker**，设计完成不代表微信登录上线。

## 7. 给交互式主 Chat 的文档级 PATCH_PACKAGE（本任务不得执行）

1. `docs/research/miniprogram/wechat-login-options.md`：新增 A/B/C/D/E 五路线跨端矩阵；纠偏“Phone OTP 原生 Auth session / 微信手机号授权非登录 / 微信 code 桥接未知”；按主体条件排序。
2. `docs/research/miniprogram/identity-architecture.md`：新增手机号已验证身份映射与旧 Auth/Profile 主动绑定、手机号回收/换号/高风险动作再认证；短信发送 Hook 只做发送，不能当 Auth 签发器；保留 `SESSION_BRIDGE_UNPROVEN`。
3. `docs/research/miniprogram/legacy-user-migration.md`：G/老郑旧 Auth 控制权证明、Admin 单独 JWT/RPC 检查、不能按手机号/昵称/头像合并、个人相册路径/存储权限回归。
4. `docs/research/miniprogram/mini-program-feasibility.md` 与 `miniprogram-implementation-prd.md`：增加 SMS-QUAL/SMS-HOOK/SMS-AUTH、微信桥接 Gate 0/1/2、H5+小程序双入口成本与功能验收，不覆盖 H5 P3。
5. `docs/research/miniprogram/official-sources.md`：记录 2026-10-21 官方价格/资质/限流/Hook 证据及微信手机号价格未核验状态。
6. `docs/research/miniprogram/handoff.md`：新增用户决策点、阶段门槛和本 handoff 消费引用，保留现有四份待消费成果并按主题去重。

**消费计划**：主 Chat 读取本文件与四份已有 handoff → 重查 HEAD/现有文档 → 合并内容和费用假设 → 如需写 GitHub 设计文档先取得用户授权，再低频一次性提交；开发、测试库写入、微信资质/付费另行取得授权。只有主 Chat 完成写入并回读验收后才可移动 handoff 至 consumed。当前任务不移动、不修改任何系统。

**待用户未来确认（此轮不交互、不擅自代选）**：是否拥有中国大陆企业主体/短信签名授权；微信小程序拟采用何种主体及 AppID；目标是国内 +86 优先还是必须国际号码；预计小程序/H5 活跃比例与登录频次；能否接受少量人工旧账号恢复；是否允许未来隔离测试环境真实 PoC；是否正式商业运营。

## 8. 官方来源与可核验性（均于 2026-10-21 查阅）

- Supabase Phone sign-in（原生 OTP/Session、短信商配置）：https://supabase.com/docs/guides/auth/phone-login
- Supabase Send SMS Hook（地区供应商/自定义 Hook，Free/Pro）：https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook ; https://supabase.com/docs/guides/auth/auth-hooks
- Supabase Rate limits（项目短信量、每用户重发窗口、IP/verify 限流）：https://supabase.com/docs/guides/auth/rate-limits
- Supabase Email OTP/Magic Link：https://supabase.com/docs/guides/auth/auth-email-passwordless
- 阿里云国内短信价格（2026-05-20 起）：https://help.aliyun.com/zh/sms/product-overview/notice-on-price-adjustment-for-domestic-sms-services-2604
- 阿里云资质与个人自用限制：https://help.aliyun.com/zh/sms/user-guide/qualification-application-description/
- 阿里云短信签名来源限制：https://help.aliyun.com/zh/sms/user-guide/sms-signature-faq
- 腾讯云国内/国际短信价格（页面 2026-08-11 更新）：https://cloud.tencent.com/document/api/382/8414
- 腾讯云实名资质（2026-09-18 更新，个人自用不可用）：https://cloud.tencent.com/document/product/382/108274
- 微信官方手机号文档（本轮打开失败，**不可视为官方价格已核验**）：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html ; https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-info/phone-number/getPhoneNumber.html
- 微信官方小程序登录候选（本轮无法直接读取，待真机/官方后台核验）：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html

**本轮不能证实的事项**：微信手机号组件 2026 最新定价/赠送额度/资质；微信小程序主体认证/备案/域名的适用费用；项目是否已有合格短信签名主体；Supabase 测试项目是否已经开通 Phone Auth/SMS provider；阿里云按量业务实际开通最低充值；+86 与国际短信实测送达率；微信 session bridge 真实可行性。全部保留为阻断或待核验，不作零成本承诺。

## 9. 结束状态

STATUS=DESIGN_EVIDENCE_CONSUMED。研究形成明确的 A/B/C/D/E 条件排序、官方短信价格、国内签名主体硬前提、100/1,000/10,000 规模成本、零新增付费 PoC、合规与安全验收门槛和文档级 PATCH_PACKAGE。**此文件内容不预先声称 Library 上传成功；仅以工具上传回执与回读为准。**本轮不写 GitHub/Supabase/Vercel/微信，不付费、不部署、不改地图 P3。