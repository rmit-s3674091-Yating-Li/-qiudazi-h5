# 球搭子｜赛事编辑、取消与删除基线

> 状态：Event 生命周期专项 canonical baseline。与旧 PRD / Demo 冲突时，以本文和当前 PRODUCT / INTERACTION / TOURNAMENT_PRESENTATION 专项基线共同解释。

## 1. 基本原则
赛事创建人可以管理自己尚未开赛的赛事，但“修改”“取消”“删除”是三种不同语义。已经影响其他参赛者或已经产生比赛事实后，不得用物理删除抹掉历史。

## 2. 未开赛赛事的修改
- `signup`：创建人可以进入赛事设置修改。
- `locked` 且没有任何真实 Match 开始：创建人仍可修改非结构性信息。
- 一旦存在真实 Match `ongoing` 或 `finished`：禁止通过普通赛事设置修改赛事规则。
- 已有有效报名后，单/双打、赛制、盘数、计分类型、抢七规则、**普通局平分规则（占先制 / 平分金球制）**、小组/晋级结构等会改变参赛预期或签表结构的字段锁定。
- 名单已经 locked 后，名额上限也作为结构性字段锁定；需要调整人员时先走受保护的“解锁名单 → 清空对阵 → 调整 → 重新锁定并自动生成”。
- 名称、公开/私有、建议级别、日期时间、城市/场地、费用说明等非结构字段在未开赛阶段可以修改，但仍必须满足字段校验和报名截止约束。

## 3. 删除与取消
### 3.1 无任何报名历史
创建人可以“删除赛事”。仅限尚未开赛且 `entries` 完全为空的赛事。删除是物理删除，删除后不再出现在大厅、我的赛事或直接详情。

### 3.2 已产生报名历史
创建人不能物理删除。尚未开赛时执行管理终止应转换为“取消赛事”：
- Event 状态写为 `cancelled`，记录 `cancelled_at`；
- 保留 Entry、名单和既有参与事实，不抹除用户曾报名的历史；
- 从公共赛事大厅移除；
- 在“我创建的 / 我参与的”中保留并明确显示“已取消”；
- 已取消赛事不得继续报名、锁定、生成新对阵、开赛或记分。

即使历史 Entry 后来全部 withdrawn，也属于产生过报名历史，不重新获得物理删除资格。

## 4. 名单已锁定但未开赛
创建人仍可取消赛事。若无任何 Entry，可以删除；只要存在 Entry，就只能取消。自动轮空和仅生成签表不视为真实开赛；任何真实 Match 已经 `ongoing` 或 `finished` 后，不再允许普通取消/删除。

### 4.1 Quick 开赛前退出与人数不足
Quick 在尚无真实 Match `ongoing` / `finished` 时采用以下专项规则：
- owner 使用“取消比赛”终止赛事；成功后进入 `cancelled` 只读终态并记录 `cancelled_at`；
- 非 owner 的实际 participant 可使用“退出比赛”；退出只改变其参赛关系，不物理删除 Event 历史；
- participant 退出后若剩余参赛单元低于比赛类型最低人数，必须在同一受控服务端流程中取消/终止该未开始 Quick Event，不得留下不可比赛的幽灵赛事；
- 上述权限、最低人数判断、状态变更和 optimistic version 必须由服务端权威执行，前端隐藏按钮不能替代生命周期校验。

## 5. 已开赛与已完赛
- `ongoing`：禁止普通删除、普通取消以及普通“退出比赛”。真实 Match 开始后的中途离开必须进入比赛结果模型：由受控的 Retirement / Walkover 结果语义记录退出方、胜方和结果原因，并保留既有 Point Log / Match 历史；不得通过删除参赛关系或回退为未开始状态处理。
- Retirement / Walkover 是比赛结果语义，不等于 Event 取消。结果提交后 Event Detail、Draw、Match Detail、Result、Ranking、My Events 必须读取同一 authoritative Match 结果事实；服务端必须拒绝把 started Match 再走 pre-start withdraw/cancel 路径。
- `finished`：比赛事实只读，不允许删除赛事历史；如需赛后更正，必须走独立受控的比分/结果更正流程，不复用普通退出或取消。

## 6. UI 层级
赛事详情中的“赛事设置”是普通管理入口，不与开赛/查看名单等主任务争抢 Primary Action。删除/取消放在设置页底部独立危险操作区：
- 无报名历史：`删除赛事`；
- 有报名历史：`取消赛事`；
- 两者都必须二次确认，并明确影响。

Quick participant 的“退出比赛”只在真实 Match 开始前显示；开赛后若需要离场，UI 必须进入 Retirement / Walkover 结果流程，不得继续显示普通退出入口。

“已取消”是状态，不是按钮。参与者打开取消赛事时应能理解赛事已取消，而不是看到赛事突然消失。

## 7. 服务端边界
权限和生命周期限制必须由服务端 RPC 强制执行，不能只靠前端隐藏按钮：
- owner 管理操作仅 owner；participant withdraw 必须校验当前用户确为该 Quick Event 的实际 participant；
- optimistic version 校验；
- 真实 Match 已开始后拒绝 edit/cancel/delete/pre-start withdraw；
- participant pre-start withdraw 后必须重新计算有效参赛单元；低于最低人数时事务性进入 cancelled/terminated 未开始终态；
- started 后 Retirement / Walkover 必须写入 authoritative Match 结果事实并保持跨页面一致，不得删除既有比赛事实；
- 有 Entry 历史时 delete 语义必须转为 cancel 或拒绝物理删除；
- Hall 必须排除 cancelled；My Events 保留 cancelled；
- `game_scoring` 只能为 `advantage` / `no_ad`；已有有效报名或 locked 后不得修改。

## 8. 发布验收
至少独立验证：
1. owner 创建空赛事 → 修改 → 删除，Hall/My Events 均消失；
2. 另一用户报名后 → owner 修改非结构字段成功，结构字段（含占先/金球规则）被拒绝；
3. 有报名赛事 → owner 执行终止后状态为 cancelled，写入 `cancelled_at`，Hall 消失，双方 My Events 仍能看到取消记录；
4. locked 未开赛赛事仍能取消；
5. Quick participant 在真实 Match 开始前可退出；退出后仍满足最低人数则赛事继续，低于最低人数则同一受控流程取消/终止赛事；
6. 任一真实 Match 开始后 edit/cancel/delete/pre-start withdraw 均被服务端拒绝；
7. started Match 的中途离开只能形成 Retirement / Walkover 结果，且 Event/Draw/Match/Result/Ranking/My Events 对胜负与状态一致；
8. 非 owner 不能通过深链/RPC 执行 owner 管理操作，非 participant 也不能伪造 Quick withdraw。
