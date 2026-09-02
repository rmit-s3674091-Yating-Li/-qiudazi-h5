# 球搭子｜Unit Test / 白盒单元测试基线

> 状态：当前 H5 MVP 的单元测试专项 canonical baseline。目标不是追求机械覆盖率，而是把高风险纯业务规则变成可重复、可自动执行的确定性测试。

## 1. 为什么需要 Unit Test
代码审计负责发现结构、权限、并发和逻辑风险；Unit Test 负责把关键纯逻辑规则固化成可重复证据。两者互补，不能互相替代。

P0/P1 高风险纯逻辑如果只依赖人工白盒阅读或 Browser E2E，容易出现：规则改动后没人注意、边界条件回归成本高、同一业务规则在多个页面表现不一致。

## 2. 当前测试边界
优先测试可确定、无外部副作用的 domain logic：
- 网球 ScoringEngine；
- point → game → set → match 推导；
- Advantage / No-Ad；
- 抢七；
- Point Log replay / voided point；
- 最终盘分合法性；
- 后续应逐步纳入 RankingEngine、EventRules、draw/ranking 的纯函数部分。

以下能力不以 Unit Test 单独证明正确：
- Supabase RPC/RLS/Storage/Edge 权限；
- 多用户真实并发与网络超时；
- Browser UI/Visual/可点击性；
- release-candidate 部署一致性。
这些继续由 clean replay、白盒代码审计、黑盒 Browser、Security audit 和 Gate 覆盖。

## 3. 当前执行方式
项目不额外引入测试框架依赖。`scripts/unit-test.mjs` 使用仓库已有 TypeScript 编译器，将真实 domain TypeScript 源码临时转译后直接执行 Node `assert` 测试。

命令：

`npm run test:unit`

CI：`.github/workflows/unit-tests.yml` 在 PR → main 与 main push 时自动执行。

任何测试失败都必须阻止把该 exact head 当作可验证 candidate。

## 4. ScoringEngine 当前必测场景
1. Advantage：40:40 → Deuce → AD；对手追回后回 Deuce；必须连续领先两分才能赢局。
2. No-Ad：40:40 显示金球，下一分直接赢得该局；不得进入 AD。
3. No-Ad 只改变普通局，不改变抢七；抢七仍须达到目标分且领先 2 分。
4. Point Log replay 必须忽略 voided point，并从日志重新推导同一 live state；UI 不得维护第二真源。
5. Direct score 与 Live score 必须共享同一 set/match 合法性；例如 6:3 可结束 games_6 的一盘，6:6 不能直接成为完成盘，7:6 必须带合法抢七小分。

## 5. 新规则的测试联动
下列变更在代码提交前应优先增加/更新 Unit Test：
- tennis scoring rule；
- ranking / qualification / draw 纯逻辑；
- lifecycle 中可抽成纯函数的状态决策；
- 数据格式化若直接影响业务事实；
- 曾经发生过 P0/P1 回归且能稳定复现为纯逻辑测试的缺陷。

UI spacing、颜色、文字视觉权重等不应硬塞进 Unit Test，应由 Visual/Browser QA 验收。

## 6. 白盒巡检职责
「球搭子代码变更巡检」每轮应：
- 读取本基线；
- 核对当前 exact head 的 Unit Test workflow 结果；
- 审计新/修改的 domain logic 是否已有对应测试；
- 对高风险可单测逻辑缺少覆盖的情况，区分“测试债务”与“真实产品缺陷”，不得无证据直接升级 P0；
- 不得用 Unit Test PASS 替代 RPC 权限、数据库事务、Browser 或 Release Gate 证据。

## 7. 当前发布要求
进入 Candidate 前至少要求：
- `npm run test:unit` PASS；
- H5 Build Check PASS；
- Supabase clean replay / migration parity PASS。

Candidate 之后继续执行 User Story 驱动黑盒测试。Unit Test 是白盒证据的一部分，不是完整 Release Gate。
