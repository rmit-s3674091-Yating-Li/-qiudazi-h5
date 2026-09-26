# 球搭子｜产品规则基线（Current Product Baseline）

> 状态：当前 H5 MVP 产品真源之一。若旧 PRD / Demo 与本文冲突，以最新明确产品决策、PRD V6 和专项基线为准。照片专项以 `docs/PHOTO_ALBUM_BASELINE.md` 为最终真源；Quick Start 专项以 `docs/QUICK_START_BASELINE.md` 为最终真源。

## 1. 产品目标
球搭子是面向真实网球爱好者的移动端赛事工具，P0 必须是可公网访问、多人共享同一份 Supabase 数据的真实 H5，而不是静态 Demo、IndexedDB 单机 Demo 或微信小程序。

核心链路：创建赛事 → 报名/双打组队/候补 → 截止与名单锁定 → 编排 → 开赛 → 记分 → 排名/晋级 → 完赛 → 战绩 → 赛事相册与个人比赛照片资产。

除标准赛事外，产品支持“快速开赛”动作入口：适用于球友已经在线下/微信群等渠道约好、无需再次招募报名，但仍希望使用球搭子的编排、记分、排名、战绩和照片能力。快速开赛只改变进入比赛的方式，比赛创建后仍使用同一套 Event / Entry / Match / Player 模型。

## 2. 核心实体
- Profile/User：真实使用产品的人和登录身份。
- Player：比赛世界中的长期参赛身份，可先于真实用户存在。
- Connection：两个真实 Profile 之间的 accepted 球搭子关系。
- Event / Entry / Match：赛事、参赛单元、比赛。

禁止用姓名/昵称做关联键；禁止合并 Profile 与 Player。临时 Player 可以先参赛并积累历史，之后由本人加入并关联历史。

## 3. 我的赛事与参与事实
“我的赛事”分“我创建的 / 我参与的”。“我参与的”按有效 Entry → active EntryPlayer → Player.linked_user_id 判断。双打两个真实搭档都属于实际参赛者，不能只看 `signup_user_id`。

接受赛事邀请或双打组队邀请不等于已经形成有效 Entry。

赛事页面 owner / participant / invited / viewer 以服务端 `viewer_role` 等权威事实为准，本地 Profile/cache 不能单独决定管理、记分和比分更正权限。

## 4. 赛事发现与隐私
公开标准赛事可正常发现和查看完整公开详情。私有标准赛事大厅仅展示脱敏预览：赛事名、城市、参赛建议级别、单/双打、赛制、状态和私有标识；不得泄露组织者、参赛人、具体日期时间、场地、费用、报名/候补人数和报名截止时间。

正常用户创建的 `event_mode='quick'` 快速赛事属于公共赛事发现的一部分：默认 `visibility='public'` 并进入赛事大厅，但不重新开启报名、候补或标准赛事 deadline。Hall 可以展示“快速赛事 / 已锁定”等状态，详情权限继续由服务端 viewer_role 与赛事权限模型决定。

自动化 QA 组织者（当前受控命名至少包括 `QA-*` 与 `QA15-*`）创建的 standard/quick 赛事不得进入公共 Hall，无论赛事名称是否带 QA 前缀；测试证据本身仍保留，可在“我的赛事”、直接 URL 和测试上下文访问。

稳定原则：**大厅可发现 ≠ 获得完整详情权限 ≠ 获得报名资格。**

## 5. 参赛建议级别与 Hall 筛选
用户侧统一为区间型“参赛建议级别”：2.0及以下 / 2.5 / 3.0 / 3.5 / 4.0 / 4.5及以上。支持不限、单档、区间、仅最低、仅最高；最低不得高于最高。它只用于发现和匹配，不是硬报名资格。

大厅筛选时用户选择的是**一个单项级别**；只要赛事建议区间包含该级别就匹配。例如筛选 2.5 时，2.0–3.0、2.5–4.0、≤2.5 均可匹配，3.0–4.0 不匹配；不限赛事也匹配。筛选能力不得反向变成报名资格限制。

V7 Hall 筛选维度统一为 **match type + city + level + date**，四个维度可组合生效。city 只有在用户明确填写/选择非空城市时才参与过滤；未筛 city 时，赛事自身 city 为空不得成为不可发现理由。城市比较统一执行 Unicode NFKC、trim 与大小写归一化，避免全半角、首尾空格或大小写差异造成同城赛事误漏。

Hall 的筛选 Sheet / Bottom Sheet / Modal 以及其中 `input[type=date]`、`input[type=datetime-local]`、`select`、city 输入必须适配移动端窄屏：控件和容器允许 flex/grid 收缩，等价满足 `max-width:100%`、`min-width:0`、`box-sizing:border-box` 等 containment 要求，不得在 iPhone Safari / 微信 WebView 形成横向溢出。CSS/Unit 自检只能证明实现存在；真实 iPhone Safari / 微信 WebView 行为留给后续 Browser/真机独立验证。

## 6. 比赛时间、报名截止与名单锁定
比赛日期和开赛时间为 P0 必填。最晚报名时间默认开赛前 2 小时；组织者只能设得更早。修改开赛时间导致截止非法时必须自动收紧并提示。

截止是服务端权限边界。截止后普通报名、双打最终 Entry、组织者代临时 Player 报名、邀请接受、普通退赛等改变名单的路径都必须拒绝；旧页面、深链和直接 RPC 不能绕过。截止后进入“名单锁定/等待编排或开赛”，不等于已经开赛。

标准赛事正常生命周期固定为：**报名 → 锁定名单（自动生成首次对阵）→ 查看/复核对阵 → 开始赛事 → 记分**。组织者确认“锁定名单”后，系统先锁定 roster，随后立即自动调用现有权威 draw engine 生成首次对阵；正常路径不要求用户再寻找或点击一次“生成对阵”。如果锁定已经成功、但首次 draw 因网络或 Edge Function 临时失败，赛事保持 locked，页面必须明确进入“继续生成对阵”恢复态；恢复操作只重试当前 locked event 的 draw，不重复锁定、不修改名单。开赛前人员临时变化时走“解锁名单 → 清空对阵 → 调整名单/候补 → 重新锁定并自动生成”；已经有真实比赛开始或结束后不得解锁或无保护重建签表。首次对阵已生成后，“查看对阵 / 开始赛事”为主要动作，“重新生成对阵”和“解锁名单”为次级受保护动作。

### 6.1 快速开赛
底部现有四个主导航的信息架构保持不变；在导航中央增加凸起圆形主动作“快速开赛”。它是 action，不是第五个长期 Tab，也不得把“战绩”等既有“我的”能力拆出原有归属。

快速开赛面向“人已约好，直接开打”场景：
- 不经过标准赛事的公开/私有招募、报名截止、候补、赛事邀请、双打组队邀请等流程；
- 选择单打/双打后，可从“本人 self Player + accepted Connection 的真实球搭子 self Player + 本人创建的未认领临时 Player”中选择参赛者，并允许现场新增临时 Player；
- 单打至少 2 人；双打至少 4 人且为偶数；双打选择参赛者后必须进入明确“确认双打队友”步骤，让用户看到并调整每队两人组合，不能把勾选顺序作为不可见最终组队规则；
- 城市 optional、场地 optional；不得默认写入北京或任何推断城市。满足参赛者最低人数并配置赛制/计分规则后即可执行“一键开赛”；服务端创建 Event + Entry + EntryPlayer，`event_mode='quick'`，名单直接进入 locked；
- 创建成功后系统自动生成首次对阵并自动进入 `ongoing`，再进入最贴近下一步操作的 Draw/Match 路径；正常路径既不要求额外点击“生成对阵”，也不要求再点击一次“开始赛事”；唯一真实 Match 直接进入 Match，多 Match 先进入 Draw；
- `locked` 是 Quick Event 名单已固定的正确创建状态，不代表 draw 已完成；draw 完成前可以保持 locked + draw_generated=false；
- 如果 Event/Entry 已创建但首次自动 draw 因网络、Edge 或事务临时失败，系统保留已创建赛事并进入“开赛未完成 / 恢复开赛”状态；恢复只能重试该赛事的 draw，**不得再次调用 create_quick_event 产生重复赛事**；刷新页面后也应能恢复该 pending event；
- 新建正常 Quick Event 默认 public 并进入赛事大厅，但 Hall 不提供报名/候补入口；
- “一键开赛”提交前允许返回修改人员；成功链路进入 `ongoing` 后不再提供普通解锁名单作为主路径。正式开赛后遵循普通赛事相同的记分、排名、完赛、战绩和照片规则。

快速开赛不得为了复用标准赛事逻辑伪造未来开赛时间或报名截止时间。`registration_deadline` 对 quick event 不承担权限边界；quick event 的名单由创建动作直接锁定。

Quick Start 的身份链必须统一支持 canonical profile + 受控 auth alias：`list_quick_start_players`、`create_quick_event`、`tournament-command`、`commit_tournament` 与 snapshot/viewer 链路不得再次假设 `profiles.auth_user_id = auth.uid()` 是唯一映射；同时不得扩大 private alias 表对客户端角色的访问权。

详细规则见 `docs/QUICK_START_BASELINE.md`。

## 7. 球搭子、临时 Player 与邀请
“球搭子们”分 accepted Connection 的真实球搭子和尚未关联真实用户的临时球搭子。临时 Player 后台持续保留历史，但创建者前台只看管理必要信息和“已有历史/加入后可解锁”提示。

球搭子关系邀请、赛事邀请、双打组队邀请、临时 Player 加入/历史关联邀请必须保持独立语义。临时 Player claim invite 的 create/get/accept 同样必须使用 canonical current profile 解析，支持当前受控测试 alias。

## 8. 设置、隐私与语言
“我的 → 设置与隐私”承载：
- 头像、水平级别、城市、约球时间、单双打偏好的搭子可见性；
- 允许赛事邀请 / 允许双打组队邀请；
- 参与赛事相册可见范围：`仅自己可见`（默认）/ `搭子可见`；
- 简体中文 / English。

设置与隐私**不承担赛事照片上传、编辑或删除管理**。赛事源相册只能在对应赛事页面由赛事创建人管理。

## 9. 赛事相册与参与赛事相册
### 赛事相册（source）
一场赛事允许多张照片。只有赛事创建人/organizer 能上传和删除赛事源照片；实际参赛者可以查看，但不能管理。公开赛事也不会因此公开照片，普通 viewer、仅 invited 未报名用户、匿名用户均无权读取。

赛事页默认展示受保护水印预览；高清原图必须由 organizer / actual participant 显式触发，并经服务端重新校验后签发短时 URL。`event-photos` 保持 private，不能以 public URL、CSS blur 或前端隐藏按钮代替授权。

organizer 在赛事页执行“删除照片”是真删除源照片：删除源 metadata、源高清、源水印，并阻止以后继续从该源照片导入。但**不能删除参赛者此前已经成功加入自己参与赛事相册的个人副本**。

### 我的参与赛事相册（personal asset）
系统不得自动导入赛事照片。actual participant 必须逐张主动点击“加入我的参与赛事相册”。导入瞬间服务端重新校验参与事实和源照片仍存在，然后复制/固化为该用户自己的独立 private 个人相册资产，不是 EventPhoto 的脆弱收藏引用。

个人资产可以保留 nullable `source_event_photo_id` 追溯来源，但源删除必须 `SET NULL` 或等价解耦，禁止 `ON DELETE CASCADE` 删除个人资产。

用户可“移出我的相册”，该操作只删除自己的个人副本，不影响赛事源和其他用户。

### 搭子查看
整个参与赛事相册默认 private，可在隐私设置改为 partners。只有 accepted Connection 可以查看目标用户开放的个人相册，而且只得到服务端短时签发的水印预览；列表不能下发 Storage path，搭子没有高清、赛事管理或对方相册修改权。

详细规则见 `docs/PHOTO_ALBUM_BASELINE.md`。

## 10. 我的信息架构
“我的”承担个人资产入口：我的打球档案、我的战绩、参与赛事相册、球搭子邀请记录、设置与隐私。三类赛事/个人资产职责不能互相替代。

“编辑头像与昵称”保存成功后应回到明确来源页并替换当前 history 记录；不得再次 push 一个新的“我的打球档案”导致左上返回重新进入编辑页。

## 11. 测试身份与未来登录
当前受控测试阶段可使用昵称选择既有测试身份，公开 ID 不显示；该方案明确不是正式安全登录。后续接入可靠身份体系（如微信）时不得破坏 Profile / Player / 历史赛事关系，微信头像只能 optional 使用。

测试 auth alias 是当前测试阶段兼容机制；所有身份敏感服务端链路必须通过统一 canonical profile 解析处理，而不是各自直接读取 auth_user_id。

## 12. 性能、缓存与错误
稳定页面禁止默认 10–15 秒轮询；优先缓存、stale-while-revalidate、mutation 精准失效。身份/权限敏感页面不得只信本地缓存。用户错误不得暴露 JWT、SQL、RPC、RLS、Supabase raw stack。

错误与提示分级：业务校验说明“发生了什么 + 下一步”；并发冲突只在真实编辑冲突时阻断；后台刷新已有可用缓存时不得用阻塞错误覆盖页面；网络类提示只描述可观察事实，不猜测“网络慢”；成功反馈、普通状态、警告和错误不得长期共用同一视觉/语义层级。

## 13. 发布原则
功能行为变化必须同步 PRD / PRODUCT / INTERACTION / QUICK_START / P0 / CHANGELOG 和必要专项基线。正式候选需通过 build、Supabase clean replay、repo/live migration same-version、权限/Storage 审计、真实黑盒、English 375/390/430 Visual QA 和 Release Gate；不得自动 merge main，不得无节制触发 Vercel。