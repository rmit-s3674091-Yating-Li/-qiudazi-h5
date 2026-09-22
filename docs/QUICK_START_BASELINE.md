# 球搭子｜Quick Start 快速开赛专项基线

> 状态：Canonical product baseline。自动化测试数据命名与隔离以 `docs/TEST_DATA_GOVERNANCE.md` 为准；签表、计分层级、轮次、单场结果与完赛展示以 `docs/TOURNAMENT_PRESENTATION_BASELINE.md` 为准。

## 1. 产品定位
“快速开赛”用于球友已经约好、无需再走报名/候补/招募，但仍希望使用编排、记分、结果、战绩和照片能力。创建后继续使用 Event / Entry / EntryPlayer / Match / scoring / photo 模型。

## 2. 参赛者
可选择本人 self Player、accepted Connection 的真实球搭子 self Player、本人未认领临时 Player，并可现场新增临时 Player。不得加入无授权陌生 Player。

## 3. 单打与双打
单打至少2人，每个 Player 一个 Entry。双打至少4人且为偶数；必须显式确认队友并允许调整，不得把勾选顺序作为不可见最终规则。

## 4. 正常流程
**选择单/双打 → 选择参赛者 →（双打）确认队友 → 设置赛制/计分；城市、场地均 optional → 一键开赛 → 创建赛事并锁定名单 → 自动生成首次对阵 → 自动进入 ongoing → 直接进入最贴近下一步操作的 Draw/Match。**

Quick 的最低前置仅为满足比赛类型最低人数的参赛者 + 比比赛制/计分规则。城市不得带必填星号，不得自动写入“北京”或任何推断城市。首次 draw 或后续 auto-start 失败时保留同一 Event，进入“开赛未完成 / 恢复开赛”；恢复只继续完成同一 Event，不重复创建。创建并成功生成对阵后，系统应自动把 Event 进入 `ongoing`：唯一真实 Match 直接进入该 Match；多 Match 赛事进入 Draw。正常路径不得再要求用户额外点击一次“开始赛事”。

## 5. 状态与生命周期
Quick Event 不走报名/候补/deadline。创建后可短暂经过 `locked` 作为名单固定/生成对阵的中间状态；正常“一键开赛”成功链路必须自动进入 `ongoing`，不得把 Standard Event 的“开始赛事”二次确认继续暴露给用户。

开赛前（尚无真实 Match `ongoing` / `finished`）：
- 创建人可取消比赛；取消进入只读 `cancelled` 终态并保留必要参与历史，不允许继续普通编辑、开赛、记分或报名。
- 非创建人的实际参赛者可退出比赛；退出必须由服务端校验本人参赛关系，不能只靠前端隐藏入口。
- 退出后若剩余参赛单元低于比赛类型最低人数，必须明确提示并取消/终止该未开始 Quick Event，不得留下不可进行的幽灵赛事。

真正开始 Match 后，不再提供普通“退出比赛”。此后的中途离开进入 Retirement / Walkover 等结果语义，保留参赛关系与比赛历史；不得通过删除 Entry 伪装成退出。生命周期权限、状态/version 边界必须由 RPC/服务端强制执行。

**单场 Quick Event 特例：若全赛事只有一个真实 Match，则该 Match 完成后 Event 自动进入 `finished` 并写入 `finished_at`。** 不要求用户再回赛事管理额外点击一次“结束赛事”。这样 Hall、赛事详情、结果和相册权限必须同时切换为已结束。

多场 Quick Event 不因某一场 Match 完成而提前结束 Event；必须满足赛事级完赛条件。

## 6. 网球计分语义
Quick Start 不另造计分规则，统一遵循网球 point → game → set → match 层级。

- `games_6` 对用户表达为“每盘先到6局”，不是“6轮制”。
- `best_of=1` 表达为“1盘制”；一盘完成即 Match 完成。
- 推荐完整表达：`1盘制 · 每盘先到6局 · 6:6抢七`。
- 比赛详情主入口叫“录入比分”，并同时提供“逐分实时记分”；不以“直接录入最终比分”误导用户。
- Quick 正常链路不展示“标记本场已开始”作为额外前置动作；首次真实记分/录分即进入该 Match 的实际比赛过程。
- 已完成 Match 才进入“更正比分”；单场赛事的更正确认不展示无关的级联/其他参赛者话术。

## 7. 单场赛事展示
只有两支 Entry、唯一一个真实 Match 时：
- 轮次叫“单场对决”，不叫“决赛”；
- 完赛结果叫“本场胜方 / 另一方”，不叫“冠军 / 亚军”；
- 只有唯一合法对阵，不显示“重新生成对阵”；仅当当前参赛结构存在多个合法对阵方案时才允许重新生成；
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
8. 两 Entry 显示单场对决，且唯一合法对阵时不显示重新生成；
9. `1盘制 + 每盘先到6局` 文案无“6轮”歧义；
10. 单场 Match 完成后 Event 自动 finished；
11. Hall/详情/结果/照片状态一致；
12. 单场结果不显示冠亚军；
13. 完赛后 organizer 可上传赛事照片；
14. city/venue 均可留空，且不会自动出现“北京”或其他推断城市；
15. 创建成功后自动进入 `ongoing` 并进入 Draw/Match，不要求再次点击“开始赛事”；唯一真实 Match 直接进入 Match，多 Match 进入 Draw；
16. Quick 未开赛时 owner 可取消，participant 可退出；非 owner 不得取消赛事；
17. participant 退出后低于最低人数时，Event 明确进入取消/终止状态，不保留可继续开赛的幽灵赛事；
18. 任一真实 Match 开始后普通退出入口关闭，服务端也拒绝 ordinary withdrawal；中途离开只能通过 Retirement/Walkover 结果流程；
19. cancelled Quick Event 为只读历史，不能继续开赛、记分或修改参赛关系。

## 12. 当前冻结实现差距（2026-09-22）

已批准的产品规则是“一键开赛即真正开赛”。当前 feature head 在 2026-09-22 功能冻结时仍存在已知实现差距：Quick 创建 + draw 后仍可能停留在 `locked`，并复用 Standard Event 的“开始赛事 / 标记本场已开始”交互。该差距必须保留在 Workboard，并在后续整改前由黑盒明确报告；不得用旧规则把它判定为通过。
