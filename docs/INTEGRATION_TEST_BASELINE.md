# 球搭子｜Integration / Contract Test Baseline

> 状态：canonical testing baseline。用于定义 Unit 与 User Story E2E 之间的集成测试层，避免把数据库、RPC、RLS、Storage、状态协作问题全部拖到 Browser E2E 才发现。

## 1. 测试分层

球搭子采用四层测试结构：

1. **Unit / Domain Tests**：确定性纯逻辑，最快、数量最多；见 `docs/UNIT_TEST_BASELINE.md`。
2. **Integration / Contract Tests**：模块、数据库、RPC、RLS、Storage 与状态契约协作；本文件为真源。
3. **User Story E2E / Blackbox**：真实用户关键业务闭环；见 `docs/USER_STORY_ACCEPTANCE_BASELINE.md` 与 `docs/BROWSER_BLACKBOX_BASELINE.md`。
4. **Release Gate**：证明上述证据与准备发布的 exact SHA 完全一致；见 `docs/RELEASE_GOVERNANCE.md`。

原则：**问题应在能够稳定、快速拦截它的最低测试层被拦住。** E2E 不是所有问题的兜底实现层。

## 2. Integration Test 负责什么

Integration Test 负责回答“模块之间合作是否正确”，重点包括：

- repository / RPC / PostgreSQL schema 的契约是否一致；
- migration clean replay 后终态 schema、function、constraint 是否符合当前代码假设；
- RLS / SECURITY DEFINER / execute grant / Storage policy 是否维持正确权限边界；
- Event / Match / Photo / Profile 的状态字段、enum、default 与 RPC 终态是否一致；
- optimistic version、事务边界、返回 Snapshot 等跨层协议是否一致；
- source event photo 与 participant personal copy 的数据库解耦契约；
- Quick Start / alias / tournament commit 等跨模块身份解析契约；
- privacy flag（尤其 avatar visibility）在列表型 RPC 与详情型 RPC 中保持一致。

以下问题不应主要依赖 Integration Test：

- 网球纯规则计算：Unit；
- 用户是否看懂 CTA、页面是否挤压：E2E / Visual；
- 真实浏览器弱网导航、历史栈：E2E；
- exact SHA 是否就是待发布版本：Release Gate。

## 3. 当前 P0/P1 集成契约

### IT-01 Migration / schema clean replay
- repo migration version 唯一且命名合法；
- live manifest parity 通过；
- clean DB 能完整 replay 到终态；
- `events.event_mode`、`events.game_scoring`、`cancelled` 等当前结构与约束存在；
- 新 enum/default 对旧数据兼容。

### IT-02 Scoring persistence contract
- Match 写命令依赖的函数/RPC存在且最终定义唯一；
- Point Log 与 Match snapshot 使用同一版本/状态协议；
- point / undo 返回值必须足够让客户端更新到服务端最新事实；
- 幂等/operation-key 属于高风险可用性契约：一旦实现，必须加入集成回归，不得只做 Browser 验证。

### IT-03 Event lifecycle contract
- `cancel_event` / `delete_event` 等终态 RPC 与 `cancelled` schema 同时存在；
- 有 Entry 历史的赛事不能通过旧服务端路径无痕消失；
- started Match 后服务端拒绝非法 edit/cancel/delete；
- Quick single Match 完成后的 Event finished 传播逻辑必须有独立集成覆盖。

### IT-04 Identity / privacy contract
- owner / participant / invited / viewer / auth alias 解析不得由前端隐藏替代服务端授权；
- `avatar_visible=false` 对详情与 connection/list 类 RPC 统一生效；
- private alias 表不能因 Edge Function 便利扩大客户端权限。

### IT-05 Photo / Storage contract
- `event-photos` bucket private；
- source photo 管理与 participant personal asset 分离；
- `source_event_photo_id` 删除语义为 `SET NULL` 或等价解耦；
- legacy 单图/自动归档 RPC 不得继续可调用；
- 无权角色不能通过列表返回 Storage path；
- personal visibility 不得扩大 source event photo 权限。

### IT-06 Quick Start / tournament contract
- Quick Event 创建、alias identity、Entry/EntryPlayer、draw/tournament commit 使用同一 canonical identity；
- create succeeded + draw failed 的恢复不得再次创建第二个 Event；
- standard / quick 的共享 tournament 规则不得出现两套服务端终态。

## 4. 自动化执行

仓库提供：

- `npm run test:unit`：纯逻辑；
- `npm run test:integration`：要求本地 Supabase 已启动并完成 migration replay；
- GitHub Actions `Integration Contract Tests`：在隔离 Supabase 上 clean replay 后运行集成契约断言。

Integration workflow 的结果必须绑定当前 PR exact head。旧 SHA 的 PASS 不得证明新 head。

## 5. 回归测试升级规则

发现缺陷后按根因决定补哪一层测试：

- 纯算法/判断错误 → Unit regression；
- RPC/schema/RLS/Storage/事务/identity 协作错误 → Integration regression；
- 用户旅程/导航/视觉/真实浏览器行为错误 → User Story E2E regression；
- 发布证据指向错误 SHA → Release/Gate regression。

如果一个问题本应被较低层拦住却直到 E2E 才发现，修复完成时必须评估是否把该场景“下沉”为 Unit 或 Integration 回归。

## 6. 职责分离

测试实现者可以新增/维护测试，但不能用自己刚写的测试结果单独把自己实施的产品修复标记为 VERIFIED。正式 AUD 关闭仍需符合 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 的独立验证规则。

Unit/Integration PASS 是证据的一部分，不替代 Browser、权限实测或 Release Gate。