# 球搭子｜Quick Start 快速开赛专项基线

> 状态：Canonical product baseline。自动化测试数据命名与隔离以 `docs/TEST_DATA_GOVERNANCE.md` 为准；签表、计分层级、轮次、单场结果与完赛展示以 `docs/TOURNAMENT_PRESENTATION_BASELINE.md` 为准。

## 1. 产品定位
“快速开赛”用于球友已经约好、无需再走报名/候补/招募，但仍希望使用编排、记分、结果、战绩和照片能力。创建后继续使用 Event / Entry / EntryPlayer / Match / scoring / photo 模型。

## 2. 参赛者
可选择本人 self Player、accepted Connection 的真实球搭子 self Player、本人未认领临时 Player，并可现场新增临时 Player。不得加入无授权陌生 Player。

## 3. 单打与双打
单打至少2人，每个 Player 一个 Entry。双打至少4人且为偶数；必须显式确认队友并允许调整，不得把勾选顺序作为不可见最终规则。

## 4. 正常流程
**选择单/双打 → 选择参赛者 →（双打）确认队友 → 设置城市/场地/赛制/计分 → 一键开赛 → 创建赛事并锁定名单 → 自动生成首次对阵 → 进入赛事管理。**

首次 draw 失败时保留同一 Event，进入“开赛未完成 / 恢复开赛”；恢复只重试 draw，不重复创建 Event。

## 5. 状态
Quick Event 不走报名/候补/deadline。创建后 `locked` 表示名单固定；draw 后仍待用户正式开始赛事；开始后 `ongoing`。

**单场 Quick Event 特例：若全赛事只有一个真实 Match，则该 Match 完成后 Event 自动进入 `finished` 并写入 `finished_at`。** 不要求用户再回赛事管理额外点击一次“结束赛事”。这样 Hall、赛事详情、结果和相册权限必须同时切换为已结束。

多场 Quick Event 不因某一场 Match 完成而提前结束 Event；必须满足赛事级完赛条件。

## 6. 网球计分语义
Quick Start 不另造计分规则，统一遵循网球 point → game → set → match 层级。

- `games_6` 对用户表达为“每盘先到6局”，不是“6轮制”。
- `best_of=1` 表达为“1盘制”；一盘完成即 Match 完成。
- 推荐完整表达：`1盘制 · 每盘先到6局 · 6:6抢七`。
- 比赛详情主入口叫“录入比分”，并同时提供“逐分实时记分”；不以“直接录入最终比分”误导用户。
- 已完成 Match 才进入“更正比分”；单场赛事的更正确认不展示无关的级联/其他参赛者话术。

## 7. 单场赛事展示
只有两支 Entry、唯一一个真实 Match 时：
- 轮次叫“单场对决”，不叫“决赛”；
- 完赛结果叫“本场胜方 / 另一方”，不叫“冠军 / 亚军”；
- Match 完成后 Quick Event 自动 finished；
- organizer 的赛事照片上传入口立即开放；
- Hall 必须同步显示“已结束”，不得继续显示“进行中”。

## 8. 大厅与测试隔离
正常 Quick Event 默认 public 并进入 Hall，但无报名/候补 CTA。private standard event 仍以脱敏卡进入 Hall。自动化身份统一 `TST-<SUITE>-<ROLE>-<SHA6>-<RUN>`；legacy `QA-* / QA15-* / EXP-*` 仅兼容过滤。

## 9. 身份
Quick Start 全链路统一 canonical profile 解析：`list_quick_start_players`、`create_quick_event`、`tournament-command`、`commit_tournament`、viewer/snapshot。不得重新假设 `profiles.auth_user_id = auth.uid()` 是唯一身份映射。

## 10. UI / Visual
头像保持圆形固定尺寸；双打明确队友组合；Match 卡清楚 Team A — VS — Team B；375/390/430px 不溢出。计分、轮次、结果和生命周期展示统一服从 `TOURNAMENT_PRESENTATION_BASELINE.md`。

## 11. 验收
1. self + 临时 Player 单打自动 draw；
2. accepted partner 可快速开赛；
3. 双打明确组队；
4. alias create → draw；
5. draw 失败恢复同一 event；
6. 正常 Quick Event 出 Hall，测试 Event 不污染 Hall；
7. private standard event 仍脱敏可发现；
8. 两 Entry 显示单场对决；
9. `1盘制 + 每盘先到6局` 文案无“6轮”歧义；
10. 单场 Match 完成后 Event 自动 finished；
11. Hall/详情/结果/照片状态一致；
12. 单场结果不显示冠亚军；
13. 完赛后 organizer 可上传赛事照片。
