# 球搭子｜Integration / Contract Test Baseline

> 状态：canonical testing baseline。用于定义 Unit 与 User Story E2E 之间的集成测试层。下一版本 Scoring persistence 详细契约受 `NEXT_VERSION_PRODUCT_BASELINE_20260902.md` 与 `TOURNAMENT_PRESENTATION_BASELINE.md` 约束。

## 1. 测试分层
1. **Unit / Domain Tests**：确定性纯逻辑；见 `docs/UNIT_TEST_BASELINE.md`。
2. **Integration / Contract Tests**：模块、数据库、RPC、RLS、Storage、事务与状态契约协作；本文件为真源。
3. **User Story E2E / Blackbox**：真实用户关键业务闭环。
4. **Release Gate**：稳定候选阶段证明上述证据与 exact SHA 一致；当前开发阶段不把 Gate 当作前置。

原则：**问题应在能够稳定、快速拦截它的最低测试层被拦住。**

## 2. Integration Test 负责什么
重点包括 repository/RPC/schema 契约、migration clean replay、RLS/SECURITY DEFINER/execute grant/Storage policy、Event/Match/Photo/Profile 状态、optimistic version 与事务边界、返回 Snapshot、source/personal photo 解耦、Quick identity、privacy，以及下一版本逐分写入的 operation id / idempotency / ordered version chain。

网球纯规则计算属于 Unit；真实弱网点击体验、移动端 UI 与用户是否看懂 CTA 属于后续 User Story Browser。

## 3. 当前 P0/P1 集成契约

### IT-01 Migration / schema clean replay
- repo migration version 唯一且命名合法；live/repo parity 在候选阶段必须一致；clean DB 可完整 replay；
- `events.event_mode`、`events.game_scoring`、`cancelled` 等现有结构继续存在；
- 下一版本新增 scoring persistence schema/RPC 时必须兼容旧赛事与旧 Point Log。

### IT-02 Scoring persistence / idempotency contract
下一版本 P1-A 不再把 operation-key 视为可选未来项，而是正式高风险契约：
- Point Log 是 Live 唯一持久化真源；point / undo 完成后服务端返回足够的权威 Snapshot/版本事实；
- 每个 point mutation 带稳定 `operation_id`（或等价 idempotency key），其作用域必须至少能唯一绑定到当前 Match 的一次逻辑得分；
- **同一 operation_id 重放 2 次或更多次只能产生 1 条有效 Point Log**，并返回可收敛的同一业务结果；
- request timeout / response lost 后以同一 operation_id 重试，不得双记；不得要求客户端换新 id 猜测服务端是否已成功；
- 两个不同 operation_id 表示两个真实得分，必须按提交顺序形成连续 Point Log，并推进匹配的 event/match optimistic version；
- 同端快速连续点击可在 UI optimistic 排队，但后台持久化必须有序；不得因自己的前一笔尚未响应而使用过期 version 制造伪 `VERSION_CONFLICT`；
- 真实跨端并发使用旧 version 仍必须被服务端拒绝或按受控幂等路径收敛，不能为了性能跳过授权/version；
- point 持久化失败时不得留下“只有前端存在”的永久比分；刷新必须能够完全由 Point Log replay 恢复；
- Undo 只作用于最近有效 Point Log；重放 Undo 本身若支持 retry，也必须有明确幂等语义，不得连续 void 两分。

集成测试至少覆盖：首次 point 成功、相同 operation 重放、两个不同 operation 连续写入、旧 version 的真实并发冲突、超时语义可重试、刷新 snapshot/Point Log 一致、Undo 后 replay 一致。

### IT-03 Event lifecycle contract
- `cancel_event` / `delete_event` 等终态 RPC 与 `cancelled` schema 同时存在；
- started Match 后服务端拒绝非法 edit/cancel/delete；
- Quick single Match 完成后的 Event finished 传播逻辑有集成覆盖。

### IT-04 Identity / privacy contract
- owner / participant / invited / viewer / auth alias 解析不得由前端隐藏替代服务端授权；
- `avatar_visible=false` 对详情与列表类 RPC 统一生效；
- private alias 表不能因 Edge Function 便利扩大客户端权限。

### IT-05 Photo / Storage contract
source photo 与 participant personal asset 分离；private Storage/RLS、source delete 解耦等按 `PHOTO_ALBUM_BASELINE.md` 执行。

### IT-06 Quick Start / tournament contract
Quick 创建、identity、Entry/EntryPlayer、draw/tournament commit 使用同一 canonical identity；create succeeded + draw failed 的恢复不得创建第二个 Event。

## 4. 自动化执行
- `npm run test:unit`：纯逻辑；
- `npm run test:integration`：隔离 Supabase 完成 migration replay 后执行；
- GitHub Actions `Integration Contract Tests`：必须绑定当前 PR exact head。

新增 point idempotency schema/RPC/Edge 契约时，必须同步更新 integration 脚本；仅 Browser “看起来没双记”不能替代事务级证据。

## 5. 回归测试升级规则
纯算法 → Unit；RPC/schema/RLS/Storage/事务/identity/idempotency → Integration；真实用户旅程/弱网交互/视觉 → User Story E2E；发布 exact-SHA → Gate。

## 6. 职责分离
测试实现者可维护测试，但不能用自己刚写的测试单独把自己实施的产品修复标记 VERIFIED。当前为开发迭代，谁实现谁不独立 VERIFIED。
