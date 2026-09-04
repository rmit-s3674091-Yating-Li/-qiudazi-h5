# 球搭子｜User Story 与 Acceptance Criteria 基线

> 状态：黑盒测试与版本验收的用户故事真源。目标是先从“用户为什么来、以什么身份做什么”定义行为，再由黑盒测试逐条仿真，而不是从页面/按钮清单反推测试项。

## 1. 使用方式

每次准备一个新的 release candidate 前，必须先读取本文与对应专项 canonical baseline，再生成/更新黑盒场景。每个 User Story 至少覆盖：
- Happy path：正常完成目标；
- Boundary / negative：无权限、状态不满足、输入非法；
- Recovery：刷新、弱网、请求失败、版本冲突、重复操作后的恢复；
- Cross-role：owner / participant / invited / viewer 等角色边界；
- State consistency：Hall / 详情 / 我的赛事 / 排名 / 相册 / 战绩等页面一致；
- Visual / mobile：375 / 390 / 430px，中文 / English；
- Evidence：same-SHA screenshot / trace / result JSON，可复现。

黑盒测试不得只验证“按钮能点”。必须验证用户故事的业务结果和后续状态。

## 2. 角色模型

- Visitor：未进入有效赛事身份的普通访问者。
- Profile User：已完成档案的登录用户。
- Organizer / Owner：赛事创建人。
- Participant：通过有效 Entry→Player 形成实际参赛事实的用户。
- Invited：收到赛事/组队邀请但尚未形成有效 Entry 的用户。
- Partner：accepted Connection 的真实球搭子。
- Temporary Player：由用户管理、尚未关联真实 Profile 的比赛身份，不等同登录用户。

角色判断以服务端权威事实为准，不以页面缓存、昵称或 signup_user_id 单独决定。

---

# Epic A｜进入产品与个人身份

## US-A01 完成个人档案
**作为**首次进入的登录用户，**我希望**完成昵称、头像和基础网球档案，**以便**参与赛事和被正确识别。

### AC
- Given 用户 Profile 未完成，When 进入需要完整身份的赛事能力，Then 必须引导完成档案而不是静默失败。
- 昵称满足当前唯一性与长度规则；非法/冲突昵称给出可理解提示。
- 保存成功后回到明确来源页，不产生返回历史循环。
- 未上传头像时使用系统默认头像，不出现破图/拉伸。

## US-A02 管理个人隐私
**作为**用户，**我希望**控制头像、网球档案和个人参与赛事相册的可见性，**以便**只向允许的人展示。

### AC
- `avatar_visible=false` 后，个人档案页、球搭子列表及所有普通列表接口均不得向无权角色泄露真实头像 URL。
- accepted Partner 只能看到被允许公开的字段；非 Connection 不得借直接 URL/RPC 越权。
- 隐私设置保存后刷新仍保持一致。
- UI 隐藏不是唯一保护，服务端必须重新校验。

---

# Epic B｜赛事发现与查看

## US-B01 浏览公开赛事
**作为**登录用户，**我希望**在赛事大厅发现公开赛事，**以便**决定是否参加或查看比赛。

### AC
- 公开 standard event 正常展示允许公开的信息。
- 正常 quick event 可进入 Hall，但不因此开放报名/候补。
- cancelled 不进入公共 Hall；finished 可按产品规则继续展示历史状态。
- 自动化测试用户/赛事按 TEST_DATA_GOVERNANCE 隔离，不污染正常 Hall。

## US-B02 按赛事条件筛选
**作为**用户，**我希望**按比赛类型、城市、水平级别和日期组合筛选，**以便**找到符合当前约球条件的赛事。

### AC
- 筛选 2.5 时，2.0–3.0、2.5–4.0、≤2.5、无限制均匹配；3.0–4.0 不匹配；水平筛选只影响发现，不变成硬报名资格。
- city filter 仅在用户明确输入/选择非空城市时生效；城市比较采用 Unicode NFKC + trim + case normalization。
- 未筛 city 时，城市为空的赛事与有城市赛事都保持可发现；显式筛 city 后，空城市赛事和其他城市赛事不命中。
- match type + city + level + date 必须可联合生效；清除筛选后恢复完整可见集合。
- 在 375 / 390 / 430px 下，city、`date`、`datetime-local`、`select` 控件以及承载它们的 Sheet / Bottom Sheet / Modal 不得造成页面或容器横向溢出；原生控件必须允许 flex/grid 收缩并保持在容器宽度内。
- CSS / deterministic Unit 只能作为 Implemented / SELF-CHECKED 证据；真实 iPhone Safari / 微信 WebView 仍需后续 Browser/真机验证后才能标 Verified。

## US-B03 查看私有赛事预览
**作为**普通 viewer，**我希望**知道某场私有赛事存在，**但不应**看到未授权敏感详情。

### AC
- Hall 只显示脱敏预览：赛事名、城市、建议级别、单双打、赛制、状态、私有标记。
- 不显示 owner、具体日期时间、场地、费用、报名/候补人数、截止时间、参赛人。
- invited / participant / owner 获取完整详情必须由服务端角色决定。

---

# Epic C｜标准赛事创建、报名与名单

## US-C01 创建标准赛事
**作为** Organizer，**我希望**配置赛事基本信息、赛制、计分、时间、地点与费用，**以便**发布一场可报名赛事。

### AC
- 比赛日期和开赛时间必填；报名截止默认开赛前 2 小时且不能晚于该边界。
- 可配置单/双打、round robin / knockout / group knockout、best_of、每盘计分类型。
- 普通局可配置 `占先制` 或 `平分金球制`；默认占先制。
- `game_scoring=no_ad` 只改变普通局 40:40 后下一分赢局，不改变抢七目标分且领先 2 分。
- 保存后详情展示与配置一致，不能出现 UI 一套、引擎另一套。

## US-C02 报名单打赛事
**作为**用户，**我希望**报名一场单打赛事，**以便**进入正式名单或候补。

### AC
- 有名额时形成 confirmed Entry；满额时按规则进入 waitlist。
- 报名后“已报名/候补中”是状态，不是按钮。
- Primary action 为“查看名单/查看候补名单”。
- 退出报名/退出候补是次级/危险管理动作，不与查看名单同层级。
- 截止后深链和直接 RPC 也不能继续报名。

## US-C03 报名双打赛事并确认队友
**作为**双打用户，**我希望**明确选择/确认队友，**以便**形成正确的双打 Entry。

### AC
- 双打必须形成两人一队；不得把不可见的勾选顺序作为最终组队规则。
- 组队邀请未接受不等于有效 Entry。
- 实际两个 Partner 都应被识别为 participant。
- 名单页显示队伍内两个成员，不把双打 Entry 拆成两个独立单打位。

## US-C04 Organizer 管理名单并锁定
**作为** Organizer，**我希望**在截止前调整名单，之后锁定并自动生成首次对阵，**以便**进入比赛阶段。

### AC
- 截止前按权限允许代临时 Player 报名、退出、候补递补等。
- 锁定成功后系统自动生成首次 draw；正常路径不要求额外“生成对阵”。
- 若锁定成功但 draw 临时失败，保持 locked 并提供“继续生成对阵”恢复，而不是重复锁定/重复创建。
- 已有真实 Match ongoing/finished 后不得解锁并无保护重建。

---

# Epic D｜快速开赛

## US-D01 创建快速单打
**作为**已经约好球友的用户，**我希望**跳过公开报名直接选择参赛者并开赛，**以便**马上使用记分和战绩功能。

### AC
- 可选本人、accepted Partner 的 self Player、本人临时 Player，并可现场新增临时 Player。
- 单打至少 2 人。
- 创建后 Event 为 quick，名单 locked，自动生成首次 draw。
- create 成功但 draw 失败时刷新后仍能恢复同一 Event，不得重复创建赛事。
- quick event 默认 public 可进 Hall，但不开放标准报名/候补。

## US-D02 创建快速双打并确认队伍
**作为**用户，**我希望**选择至少 4 名球员并明确确认每队两人，**以便**快速生成正确双打对阵。

### AC
- 双打至少 4 人且总人数为偶数。
- 必须进入显式队友确认步骤，可调整两人组合。
- Match 卡与比赛详情始终按 Team A — VS — Team B 展示。
- 双打头像两名成员等权展示；有头像用真实允许显示头像，无头像用系统默认头像；不得一大一小制造主次。

---

# Epic E｜对阵、开赛与记分

## US-E01 查看对阵
**作为** participant 或 viewer，**我希望**清楚看到谁和谁比赛，**以便**理解赛程和当前结果。

### AC
- Match 卡明确 Entry A — VS — Entry B。
- 仅两个 Entry 且唯一一场 knockout 时显示“单场对决”，不显示“决赛”。
- 多轮淘汰赛按 1/4 决赛、半决赛、决赛等合理命名。
- 双打两名队友保持在同一侧。

## US-E02 Organizer 开始赛事/比赛
**作为** Organizer，**我希望**在对阵确认后开始赛事和比赛，**以便**进入可记分状态。

### AC
- 未开始赛事不能直接进入可写比分状态。
- 非 owner 不能通过深链/RPC 开赛或记分。
- Event/Match 状态变化后详情、Hall、我的赛事及时同步。

## US-E03 逐分实时记分
**作为** Organizer/记分者，**我希望**每次只点击得分方，**以便**系统自动推导局、盘和比赛结果。

### AC
- Point Log 是逐分模式唯一事实源；局分、盘分、winner 均由同一 ScoringEngine replay 推导。
- 普通占先局显示 0→15→30→40→Deuce→AD→Game，不暴露内部 3:4 等计数。
- No-Ad 在 40:40 显示金球，下一分直接 Game，不出现 AD。
- 抢七显示连续数字小分，仍需目标分且领先 2 分。
- 每次 point 成功后立即采用服务端返回最新 Snapshot；连续点击不得因自身旧 version 产生伪 VERSION_CONFLICT。
- 正常纠错仅“撤销上一分”；没有“删除上一局”或对已完成局 `+/-` 的第二真源。
- 请求超时/重试不得造成同一分重复写入；若当前实现无法证明幂等，发布前必须有正式风险处置。

## US-E04 按盘录入最终比分
**作为** Organizer，**我希望**在没有逐分记录时录入已完成盘分，**以便**快速记录真实赛果。

### AC
- `best_of=1 + games_6` 只录入一盘，如 6:3 后 Match 完成。
- best-of-3 达到 2 盘胜即结束，不能再录多余盘。
- 抢七盘分与抢七小分校验正确。
- 页面显示规则与校验引擎一致。

## US-E05 更正已完成比分
**作为** Organizer，**我希望**在误录时更正赛果，**以便**修复错误且不破坏已开始的后续比赛。

### AC
- “更正比分”是次级管理操作，与结果展示保留明显间距，不抢主视觉。
- 更正前明确说明影响范围；会重建尚未开始的后续对阵时必须提示。
- 已开始的后续 Match 不得被静默覆盖。
- 单场比赛不显示与不存在的“其他比赛参赛者”相关工程话术。

---

# Epic F｜比赛结果、赛事完赛与历史

## US-F01 查看比赛详情结果
**作为**任何有权查看比赛的用户，**我希望**一眼看懂双方和比分的对应关系，**以便**不需要猜数字属于谁。

### AC
- 结果页采用 A 方卡片 — VS — B 方卡片结构；参赛者与自己的盘胜/比分视觉绑定。
- 单打可用单头像；双打双方各两个等权头像。
- 已完成盘分中姓名与比分对齐规则一致，避免“姓名左、比分中”的视觉断裂。
- 单场结果显示“本场胜方 / 另一方”，不使用冠军/亚军。

## US-F02 单场 Quick Event 自动完赛
**作为**快速单场赛事参与者，**我希望**唯一 Match 完成后赛事自动结束，**以便**结果、Hall、相册和战绩都立即进入正确状态。

### AC
- 唯一真实 Match finished 后 Event 自动 `finished` 并写 `finished_at`。
- Hall、详情、结果、我的赛事、相册状态一致。
- 完赛后 organizer 立即可以上传赛事照片。

## US-F03 Organizer 编辑/取消/删除未开赛赛事
**作为** Organizer，**我希望**管理尚未开赛赛事，**同时**不抹掉已经影响他人的历史。

### AC
- signup / locked 且无真实 Match 开始时可进入设置。
- 无任何 Entry 历史才可物理删除。
- 有过 Entry 历史只能取消为 cancelled；即使后来全部 withdrawn 也不能重新物理删除。
- cancelled 从公共 Hall 移除，但 owner/actual participant 的 My Events 保留“已取消”。
- 有有效报名或名单 locked 后，单/双打、赛制、best_of、scoring_type、tiebreak、game_scoring 等结构字段锁定。
- 真实 Match 开始后 edit/cancel/delete 都由服务端拒绝。

---

# Epic G｜赛事相册与个人相册

## US-G01 Organizer 上传赛事照片
**作为**赛事创建人，**我希望**在完赛后上传多张照片，**以便**参赛者查看和保存赛事记忆。

### AC
- 只有 owner 能上传/删除赛事源照片。
- 未 finished 不开放上传。
- 上传成功生成 private original + protected watermarked preview。
- 新水印预览在照片主体上使用低透明度斜向重复“球搭子 · 赛事相册”，密度按已确认视觉基线；底部保留赛事名称/结果/日期等 provenance 信息。
- 空相册装饰只是状态，不得长得像可点击 dropzone；真正操作必须是明确按钮。

## US-G02 Participant 查看并加入个人参与赛事相册
**作为**实际参赛者，**我希望**查看赛事照片并逐张加入自己的参与赛事相册，**以便**长期保存自己的比赛照片。

### AC
- participant 可看赛事源水印预览，不可上传/删除源照片。
- 系统不得自动导入；必须逐张主动加入。
- 加入成功形成独立 private personal asset，不只是源引用。
- organizer 后续删除源照片，不影响已导入个人副本。
- participant 可移出自己的个人相册，只影响本人副本。

## US-G03 Viewer 不应看到合影入口
**作为**非 owner、非 actual participant 的 viewer/invited 用户，**我不应该**进入必然报权限错误的相册功能。

### AC
- viewer / invited-but-not-participant 不显示“合影” Tab。
- 直接调用 `list_event_photos` / 高清 / import 仍由服务端拒绝。
- 不用通用“稍后重试”掩盖权限语义。
