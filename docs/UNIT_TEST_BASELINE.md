# 球搭子｜Unit Test / 白盒单元测试基线

> 状态：当前 H5 MVP 的单元测试专项 canonical baseline。目标不是追求机械覆盖率，而是把高风险纯业务规则变成可重复、可自动执行的确定性测试。下一版本 Scoring 规则以 `NEXT_VERSION_PRODUCT_BASELINE_20260902.md` 与 `TOURNAMENT_PRESENTATION_BASELINE.md` 为输入。

## 1. 为什么需要 Unit Test
代码审计负责发现结构、权限、并发和逻辑风险；Unit Test 负责把关键纯逻辑规则固化成可重复证据。两者互补，不能互相替代。

P0/P1 高风险纯逻辑如果只依赖人工白盒阅读或 Browser E2E，容易出现：规则改动后没人注意、边界条件回归成本高、同一业务规则在多个页面表现不一致。

## 2. 当前测试边界
优先测试可确定、无外部副作用的 domain logic：
- 网球 ScoringEngine；
- point → game → set → match 推导；
- Advantage / No-Ad；
- 抢七目标分与净胜边界；
- Point Log replay / voided point；
- 当前 Set / Game progress 推导；
- 最终盘分合法性；
- 后续应逐步纳入 RankingEngine、EventRules、draw/ranking 的纯函数部分。

以下能力不以 Unit Test 单独证明正确：
- Supabase RPC/RLS/Storage/Edge 权限；
- operation id 的数据库幂等事务；
- 多用户真实并发与网络超时；
- Browser UI/Visual/可点击性；
- release-candidate 部署一致性。
这些继续由 Integration、clean replay、白盒代码审计和后续独立 Browser 覆盖。

## 3. 当前执行方式
项目不额外引入测试框架依赖。`scripts/unit-test.mjs` 使用仓库已有 TypeScript 编译器，将真实 domain TypeScript 源码临时转译后直接执行 Node `assert` 测试。

命令：`npm run test:unit`

CI：`.github/workflows/unit-tests.yml` 在 PR → main 与 main push 时自动执行。

## 4. ScoringEngine 必测场景
1. Advantage：40:40 → Deuce → AD；对手追回后回 Deuce；必须连续领先两分才能赢局。
2. No-Ad：40:40 显示金球，下一分直接赢得该局；不得进入 AD。
3. No-Ad 只改变普通局，不改变抢七；抢七仍遵循配置目标分与净胜规则。
4. Point Log replay 必须忽略 voided point，并从日志重新推导同一 live state；UI 不得维护第二真源。
5. Direct score 与 Live score 必须共享同一 set/match 合法性。
6. `Set X · Game Y` 必须纯粹由 replay state 推导：Game 编号在赢局后递增、赢盘后下一盘重置为 Game 1。
7. 可配置规则至少验证：best-of/先赢盘数、每盘目标局数、净胜规则、抢七触发、抢七目标分、Advantage/No-Ad；未显式配置的新字段必须保持旧赛事 canonical 默认值。
8. Match 已结束后继续加 point 必须拒绝；赛中 Undo 与赛后 score correction 不可混为同一纯逻辑路径。

## 5. 下一版本 Scoring 回归联动
P1-A/P1-B 每次实现变更至少评估并补充：
- 快速连续 point 的本地 optimistic 推导与权威 replay 使用同一个 `addPoint/replay` 规则；
- 失败回滚后，从相同 Point Log 得到与服务端一致状态；
- 新 scoring parameter 的默认值与边界；
- tiebreak 长盘（例如超过目标分后仍需满足净胜条件）；
- 一局/一盘结束前后的 progress 过渡。

operation id、事务原子性、重复请求只落一条有效 Point Log 属于 Integration，不以 Unit 自证。

## 6. 白盒巡检职责
「球搭子代码变更巡检」每轮应读取本基线、核对 current exact-head Unit workflow，并审计新增/修改的 domain logic 是否有对应测试。缺测试应区分测试债与真实产品失败，不得无证据升级。

## 7. 当前阶段
当前是下一版本开发迭代，Unit/Integration 随实现持续运行；不运行 Release Gate 作为开发前置。谁实现谁不独立 VERIFIED。
