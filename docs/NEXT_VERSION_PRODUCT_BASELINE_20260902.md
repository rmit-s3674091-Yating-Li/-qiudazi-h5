# 球搭子｜下一版本产品基线（2026-09-02）

> 状态：APPROVED FOR DEVELOPMENT
> 基线来源：2026-09-02 产品决策 + 现有 canonical baselines + 已确认可吸收的 PRD 规则。
> 适用范围：下一版本开发分支及其后续 PR。若与旧版 Quick/Photo/Scoring/Identity 描述冲突，以本文件的新版本变更项为准；未明确变更的规则继续沿用既有 canonical baseline。

## 1. 本版本目标与优先级

P1：实时记分性能；网球计分规则与局/盘进度；Quick 比赛开赛前退出/取消生命周期。

P2：移动端日期控件溢出；赛事相册导入我的参赛相册及保存手机；Quick 城市/场地 optional；无意义重新生成对阵；Hall 城市筛选；单循环轮次与跨页面状态一致性；测试阶段账号切换/退出登录；标准赛事创建/编辑支持可选场地定位与轻量 POI 搜索。

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

### 4.1 标准赛事场地定位与轻量 POI 搜索（Standard Event only）

标准赛事创建/编辑增加可选“场地定位”。该能力只用于标准赛事，不进入 Quick Start；Quick 继续保持城市 optional、场地 optional 的最短创建链路，不增加地图、POI 搜索或定位步骤。

场地定位不是赛事创建必填项。用户始终可以仅填写场地名称而不提供定位。需要准确位置时，由用户主动点击“添加场地定位 / 搜索场地或地址”后进入轻量地点搜索；不得在进入创建页时自动请求浏览器/设备定位权限。

V7 的最低可用定位链路明确为：**手填场地，或输入已知场地/地址关键词 → 地图服务返回 POI 候选 → 用户主动选择 → 自动保存场地名称、地址和经纬度 → 赛事详情在有合法坐标时提供外部地图入口。** 普通用户不得被要求手工输入 latitude / longitude。

V7 的 POI 搜索只解决“比赛在哪里”，不解决“我应该去哪里打球”。本版本明确不包含：附近网球场发现/推荐、按距离推荐球场、球场目录/详情、收藏/常用球场、路线规划、内置导航、持续定位。上述“球场发现”能力留待后续版本单独评估。

创建/编辑页不要求内嵌完整地图。优先采用轻量搜索结果列表 + 选中地点确认的交互；如实现供应商提供地图选点，也只能作为辅助选择方式，不得把完整地图变成创建赛事的必经步骤。

“使用当前位置”可作为后续/辅助快捷方式，但不是 V7 场地定位主链路，因为创建赛事时创建者未必身处球场；无论是否提供该快捷方式，都只能在用户主动操作后请求定位权限。

场地展示信息与地理位置事实分离。数据模型至少独立表达：
- `venue_name`：场地展示名称；
- `venue_address`：可选结构化/展示地址；
- `venue_latitude`：可选纬度；
- `venue_longitude`：可选经度；
- `venue_place_id`：可选供应商 POI 标识；
- `venue_provider`：可选地点数据供应商标识。

不得把用户实时位置作为持续跟踪数据。产品只保存用户主动确认的赛事场地静态位置。

球搭子内部的地图职责严格限定为：**搜索/选择场地、保存位置、展示位置。** 不做路线规划，不做实时导航，不接导航 SDK。赛事详情仅在存在合法场地坐标时提供“查看位置 / 去地图查看”等入口，并跳转外部地图服务或地图 App；没有定位的赛事按现有场地文本正常展示，不出现空地图或创建阻塞。

地图实现必须保持 provider-neutral。领域模型、Event schema 和产品流程不得与单一供应商强绑定；V7 测试阶段可优先采用成本最低、满足轻量 POI 搜索的供应商实现，供应商凭据仅用于地点搜索/必要地理编码，不因导航能力购买或接入额外服务。后续更换百度/高德/腾讯/Apple/Google 等供应商不应改变 Event 领域模型。

V7 测试阶段遵循最低成本原则：在免费/试用配额足以满足 MVP 测试时不购买额外地图套餐；真实商业运营前重新评估供应商商用授权、配额和单价。外部地图查看/导航与内部 POI 搜索应解耦，避免浏览赛事详情产生不必要的地点搜索 API 调用。

实现时需保持 create/edit UI、provider abstraction、schema/migration、save_event/RPC、snapshot/detail、外部地图 handoff、权限与测试链一致。真实 POI provider/credential 未配置时应分类为 EXTERNAL_BLOCKED，不得阻塞其他 V7 P0/P1 开发。

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

## 9. 测试阶段账号切换与退出登录

当前版本的“昵称唯一”是测试阶段的用户可见身份入口，不等于可以只凭昵称无认证地冒用任意 Profile。底层 canonical identity 继续由 Supabase Auth user/session 与 Profile 绑定；昵称保持唯一约束，用于测试阶段的人类可读登录/切换入口。

“我的”页面增加“切换账号 / 退出登录”。用户确认后必须：
- 调用真实 sign-out，终止当前 Supabase session；
- 清除当前 profile cache、当前设备保存的 guest/test credentials，以及属于当前身份的 pending/session 临时状态；
- 清空客户端当前用户查询缓存，禁止 My Events / Partners / Photos / Profile 短暂显示上一账号数据；
- 返回明确的 `/login` 登录页面，不允许 IdentityGate 立即静默创建新 guest identity 把用户重新登录。

`/login` 为测试阶段显式身份入口。页面提供：已有昵称登录/切换，以及首次使用创建新昵称。已有昵称恢复必须由受控后端 identity exchange 完成：后端验证唯一 nickname 并签发/恢复对应测试 auth identity；前端不得查询到 Profile 后直接伪造登录态，也不得通过公开 RPC 返回其他用户的 secret/password/session token。

若昵称不存在，用户可明确选择创建新昵称；若昵称已存在，则禁止创建第二个同名 Profile。昵称比较的规范化（至少 trim，并明确大小写/Unicode 策略）必须由数据库唯一约束和服务端逻辑共同保证，不能只靠前端校验。

账号切换的产品流程统一为：“我的 → 切换账号 → 确认退出 → 登录页 → 输入/选择另一昵称 → 进入该账号”。不额外维护一套常驻多账号 token 列表，避免测试阶段在本机长期保存多个账户凭证。

登录成功后所有身份相关数据必须按新 auth user/profile 重新读取。旧账号的 event ownership、报名、球搭子关系、个人参赛相册、隐私设置等数据不删除、不迁移、不共享给新账号。

测试环境可使用专门的受控 Edge Function/RPC 完成 nickname → test identity exchange；该机制必须明确标记为 test-only，未来接入微信登录时替换认证入口，而 Profile/Event/Partner/Photo 等业务身份关系不推翻。

验收至少覆盖：G → sign out → login as 老郑；老郑不得看到 G 的 private My Events/Partners/personal photos；刷新后仍是老郑；再退出回到 `/login`；不存在昵称创建；重复昵称拒绝；错误昵称/失败 exchange 不产生半登录状态；双设备登录不破坏 canonical Profile 绑定。

## 10. PRD 规则吸收原则

吸收成熟且与当前产品方向一致的内容：单循环按轮次组织；Match 状态明确；实时逐分记分；比赛结束后结果/对阵/排名一致；取消为只读终态；比赛和照片入口状态一致。

不机械照搬旧 PRD 中与当前 canonical 冲突的账户、管理员、上传数量/大小、旧页面结构或旧权限模型。发生冲突时必须先做产品语义判断并更新 canonical，不允许测试脚本成为事实源。

## 11. 测试与开发要求

纯规则逻辑进入 Unit；RPC/RLS/Storage/事务/identity/幂等进入 Integration；真实移动端交互、弱网、快速连续记分、相册导入/保存、Quick 退出/取消、账号退出/切换、标准赛事场地 POI 搜索/选择与详情外部地图 handoff 进入 User Story Browser。谁实现谁不独立 VERIFIED。

当前为开发迭代阶段，不运行 Release Gate 作为开发前置。形成稳定候选版本后再恢复 whitebox → blackbox → candidate → Gate。任何自动化不得自行 merge main 或触发 Production。
