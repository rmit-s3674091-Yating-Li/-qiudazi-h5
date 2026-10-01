# 球搭子｜赛事对阵、计分与轮次展示基线

> 状态：Canonical product / interaction baseline。本文统一规定标准赛事与快速赛事的对阵、网球计分层级、轮次、单场结果和完赛展示。2026-09-02 起计分相关新增/变更同时受 `docs/NEXT_VERSION_PRODUCT_BASELINE_20260902.md` 约束；本文承载 Scoring 专项详细规则。

## 1. 网球计分层级
统一按国际网球通用层级表达：**分（point）→ 局（game）→ 盘（set）→ 比赛（match）→ 赛事（event）**。产品文案不得混用。
- `games_6` 表示“每盘先到 6 局”的传统盘规则，不表示 6 盘、6 轮或 6 场比赛。
- `best_of=1` 表示 1 盘制；`best_of=3` 表示 3 盘 2 胜；`best_of=5` 表示 5 盘 3 胜。
- 传统 6 局盘在 6:6 进入抢七时，抢七小分与盘内局分分开记录。
- UI 推荐组合表达：`1盘制 · 每盘先到6局 · 6:6抢七 · 占先制`（或 `平分金球制`）。

### 1.1 普通局平分规则
Event 的 `game_scoring` 是普通局唯一规则源：
- `advantage`（默认）：40:40 → Deuce；下一分为 AD；占先方再赢一分才 Game，对方追回则回 Deuce。
- `no_ad`：40:40 显示“平分 · 金球”；下一分为 deciding point，得分方立即赢得该局，不出现 AD。
- 该设置只作用于普通局。抢七仍按抢七目标分且领先 2 分，不能因为选择 No-Ad 而变成抢七一分定胜负。
- `game_scoring` 属于结构性比赛规则；已有有效报名或名单 locked 后不得修改。

### 1.2 下一版本计分规则参数
计分规则模型必须能够表达并由同一规则引擎消费：比赛盘数/先赢盘数、每盘目标局数、是否要求净胜两局、抢七触发条件、抢七目标分与抢七净胜规则、普通局 `advantage / no_ad`。页面不得根据按钮文案、赛制名称或历史比分自行推断另一套规则。

所有 Live 事实统一由 **Event Rules + Point Log replay** 推导。当前 Game、当前 Set、已完成盘、Match winner、Result/Draw/Ranking 所需赛果不得由页面维护第二份可编辑状态。未持久化的新规则参数应使用 canonical 默认值保持旧赛事兼容，只有 schema/RPC/创建链完整支持后才允许暴露为可配置项。

## 2. 轮次名称
轮次名称由赛制与签表结构决定，不由 `event_mode` 决定。两个 Entry、全赛事仅一场淘汰赛显示 **单场对决 / Single match**，不显示“决赛 / Final”。正常多轮淘汰按 1/16、1/8、1/4、半决赛、决赛表达；循环赛按第 N 轮。

Round 是赛事轮次，Game 是网球“局”，两者不得混用。

## 3. Match 卡与结果页
Match 卡和比赛结果页必须明确 `Entry A — VS — Entry B`，不能把 VS 弱化到角落或让双方上下堆叠后失去 PK 关系。比分必须与对应 Entry/参赛者视觉绑定，左右顺序在同一页面保持稳定，不能让用户猜测某个 `6`/`4` 属于谁。

单打每侧展示对应 Player；双打每侧两名队友使用**两个等权头像/身份位**，不得只突出其中一人或把第二名队友降成附属文本。双打关系表达固定为 `A/B — VS — C/D`。

比分存在时按双方逐盘对齐显示局分，不把盘分、局分或抢七小分混为一个数字。结果页主视觉先回答“谁 vs 谁、每盘多少、谁赢了”，轮次和状态属于辅助信息。

## 4. 录入比分
比赛详情主入口使用 **录入比分 / Record score**。产品提供两种模式：
1. **录入比分**：按盘填写已完成盘比分。
2. **逐分实时记分**：按 point 逐分记录，由同一计分引擎自动累计 game / set / match。

### 4.1 实时记分版本同步、唯一真源与 optimistic UX
逐分实时记分每一次已持久化的 `point / undo / begin / score` 成功后，客户端采用服务端返回的最新 Snapshot，包括 `event.version`、`match.version`、point logs、set scores 和状态。**Point Log 是 Live 模式唯一计分事实源**；当前分、局分、盘分、Match/Event 结果只能由相同 Event Rules + ScoringEngine replay 推导，不得维护第二套可编辑局比分。

“某方 +1 分”必须提供近即时 optimistic response：点击后先用同一 ScoringEngine 在本地呈现预期状态，后台可靠持久化。optimistic 状态只是未确认视图，不是第二真源；服务端确认后以最新 Snapshot/Point Log 收敛。失败、超时或版本冲突时必须回滚或重新拉取并 replay 权威 Point Log，不能把未确认本地分数永久留在页面。

快速连续点击允许表达多个真实得分操作，但持久化必须保持有序版本链。每个写操作必须有稳定 operation id / idempotency key；同一 operation 重放不得产生第二条有效 Point Log。请求超时但服务端可能已经成功时，不得换一个新 operation id 盲重试同一分。真实跨端并发仍由 optimistic version/服务端事务保护。

### 4.2 逐分裁判记分 UI
- 进行中持续显示 `第 X 盘 · 第 Y 局` / `Set X · Game Y`，并同时显示当前盘局分和当前 Game 分数。
- Advantage 普通局显示 `0 / 15 / 30 / 40 / AD`；40:40 为 Deuce。
- No-Ad 普通局显示 `0 / 15 / 30 / 40`；40:40 为“平分 · 金球”，下一分直接 Game，绝不显示 AD。
- 抢七才显示 `5:3` 等连续数字小分，并明确“抢七”。
- 主信息层级：参赛双方 → 当前盘/当前局 → 当前盘局分 → 当前 Game 分数 → 得分操作。
- 一局结束后给出明确赢局反馈并进入下一局；一盘结束后明确盘结果并进入下一盘；达到比赛获胜条件后自动完成 Match 并同步赛果读取链。
- 每次“某方得分”只形成一个有效 point log；局/盘/比赛结果自动派生。
- 正常纠错只有“撤销上一分”；不得“删除上一局”或对已记局 `+/-`。已完成赛果走受保护的“更正比分”。
- 达到 game/set/match 条件自动推进，不需要额外“确认结果”。
- 单次 point 持久化期间不得用全屏 Loading 阻塞比赛视图；可用轻量“同步中”状态表达后台提交。

### 4.3 更正比分与降级边界
“更正比分 / Correct score”是已完成 Match 的受保护纠错入口，不是 Live 模式的第二计分真源。更正必须继续执行 owner/授权、Match/Event 生命周期与 optimistic version 校验。

若当前赛事状态允许安全更正，则进入受保护的比分更正流程；若因为 Event 已进入不可直接改写的 finished 状态、后续轮次已经依赖原结果、或其它生命周期约束而不能安全更正，UI 必须**降级为明确的不可更正说明/恢复路径**，不得继续展示一个必然失败的主按钮，也不得通过删除 Point Log、放宽版本校验或直接改数据库绕过。单场 Quick Event 自动 finished 后也必须有一致、明确的更正策略。

### 4.4 赛中 Undo 与赛后 Correction
赛中 `Undo last point` 只撤销当前 Match Point Log 中最近一个仍有效的 point，并由 replay 重新推导 Game/Set/Match。赛后比分更正属于独立受控结果操作，不能伪装成批量 Undo、删除历史 point 或直接编辑 Live 派生状态。

## 5. Match 与 Event 完成
Match `finished` 和 Event `finished` 是不同层级。Quick Event 若全赛事只有一个真实 Match，该 Match 完成时 Event 自动 `finished` 并写 `finished_at`；Hall、详情、结果、相册使用同一 Event 状态。

## 6. 单场结果
两个 Entry、唯一一场比赛不使用冠军/亚军包装，展示“本场胜方 / 另一方 / 实际比分”。只有真实多轮赛事才使用冠军等赛事名次。

## 7. 验收
至少独立验证：
1. `games_6 + best_of=1` 语义正确；
2. Advantage：40:40 → Deuce → AD → Game；失去 AD 回 Deuce；
3. No-Ad：40:40 → 金球 → 下一分 Game，全程无 AD；
4. Advantage/No-Ad 下抢七均保持配置的目标分与净胜规则；
5. 创建赛事可选两种普通局规则，默认 Advantage；已有报名或 locked 后修改被服务端拒绝；
6. Point Log replay 与页面当前分、局分、盘分、最终结果完全一致；刷新后结果不漂移；
7. 进行中持续展示 `第 X 盘 · 第 Y 局`、当前盘局分和当前 Game 分数；普通局不显示内部 point counter；抢七才显示连续数字；
8. Live 仅“某方得分 + 撤销上一分”，无删除上一局/局分 +/-/额外确认结果；
9. +1 点击近即时 optimistic response；同端连续记分按顺序持久化，不产生自身旧 version 导致的伪 VERSION_CONFLICT；
10. 同一 operation id 重放不双记；请求超时、刷新、失败恢复后 Point Log replay 与服务端最终事实一致；
11. 真实跨端并发仍被版本/事务保护，不因 optimistic UX 放宽授权、幂等或一致性校验；
12. Match/结果页使用稳定的 A—VS—B 结构，比分与对应参赛方绑定；双打每侧两名队友均使用等权头像/身份位；
13. 已完成 Match 的比分更正只有在生命周期允许时可执行；不允许时展示明确降级状态，不通过弱化权限/version 或第二计分真源绕过；
14. 单场 Quick Match 完成后 Event 自动 finished，Hall/详情/结果/相册一致；
15. 中文与 English 语义一致；375 / 390 / 430px 不溢出。
