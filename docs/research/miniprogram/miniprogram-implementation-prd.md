# 球搭子｜小程序与 H5 统一身份设计 PRD（研究融合版）

> 状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL；不等于已批准开发、登录可用或可发布。基线：feature/v8-confirmed-20261011，39e17fe。2026-10-23 Chat 融合七份研究。
> 先行阅读：本目录 handoff.md、identity-architecture.md、wechat-login-options.md；历史两份 identity-architecture-and-cost.md 和 framework-reuse-matrix.md 保留。

## 目标与边界

H5 与微信小程序并行，共用既有 Supabase 业务数据、稳定 public.profiles.id 和纯 TypeScript 赛事/记分规则。小程序 PoC 首选 Taro 4 + React/TS；小程序导航、地图、拍照上传、存储、网络认证需单独适配，不假设现有 React Router/Leaflet/DOM 可运行。小程序不搬 Platform Admin，V8 当前五项已确认开发范围不自动扩大。

P0（可另行批准的零新增外部订阅费用本地 PoC）：模拟登录/会话适配、跨端 NavigationIntent 与六类邀请解析、赛事/Quick Start/参赛记分共享纯 TS 规则、地图和媒体 Adapter、冲突和账号切换测试。模拟通过不等于真实微信登录通过。

P1（需另行授权 TEST 集成）：赛事大厅/详情、创建和 Quick Start、参赛者记分、赛事分享打开→登录→回跳→加入/拒绝、球搭子邀请及历史 Player 认领、最小场馆选择与手填 fallback、保护赛事照片的读取。更多高级相册、PC 后台迁移、订阅/支付均延期。

## 未定的登录决策

- 若具备中国大陆合规短信签名主体且重视 H5、小程序、PC 一致性：优先验证 Supabase Phone OTP + 国内 SMS Hook；短信提供商不是免费默认服务，号码持有权不自动等于历史 Profile 所有权。
- 若无合规 SMS 主体且小程序为主入口：优先验证 wx.login → 服务端 code2Session → 可信身份绑定 → **受支持、可刷新** Supabase Auth Session；目前 SESSION_BRIDGE_UNPROVEN，不能直接上线。
- 混合和邮箱恢复只能在费用、国内送达、绑定安全及维护复杂度经过证明后纳入；微信 getPhoneNumber 不是独立的 Supabase 登录会话。具体费用与官方资质尚待后台核验。

## 登录与账号安全不变量

必须由服务器验证真实凭据；OpenID 只在 AppID 内唯一，UnionID 可能缺失；昵称/头像/同名/手机号相似不自动合并。保留旧 Auth UUID 与历史审计、业务 Profile ID、照片和赛事外键。需同批审查 test-identity-exchange、guest-session 与 complete_profile 昵称自动 alias 关联。profiles_self_read 与 current_profile_id/ensure_profile alias 可见性差异必须做正反例 RLS 测试。Admin 只按可信 auth.uid() 的独立权限校验，不因绑定原 Profile 自动赋权；G/老郑旧身份验证须有独立证明。

## 分享、邀请与进入登录的状态

跨端统一 NavigationIntent：逻辑类型与 token 安全分层；小程序 page path 与 H5 hash route 分别编码、解码。至少区分公开赛事详情、私有赛事预览、好友 connection invite、临时 Player claim、已有好友赛事邀请及普通登录回跳。分享链接绝不含 access/refresh token；需要登录时保留 intent，成功后以服务端权限恢复，并要求高影响邀请明确确认，过期/跨用户/重复调用失败关闭。

**E1 默认低 TCO 候选**：分享后登录先行，再查询既有 authenticated RPC；不是已批准产品结论。**E2 待用户确认**：匿名展示最小脱敏赛事预览，需要独立字段白名单、受控 RPC/Edge 与防枚举限流。现有 get_event_snapshot、get_private_event_preview、get_my_event_entry_id 的 anon 权限不支持直接匿名读取，绝不为省开发而赋予原业务 RPC 的 anon EXECUTE。

## 适配与成本门槛

Taro 网络/存储/WebSocket/上传 API 与浏览器 fetch/Blob 不等价；实现 TransportPort、SessionPort、MediaPort、StoragePort，再测试 Supabase JWT、RLS、签名 URL、头像路径及 event-photos 私有访问。当前相册原图与水印采用不同对象，不能为节约费用自行合并副本语义。地图小程序 Map/POI 与 H5 的 P3 修复独立；中文 POI 城市限制与手填 fallback 必测。

成本排序以安全、合规、用户可用性满足后的总拥有成本（资质、短信单价×实际使用次数、防刷、备案、域名、存储/调用量、维护）为准；正式金额无官方当期证据时标待核验。商业化不得依赖 Vercel Hobby 个人非商业免费套餐。不得自行采购、开通计费或调整套餐。

## 开发/验收 Gate

| Gate | 通过条件 | 失败后 |
| --- | --- | --- |
| G0 设计 | 用户确认登录主路径、E1/E2、主体与预算；来源及状态明确 | 不启动产品开发 |
| G1 离线 mock | Taro+TS 编译、身份绑定状态机、六类 NavigationIntent、并发与缓存隔离 | 修改 Adapter |
| G2 TEST 身份 | 真实受支持 Supabase Auth session，刷新/撤销、RLS/Storage/Admin 拒绝、旧用户正确绑定、无昵称接管 | 不启用正式登录 |
| G3 分享/隐私 | 受限操作登录回跳；若 E2 独立匿名预览、限流和隐私测试 | 不开放 anon RPC |
| G4 微信上线资质 | APP/小程序备案、主体/域名/隐私/中国真机、地图与文件 API | 不发布 |
| G5 业务闭环 | 创建→分享→登录→加入/拒绝→记分；G/老郑历史与 Admin 不串号；弱网和重复调用安全 | 不发布、不移 V8 Release Gate |

详细证据、协议草案、风险和失败恢复见本目录七份专题文档。