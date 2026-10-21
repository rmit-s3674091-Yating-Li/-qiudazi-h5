# 球搭子｜小程序框架选型与现有代码迁移矩阵（第二轮增量研究）

HANDOFF_ID=QD-MP-20261021-0608-framework-reuse-matrix  
STATUS=DESIGN_RESEARCH_ONLY  
CREATED_AT=2026-10-21T06:08:18+08:00  
BASE_REPO=rmit-s3674091-Yating-Li/-qiudazi-h5  
BASE_BRANCH=feature/v8-confirmed-20261011  
BASE_SHA=4117b1861eef11ea77fdd38591fefc1b15e726da  
PR=Draft #26（open；未纳入第六个已确认开发项）  
RESEARCH_SCOPE=小程序客户端框架选型、真实代码复用、运行时适配、地图/相册/记分验收、最低成本 PoC  
WRITE_MODE=LIBRARY_HANDOFF_ONLY; NO_GITHUB_SUPABASE_VERCEL_WECHAT_MUTATION  
SUGGESTED_TARGET_FILES=docs/research/miniprogram/mini-program-feasibility.md; docs/research/miniprogram/cross-platform-product-scope.md; docs/research/miniprogram/miniprogram-implementation-prd.md; docs/research/miniprogram/official-sources.md  
NEXT_ACTION=交互式主 Chat 先核对最新 HEAD、已有 handoff、用户授权范围后融合；不得自动执行开发/迁移/部署。

## 0. 本轮与首轮差异

已读取前轮 `/球搭子/V8/miniprogram-research/handoffs/20261021-0305_miniprogram-identity-cost-first-pass_4117b18.md`，本轮不重复用户身份模型/成本原则。最新远端 ref 仍为 `4117b1861eef11ea77fdd38591fefc1b15e726da`；Draft PR #26 仍 open。读取 `package.json`、`docs/V8_CONFIRMED_SCOPE.md` 和 13 个代表性源码文件，形成**有源码依据**的框架选择：**优先 Taro 4 + React/TS 建小程序独立 UI，保留 H5 现有 Vite/React Router，不强迫整站转 Taro；原生微信小程序为技术兜底；uni-app 不优先。**这是设计候选，未做编译/真机 PoC，不能视为已验证可行。

## 1. 代码资产清点（只读、文件数不等于可复用比例）

在当前 HEAD 的 Git tree 中统计：`src/pages/` 22 个文件、`src/components/` 21 个、`src/domain/` 41 个、`src/repositories/` 2 个、`src/hooks/` 3 个。注意这只是路径数量，**不是已证明的迁移成功率**。

代表性源码的可迁移判断：

| 现有模块 | 已见代码依赖/特征 | 小程序复用判定 | 需要的动作 |
|---|---|---|---|
| `src/domain/ScoringEngine.ts` | 仅引用领域 types/ensure；未见 DOM/浏览器 API | **高优先级直接验证** | 单独 TS 构建、相同评分单测在 Node/Taro 执行；不能以静态阅读替代编译证明 |
| `src/domain/QuickGroupConfig.ts`、`ParticipantPointReceipt.ts` | 未见浏览器/React 依赖 | **高优先级直接验证** | 规则与幂等收据逻辑共享、双端相同 fixture |
| `src/domain/VenueSelection.ts` | 引用 `../utils/mapProvider` 类型 | **需要解耦类型** | 提取纯 POI/场馆 DTO，避免运行时误加载浏览器地图模块 |
| `src/domain/IdentitySession.ts` | 文件内部无 import，但封装了传入 storage 的清理逻辑 | **逻辑部分可复用** | 以跨端 StoragePort 替换隐含 localStorage 语义；不能把旧昵称认证复用为正式登录 |
| `src/pages/QuickStartPage.tsx` | React hooks、`react-router-dom`、浏览器组件、直接仓库调用 | **页面需重写** | Taro Page + 路由 + 表单/导航/校验 adapter，保留纯业务规则 |
| `src/pages/EventPage.tsx` | `Link/useNavigate/useParams/useSearchParams`、Web 地图、UI 组件 | **页面需重写** | 小程序页面栈、分享 path、map、状态缓存等独立适配 |
| `src/components/UI.tsx` | React Router、`window` | **不可直接复制** | 以 Taro View/Text/Button/导航组件实现新 UI，保持交互规范而非 DOM |
| `src/hooks/useQuery.ts` | `window`/`document` 事件与可见性轮询 | **拆分复用** | 抽离查询状态机，使用小程序 onShow/onHide/网络状态驱动轮询 |
| `src/repositories/supabase.ts` | `@supabase/supabase-js`、`localStorage`、浏览器默认 fetch/WebSocket/上传 | **接口契约可复用，运行时实现不能照搬** | `RepositoryPort` + H5 adapter + 小程序网络/存储/WS/上传 adapter，先证明 SDK 可用 |
| `src/utils/mapProvider.ts`、`src/components/EventVenueMap.tsx` | 浏览器 `navigator`、Leaflet、`window/document` | **地图实现不能直接复用** | 微信 `<map>`/Taro Map + POI Search Adapter；H5 地图专项独立不改 |
| `src/components/TournamentPanels.tsx` | 图片 `Blob`/水印、上传、Router | **逻辑/数据复用，文件 UI 重写** | 微信 `chooseMedia`/本地临时路径/`uploadFile`/Canvas/保存权限单独验证 |

重要判断：即使选择 Taro，**React 语法可延续不等于 DOM、React Router、Leaflet、浏览器 Supabase SDK 可运行**。应采用 `packages/shared-domain`（纯 TypeScript、无 `window`/`document`/`wx`）与两个客户端 adapter 的边界，而非把现有 H5 整站搬迁。

## 2. 框架横向比较（当前项目特定）

| 维度 | Taro 4 + React/TS | 原生微信小程序 | uni-app（Vue） |
|---|---|---|---|
| 许可证/框架采购 | 官方仓库 MIT，框架使用本身无需付费 | 微信平台基础开发框架，工具可用于 PoC；上线资质另核 | 官方协议框架可免费使用，开源部分 Apache-2.0，商业插件/其他服务另计 |
| 现有 React/TS 规则 | 纯 TS 可共享；React hooks 心智一致 | 纯 TS 可共享，UI 需原生 WXML/WXSS 重写 | 纯 TS 可共享，但 React 组件无法按原样运行；Vue 页面重写 |
| 当前 22 个 React 页面 | 大部分仍要改路由、标签、事件、UI 组件 | 全部重新实现 | 全部转换 Vue SFC |
| 地图/相册/分享 | Taro 封装微信组件与 API，但平台差异仍需测试 | 微信 API 直接，平台控制最强 | uni API 适配，微信原生能力仍需差异验证 |
| 工程/维护 | 新增 Taro 构建、兼容层；可复用部分 TS | 新增微信原生技术栈，双 UI 维护 | 引入 Vue 技术栈，双 UI 维护、团队学习成本 |
| 适配其他小程序平台 | 有潜力 | 低 | 有潜力 |
| 当前建议 | **首选零成本 PoC** | **若 Taro 关键功能无法达标的兜底** | **不优先** |

决定性新证据：uni-app 官方文档明确其 JSX/TSX 在**小程序平台不支持**（H5-Vue3/App-Vue3 支持）；球搭子现有 `tsx` React 页面不能通过「uni-app 也支持 TSX」来推断低成本复用。Taro 官方明确 React 支持，同时提示小程序 React API 与浏览器 DOM、路由、Portal/lazy 有差异。Taro 不是零迁移成本。

### 2.1 为什么不建议把现有 H5 改造成一个 Taro H5 构建

现有 H5 已运行、V8 五项仍在验收，强制替换 H5 构建链会扩大影响面；两端**共享 domain / DTO / server RPC contract**，H5 保持原 UI、路由和地图，新增小程序独立 `apps/wechat-mini`。未来如确有成本收益再评估 UI 合并，不作为 MVP 前置任务。

### 2.2 建议 monorepo 草图（非代码写入）

```text
apps/h5/                 # 现有应用，初期保持路径和构建不动
apps/wechat-mini/        # Taro 4 React/TS 小程序客户端（未来用户批准后创建）
packages/shared-domain/  # 规则、类型、DTO、状态机（仅无平台依赖代码）
packages/shared-api/     # 请求契约、错误映射、幂等/版本控制
packages/platform-ports/ # StoragePort, NetworkPort, MapPort, MediaPort, AuthPort
```

建议**先通过 TS path alias / 小范围复制验证**，不要为了 PoC 先搬移原 H5 所有文件或大规模改 monorepo。所有正式重构由 Chat 经用户授权后低频批量提交。

## 3. 小程序最小页面路线图与边界

P0「只读/无真实账号 PoC」：赛事大厅列表（mock）、赛事详情（mock）、Quick Start 表单（mock）、记分规则单测、微信 Map 展示 + 假 POI 候选、分享路径解析（mock）、媒体选择/上传接口契约（mock）。所有内容在本地/开发工具模拟；不接触线上身份和业务数据。

P1「真实账号/测试环境闭环（需另行授权）」：微信 `wx.login` 后端验证与可信 Supabase session 桥接、真实赛事大厅/详情、加入赛事、创建赛事、参赛者记分及重放/冲突处理、受控邀请链接。G/老郑历史数据与管理员权限须独立回归，不把后台权限问题混为微信登录问题。

P2「增强」：场馆中文 POI 搜索 + 拖图/定位/手填 fallback、照片上传/保存/水印、微信分享与订阅消息、跨端账号绑定/恢复体验。小程序端的地图验收用自己的 test matrix；不覆盖当前 H5 P3 地图专项。

Platform Admin 初版继续 H5，减少小程序额外管理 UI 和高权限入口。

## 4. 最小技术关口：阻断真实上线的 6 项验证

1. **Taro 编译**：小程序构建成功；纯 TS scoring/Quick group 与 H5 单测结果一致；没有 `window/document` 或浏览器路由引用进入 mini bundle。
2. **网络**：微信小程序合法域名分别覆盖 `request`、`uploadFile`、`downloadFile`、`socket`；检查 TLS、备案/域名资质、中国真机可达性；不把开发工具「不校验合法域名」当上线能力。腾讯云 2026-02-11 官方网络说明明确域名分类与 HTTPS/WSS 限制。
3. **Supabase**：官方 `supabase-js` 在小程序的 `fetch`、storage、WebSocket、Blob/FormData 能力不能假设可用；先验证自有最小适配器或已审计的兼容库。第三方 `supabase-mp-js` / `supabase-taro` 仅作为候选，不能未经代码、安全、版本维护审查就用于生产。小程序不能持有 service_role 或微信 AppSecret。
4. **记分安全**：两人并发、离线恢复、重复提交、过期 version、客户端重放，服务端仍负责 JWT/actor、权限和幂等。小程序 `onShow`/网络恢复不得重复提交已成功记分。
5. **地图**：Taro 官方 Map 组件支持微信小程序及 markers/regionchange，但这只证明可渲染地图，**不等于有中文 POI 搜索服务**；POI 搜索、城市边界、候选列表、失败区分、手填 fallback 必须单独验证。与 H5 当前百度/Leaflet 实现隔离。
6. **媒体与隐私**：微信选择媒体、临时文件、上传、保存到相册、水印、用户授权与失败处理都要真机测试；公开分享不能泄露私有赛事、私人相册或受保护照片。测试应覆盖 iOS/Android、微信新旧基础库、弱网、拒绝授权。

## 5. 成本与决策门槛（仅新增研究内容）

- **框架许可证成本**：Taro MIT；uni-app 框架免费使用，开源部分 Apache-2.0；原生微信小程序开发框架可用于离线 PoC。以上不意味着微信平台资质/认证、域名、后端流量、地图 POI、存储、运营都免费。
- **最低总拥有成本排序（以当前 React/TS 项目为前提，未经 PoC 证实）**：Taro React 优先、原生作为 fallback、uni-app 最后。**不能凭页面数声称节省百分之多少**；应以小程序 P0 编译、API 适配、测试维护工时来量化。
- **0 元 PoC**：只使用既有代码、开源构建工具、mock 数据与本地开发工具，不购买 AppID/认证、地图 POI 商业接口、付费 Supabase/短信、第三方 SaaS。PoC 可验证编译、规则复用和交互，不证明微信正式登录或真机发布。
- **未来可能付费但不预支**：微信主体认证与备案、合法域名/ICP 及证书、商业化托管、地图 POI、短信/通知、Supabase 免费额度超限；均需官方原始价格和当前账户资质确认，未经确认标 `待官方核验`。
- **不可通过省钱绕过**：账号安全、微信小程序合法域名、个人信息保护告知/授权、服务端校验、数据备份与回滚。

## 6. Chat 可直接消费的 PATCH_PACKAGE（设计文档层）

PATCH_PACKAGE_ID=QD-MP-PATCH-20261021-0608  
PATCH_TYPE=DOCS_ONLY_PROPOSAL  
STATUS=CHAT_WRITE_REQUIRED

建议在 `docs/research/miniprogram/mini-program-feasibility.md` 增补「Taro React 为 PoC 首选、原生兜底、uni-app 不优先」及源码依据矩阵；在 `cross-platform-product-scope.md` 增补 P0/P1/P2 页面边界；在 `miniprogram-implementation-prd.md` 增补六项技术关口与验收标准；在 `official-sources.md` 追加下列官方证据。**不是 SQL、不是代码变更指令。**

消费流程：Chat 读取前轮 handoff 与本轮 → 核对最新远端 SHA、当前 scope 与重复内容 → 仅经用户授权后写设计文档 → 记录 commit/文件校验及差异 → 完成后方可标记 consumed；若不写仓库，保持 handoff 待消费即可。

## 7. 官方证据与复核状态（2026-10-21）

- 当前仓库 Git ref： https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/tree/feature/v8-confirmed-20261011 （实际 SHA 如上）
- 当前 scope： https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/blob/feature/v8-confirmed-20261011/docs/V8_CONFIRMED_SCOPE.md
- Taro 4 官方介绍（React/TS 多端）： https://taro-docs.jd.com/docs
- Taro React 小程序限制： https://docs.taro.zone/en/docs/react-overall
- Taro Map 组件（不包含 POI 搜索保证）： https://docs.taro.zone/docs/components/maps/map
- Taro 官方代码与 MIT License： https://github.com/NervJS/taro
- uni-app 官方框架与 Vue SFC： https://uniapp.dcloud.net.cn/tutorial/index.html
- **uni-app 官方 JSX/TSX 小程序不支持**： https://uniapp.dcloud.net.cn/tutorial/syntax-jsx.html
- uni-app 官方许可协议： https://dcloud.io/license/uni-app.html
- 腾讯云小程序网络文档（更新日期 2026-02-11）： https://intl.cloud.tencent.com/zh/document/product/1219/61745
- Supabase 官方 JS SDK 文档： https://supabase.github.io/supabase-js/
- 仅作第三方候选（**非官方安全背书**）： https://github.com/vibeunion/supabase-mp-js

本轮未从微信官方后台取得小程序认证/备案实际收费、资质和生产域名校验，因此不将任何数值列为确定费用。

## 8. 结束状态

本轮形成新的、可复用的框架选型与源码迁移证据，不是重复首轮结论；建议下一轮聚焦「小程序 Supabase 网络/认证适配器的可实施 API 契约 + 真机验收矩阵」，尤其登录后如何安全取得托管 Supabase 会话（**尚未证实**），并检查已有 handoff 是否消费，避免重复。  
STATUS=CHAT_WRITE_REQUIRED；未触碰 GitHub/Supabase/Vercel/微信平台；没有产生费用。只有 Library 上传成功回执才可称 HANDOFF_STORED。