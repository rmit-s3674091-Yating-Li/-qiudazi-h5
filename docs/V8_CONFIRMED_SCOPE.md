# 球搭子 V8 已确认开发范围

本文件是 V8 当前“哪些内容已经由用户明确确认进入开发”的单一范围真源（scope canonical）。它只回答 V8 scope，不替代既有专项产品基线、实现代码、测试证据或运行时事实。

## 当前确认数量

**V8 已确认开发项共 5 项。**

任何自动化、handoff、主 Chat、代码审查或治理材料不得再使用“4 个确认项”作为当前口径。旧材料中出现的“四项”仅作为历史上下文，不得用于判定 scope creep。

## 五个确认开发项

### V8-01 参赛者记分

目标：实际参赛者可以为自己参与的有效比赛记分，同时保留 organizer 的异常纠正能力。

核心边界：

- 参赛者只能操作本人实际参与、仍有效且允许记分的比赛；
- JWT/actor 必须由服务端可信验证，不信任浏览器传入 actor identity；
- 记分必须保持 version / idempotency / operation replay / conflict safety；
- 双方同时记分、弱网、重复点击、stale version 必须可安全恢复；
- organizer 异常纠正继续存在；高风险最终结果修改需要更严格权限、原因/确认及审计；
- UI、Edge/server transaction、数据库授权与测试必须形成完整闭环。

### V8-02 赛事详情页 Tab 选中态强化

目标：赛事详情中间的半页导航（例如“赛事 / 参赛 / 对阵 / 排名 / 合影”）当前项更明显。

核心边界：

- 指赛事详情页内部 tab/menu bar，**不是底部全局 menu bar**；
- 可使用加粗、适度字号/图标变化、下划线等方式；
- 不得产生 layout shift、文字跳动或移动端溢出；
- 主体实现完成后进入验收/缺陷修复模式，不做无边界视觉扩展。

### V8-03 Quick Start 补齐“循环 + 淘汰”

目标：快速开赛也支持循环 + 淘汰核心赛制语义，与常规赛事共享核心规则。

核心边界：

- Quick 可以简化配置，但不能删除核心赛制能力；
- group/round-robin + knockout 的晋级、分组与验证逻辑保持一致；
- 已完成主体后以 migration replay / integration / build / Browser 验收驱动修复为主。

### V8-04 Platform Admin 后台

目标：建设内部平台管理后台，而不是商业 Club 商家后台或通用数据库编辑器。

首版范围：

- 管理员登录/角色/权限；
- 用户管理；
- 赛事管理；
- 比分与结果异常处理；
- 照片与内容治理；
- Venue / Commercial Organization 管理；
- 举报与反馈；
- 操作审计。

核心边界：

- mutation 必须 server-side reauthorize；
- 最小权限；
- 必要 reason/confirm；
- 业务变化与 audit 在同一受控事务；
- 高风险动作不得只依赖客户端按钮隐藏；
- Platform Admin 与未来 Commercial Organization SaaS/Admin 分离。

### V8-05 创建赛事的比赛场馆 / 地图选择体验

目标：把“创建赛事 → 选择比赛场馆 → 回填场馆/地址 → 必要时填写具体场地”做成可用、清晰、移动端友好的完整流程。

核心边界：

- 比赛场馆、地图定位、具体场地层级清楚；
- 地图是辅助，不显示技术型经纬度给普通用户；
- “使用当前位置”必须保留且容易发现；
- 地图高度不能挤占搜索、候选、当前位置与确认操作；
- 中文 POI 搜索支持简称、部分词和完整名称，必须实际验证如“奥森”“国家网球”“网球中心”“绿心”；
- 返回多个相关候选，不默认替用户选第一条；
- 已选赛事城市时必须严格城市约束，不得静默混入外地 POI；
- 百度 Place / Suggestion / Region / Reverse 等上游业务错误不能吞成“0 个结果”；
- 必须区分“确实无结果”和“搜索服务失败”；
- 无结果/服务失败时允许拖图、当前位置或返回手填场馆继续完成创建；
- 全球 fallback 若存在必须 bounded/city-filtered，不能污染中文结果；
- 地图确定的 provider/placeId/lat/lng 等可内部保存，但 UI 不展示坐标；
- “具体几号场/馆内区域”是独立可选文本，不参与地图 POI 搜索；
- 对标外卖/配送地址、打车目的地、本地生活 POI、系统 Location Picker、运动/场馆预约等成熟模式，仅用于改善本确认范围，不得顺势加入订场、支付、推荐算法或商业 SaaS。

## Scope 判定规则

1. 本文件优先回答“是不是 V8 已确认开发项”。
2. 上述 5 项范围内的缺陷修复、必要 UX 对标和测试属于合法 V8 工作，不属于 scope creep。
3. 研究候选（Social Club、商业化、会员、排行榜、完整 Commercial Organization SaaS 等）不会因为被研究过自动进入 V8 开发。
4. 新增第 6 项及以后必须经过用户明确确认，并同步本文件。
5. 旧 handoff/旧聊天/旧 V7 文档中与“五项”冲突的数量描述，按历史材料处理，不覆盖本文件。

## 与旧 V7 文档的关系

V7 canonical / Workboard / PR #24 ledger 继续作为 V7 历史与继承规则来源，但**不能用于判断 V8 当前确认项数量和 V8 scope**。V8 开发分支上的 automation 应先读取本文件与 `docs/V8_CURRENT_STATE.json`，再按需要读取 V7/专项基线作为继承背景。

## 跨端实施路线同步（2026-10-27）

H5 保留，小程序以 Taro 4 + React/TypeScript 并行建设；既有离线 PoC 授权不新增第六项产品范围，也不等于正式登录/发布授权。跨端技术决定由 [小程序实施 PRD](research/miniprogram/miniprogram-implementation-prd.md) 维护。V8-05 当前保留百度 Web API，腾讯第一替代候选、高德第二；本轮不更换供应商、不重构百度 H5 JS API、不改生产地图。未应用补丁不得因研究已融合而标为代码完成。
