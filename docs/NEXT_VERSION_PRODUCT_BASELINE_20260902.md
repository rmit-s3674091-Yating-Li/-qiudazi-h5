# 球搭子｜下一版本产品基线（2026-09-02）

> 状态：APPROVED FOR DEVELOPMENT
> 基线来源：2026-09-02 产品决策 + 现有 canonical baselines + 已确认可吸收的 PRD 规则。
> 适用范围：下一版本开发分支及其后续 PR。若与旧版 Quick/Photo/Scoring 描述冲突，以本文件的新版本变更项为准；未明确变更的规则继续沿用既有 canonical baseline。

## 1. 本版本目标与优先级

P1：实时记分性能；网球计分规则与局/盘进度；Quick 比赛开赛前退出/取消生命周期。

P2：移动端日期控件溢出；赛事相册导入我的参赛相册及保存手机；Quick 城市/场地 optional；无意义重新生成对阵；Hall 城市筛选；单循环轮次与跨页面状态一致性。

## 2. 网球计分模型

唯一层级为 Match → Set → Game → Point。Point Log 是实时记分唯一事实源，Game/Set/Match/Result 均由规则引擎从 Point Log 和比赛规则推导，不允许页面维护第二套独立比分真源。

进行中的 Match 必须持续显示“第 X 盘 · 第 Y 局”、当前盘局分和当前 Game 分数。一局结束后提供明确赢局反馈，并进入下一局；一盘结束后明确盘结果并进入下一盘；达到比赛获胜条件后完成 Match 并同步 Result/Draw/Ranking。

普通 Advantage Game：0 → 15 → 30 → 40 → AD → Game；40:40 为 Deuce，必须净胜两分。No-Ad：40:40 后下一分直接赢局。Tiebreak 使用数字分，按规则参数决定触发条件、目标分及净胜要求。

规则模型至少覆盖：比赛盘数/先赢盘数、每盘先胜局数、是否要求净胜两局、抢七触发条件、抢七目标分、Advantage/No-Ad。赛中“撤销上一分”只撤销 Point Log 最近一分；赛后“更正比分”是独立受控流程，不得伪装成赛中 Point 操作。

## 3. 实时记分性能与一致性

当前真机 +1 分出现十几秒等待属于 P1。目标是点击后本地 UI 近即时响应，后台异步可靠持久化。优化必须保留 operation id / idempotency、optimistic version、重复点击防双记、失败回滚或恢复、刷新后 Point Log replay 一致性。禁止以绕过服务端授权、幂等或一致性校验换取速度。

验收关注：连续快速点击、弱网、请求超时但服务端已成功、重复提交、刷新、撤销、双方/多端读取同一 Match 时不得双记、丢分或回退错误。

## 4. Quick Start

Quick 的最低前置仅为：满足比赛类型最低人数的参赛者 + 比赛赛制/计分规则。城市 optional，场地 optional；城市字段不得带必填星号，不得自动写入“北京”或任何推断城市。

创建并成功生成对阵后进入最贴近下一步操作的 Draw/Match 路径，不把用户无意义地送回管理页。具体导航应依据对阵数量：唯一 Match 可突出直接开始/查看该 Match；多 Match 赛事先进入 Draw。

两人单打只有唯一合法对阵，不显示“重新生成对阵”。通用规则：仅当当前参赛结构存在多个合法对阵方案时才允许重新生成。双打/多人存在真实组合空间时可保留。

## 5. Quick / 标准赛事生命周期

Quick 开赛前：创建人可“取消比赛”；非创建人的实际参赛者可“退出比赛”。退出后若人数低于比赛类型最低人数，必须明确提示并按规则取消/终止未开始比赛，不得留下不可进行的幽灵赛事。

真正开始 Match 后，不再提供普通“退出比赛”。此后的中途离开属于退赛/弃权等比赛结果语义，应进入结果模型而不是删除参赛关系。

标准赛事继续遵循：报名开放期本人可退赛；存在候补时按既定规则递补；锁定/开赛后禁止普通报名退赛；比赛开始后的退出使用退赛/弃权语义。

取消赛事进入只读终态，保留必要历史，不允许继续普通编辑/记分/报名。

## 6. 对阵、轮次与状态

单循环赛的对阵按轮次清晰分组（第1轮、第2轮……），Round 不得与网球 Game（局）混用。每个 Match 明确显示：未开始 / 进行中 / 已结束。

比赛完成后 Event Detail、Draw、Match Detail、Result、Ranking、My Events 等读取到的比赛状态、参赛者、比分与胜负必须一致。

## 7. 相册

赛事相册与“我的参赛相册”是两个不同数据域。赛事实际参赛者可从当前赛事相册逐张或批量选择照片，并执行“加入我的参赛相册”。该操作形成 participant 自己的 private personal copy；personal copy 与 source event photo 的权限和删除生命周期解耦，赛事源图删除不得级联删除已成功导入的 personal copy。

同时增加“保存到手机”能力。UI 必须明确区分：
- 加入我的参赛相册：复制到球搭子账户内的个人参赛相册；
- 保存到手机：调用浏览器/设备允许的下载或保存能力，将照片保存到用户本地设备。

赛事相册和我的参赛相册均应提供合理的单张保存入口；批量保存需结合 iOS Safari / 微信 WebView 能力设计降级方案。不得把“从手机相册上传”误写成这里的“导入”。

现有 PHOTO_ALBUM canonical 中 organizer-only 源图管理、participant 查看/主动导入、personal copy 私有性、source delete 解耦等未被本文件修改的安全规则继续有效。

## 8. Hall 与移动端筛选

Hall 筛选维度扩展为 match type + city + level + date。city 过滤只在用户明确选择城市时生效；城市为空的赛事在未筛选城市时仍正常可发现。

修复 iPhone Safari / 微信 WebView 中筛选 Sheet 的 date input 溢出。统一审查 input[type=date]、datetime-local、select 等原生控件：容器 max-width、min-width:0、box-sizing、字体/appearance 和 flex/grid 收缩均不得导致横向溢出。

## 9. PRD 规则吸收原则

吸收成熟且与当前产品方向一致的内容：单循环按轮次组织；Match 状态明确；实时逐分记分；比赛结束后结果/对阵/排名一致；取消为只读终态；比赛和照片入口状态一致。

不机械照搬旧 PRD 中与当前 canonical 冲突的账户、管理员、上传数量/大小、旧页面结构或旧权限模型。发生冲突时必须先做产品语义判断并更新 canonical，不允许测试脚本成为事实源。

## 10. 测试与开发要求

纯规则逻辑进入 Unit；RPC/RLS/Storage/事务/identity/幂等进入 Integration；真实移动端交互、弱网、快速连续记分、相册导入/保存、Quick 退出/取消进入 User Story Browser。谁实现谁不独立 VERIFIED。

当前为开发迭代阶段，不运行 Release Gate 作为开发前置。形成稳定候选版本后再恢复 whitebox → blackbox → candidate → Gate。任何自动化不得自行 merge main 或触发 Production。
