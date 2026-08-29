# 球搭子 H5

真实可部署、多人共享赛事数据的移动端 H5 MVP。

## Canonical sources

当前仓库中的可读源码是实现真源，主要位于 `src/`。旧 bundle restore/pack 机制仅用于历史兼容/回滚，不作为日常开发方式。

任何较大功能开发、页面重构、AI/Codex 生成代码或部署前审计，必须先阅读：

1. `docs/PRODUCT_BASELINE.md` — 当前产品/数据/流程规则（讨论后的最新基线）
2. `docs/INTERACTION_BASELINE.md` — 页面职责、交互与避免重复设计规则
3. `docs/VISUAL_DESIGN_BASELINE.md` — 长期视觉设计基线
4. `docs/P0_ACCEPTANCE.md` — 当前 H5 MVP 验收基线
5. 当前已验证源码、共享组件与 `src/styles.css`

若早期 PRD、页面规格、视觉 Demo、旧 bundle 文档与上述当前基线冲突，以当前基线和用户最近明确决定为准；设计原则本身保持稳定，不得因为重构、清理代码或 AI 重新生成页面而随意改写。

## Stable product principles

- User/Profile、Player、Connection 必须分离；姓名/昵称不是实体关联键。
- 先允许比赛和记录发生，人可以晚一点进入系统；临时 Player 的历史必须可保留并在真实用户加入后关联。
- 临时球搭子的完整历史档案可在后台持续积累，但前台不向创建者展开完整战绩；以“加入后解锁自己的完整档案/历史记录”形成自然转化。
- 双打以一个 Entry 表示一队，不能拆成两个独立报名人。
- 卡片代表实体，点击卡片进入实体详情；编辑、邀请、删除、报名、管理等属于明确动作。
- 同一业务对象只有一个主要职责入口：赛事大厅负责发现赛事；创建/管理赛事归“我的赛事 → 我创建的”；战绩与赛事严格区分。
- 接受赛事邀请不等于完成报名；只有真正生成有效 Entry 才属于“我参与的”。
- 普通球搭子邀请与临时球搭子历史关联邀请都应有可追踪记录，但两种邀请的业务语义必须区分。
- 稳定数据不做高频轮询；优先缓存、stale-while-revalidate、页面重新激活后的按需刷新和写后精准失效。只有进行中的赛事/记分等真正实时场景保留较短刷新或未来 Realtime。
- UI 不暴露数据库/RPC/claim/merge 等内部实现术语。
- 不用前端隐藏按钮代替服务端权限；关键状态转换和权限必须由后端保证。
- 测试期昵称身份接管是受控测试方案，不是正式登录设计；正式用户体系后续接入微信等可靠身份。

## UI / UX rule

产品与视觉优先级：

1. 当前产品业务规则与真实数据模型
2. `docs/PRODUCT_BASELINE.md` / `docs/INTERACTION_BASELINE.md`
3. `docs/VISUAL_DESIGN_BASELINE.md`
4. 当前已验证页面 / 共享组件 / `src/styles.css`
5. 早期视觉 Demo

不要为了视觉效果展示数据库不存在的数据，不要把产品做成企业后台、电竞比分系统或模板化 AI App。

## Development hygiene

- 同一业务数据应复用统一 query/cache key，避免一个页面摘要和详情重复请求同一 RPC。
- 写操作后精准 invalidate 受影响缓存，避免为了“新鲜”重新高频轮询所有页面。
- 不保留已经被新路由/新组件替代的整套旧页面实现；死代码和旧术语应在大版本部署前清理。
- 数据库 migration 版本必须唯一且顺序清晰；新增字段必须完成 DB → RPC/repository → type → form → display 的全链路检查。
- 用户可见错误必须产品化，不直接暴露 Supabase/JWT/SQL/网络底层错误。
- 大版本部署前做一次综合审计；每小时 routine 只负责判定是否出现新的、尚未审计的大改，已覆盖同一 head 时不得重复审计。

## Build

```bash
npm install
npm run build
```

Vercel 与 CloudBase 构建应使用仓库中的当前可读源码。Vercel 限额或平台失败不能被误判为代码构建失败；中国区测试可按当前约定使用 CloudBase 手动部署 feature 分支，但未经真机/E2E 验证不要自动合并 `main`。
