# 球搭子｜小程序与统一身份设计融合索引

**融合时间：2026-10-23。基线 SHA：39e17febc23d5732c867bb2244a02fd2d99e36a8。状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL。**

本页为设计唯一入口；专题文档保存可追溯原始研究/测试与官方线索，若与此页产品门槛冲突，按更严格的安全/合规 Gate 执行。设计已具备集中评审条件，**没有正式微信/短信登录、没有小程序代码落地、没有审批发布授权**。不更改 V8 已确认五项范围，也不触碰 H5 地图 P3。

## 本次 7 份 Library handoff 的消费映射

| 源研究批次 | 仓库设计文档 | 要点 |
| --- | --- | --- |
| 20261021-0904 alias/RLS | identity-architecture.md | RLS alias、昵称接管、Admin Auth UUID |
| 20261021-1212 binding/recovery | legacy-user-migration.md | 显式绑定、冲突恢复、跨端会话隔离 |
| 20261021-1511 session bridge | session-bridge-poc.md | 官方认证能力、Gate 0–2、可刷新 session 阻断 |
| 20261021-1808 network/media | network-media-adaptation.md | Supabase/Taro 运行时、Storage/相册成本 |
| 20261021-2112 phone OTP vs WeChat | wechat-login-options.md | 短信资质、成本与不同入口选择 |
| 20261022-0010 MVP invites | cross-platform-product-scope.md | P1 分享邀请、六类 intent、回跳 |
| 20261022-0307 share/filing | mini-program-feasibility.md | 匿名 RPC 不可达、E1/E2、备案、收口 |

综合开发入口：miniprogram-implementation-prd.md。保留此前已经消费的 identity-architecture-and-cost.md 与 framework-reuse-matrix.md；不重复另建产品范围事实源。

## 尚未解决的用户/技术决策

1. 微信小程序的申请主体、已有 AppID、可用域名、备案及审核能力；是否商业化。
2. 是否已有合规中国大陆短信签名主体/授权；手机号 OTP 与微信主登录方案按不同主体条件选择；国际号码是否必需。
3. SESSION_BRIDGE_UNPROVEN：真实 wx.login/code2Session 不等于可刷新的 Supabase Auth session。
4. ALIAS_RLS_COMPATIBILITY_GATE + TEST_NICKNAME_RETIREMENT_GATE + ADMIN_AUTH_SEPARATE_GATE：历史身份与权限迁移。
5. 分享体验 E1 登录先行，还是 E2 最小脱敏匿名预览。
6. 实际网络/媒体/地图合法域名、APP 备案、国内真机和成本账单，尚未最终核验。

**下一步**：先 G0 产品/安全/成本评审，再经单独授权开展本地 0 元外部采购 PoC；真实 TEST Auth、迁移、备案、付费及部署每一阶段单独审批。Library 研究只有仓库回读成功后才能归档 consumed。
