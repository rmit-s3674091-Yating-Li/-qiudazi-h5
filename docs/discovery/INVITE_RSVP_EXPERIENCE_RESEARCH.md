# 球搭子 V8 Discovery｜邀请不是“分享功能”，而是一次状态转换

> 日期：2026-10-01
> 主题：邀请 / 分享 / 报名 / 候补的跨行业体验
> 状态：DECISION_CANDIDATE
> 证据：OBSERVED（公开官方资料）+ HYPOTHESIS（球搭子适用性待验证）
> 边界：研究记录，不是产品 canonical、开发任务或发布授权。

## 球搭子的原始问题

邀请如果只被理解成“复制链接 / 系统分享 / 二维码”，产品只优化了传播动作，却没有解决被邀请者真正要完成的任务：**我为什么收到它、我是否有位置、我现在应该做什么、做完以后双方是否都知道我的状态。**

V8 更值得研究的不是增加更多分享渠道，而是把 Invite 视为从外部传播进入产品内部协作状态的桥：

**Contextual invite → commitment → visible state → capacity handling → reminder / recovery → attendance → reusable relationship**。

## Observed friction

1. 通用分享链接容易丢失邀请者和关系上下文。接收者看到赛事详情，却未必知道“谁希望我来”和“我现在最重要的动作是什么”。
2. 分享成功不等于邀请成功。组织者真正需要的是 Going / Pending / Waitlist / Declined / Attended 等可行动状态，而不是“链接已复制”。
3. 要求被邀请者先登录、先理解导航、再找到赛事，会把微信等外部传播带来的意图浪费在产品 onboarding 上。
4. 满员不是简单的 error state。如果用户只看到“已满”，需求和社交传播直接中断；成熟活动产品把它转换成 waitlist/pending 状态。
5. 邀请完成后如果没有“下一步”，社交增长被截断。已报名的人本身可能是最自然的下一位传播者。

## Reference products / cross-industry evidence

### Partiful｜活动邀请

官方资料显示，Partiful 的核心不是一张邀请卡，而是一个可直接从链接进入的 live event page：访客可在浏览器 RSVP，host 实时看到响应；产品强调无需先下载 App。其邀请页同时承载时间、地点、容量、更新与 guest list，减少“收到图片后还要去别处确认”的断裂。

另一个值得借鉴的细节是 past-event relationship reuse：host 邀请 Partiful mutuals 时可以按过去共同参加/举办的活动筛选。这说明一次邀请留下的关系历史可以降低下一次邀请成本，而不必先构建重量级好友体系。

### Luma｜活动 / 票务 / 状态机

Luma 的 registration flow 不要求访客先登录；已登录用户则预填信息。Guest list 将 Going、Pending、Waitlist、Invited、Not Going、Checked In 等状态直接作为管理视图。容量满时，CTA 从 Register 转成 Join Waitlist，而不是把用户送进死胡同。

更重要的是 referral：用户完成注册后，Luma 会提示分享自己的 referral link；接收者能看到“谁邀请你一起参加”，host 也能看到邀请来源。这里的 share 不是孤立按钮，而是放在 commitment 已经发生后的自然时机。

### Airbnb｜多人旅行协作

Airbnb 的 group-trip 模式说明“共同参与一个对象”与“成为长期社交关系”可以分开：共同旅行的人能共享 reservation context，但从 2026 年 9 月起，Connection 需要双方另外发送/接受邀请，不再因为共同参加一次行程自动建立连接。

Shared wishlist 也把 link access、collaboration 和长期关系拆开：有链接的人可以查看；协作者可以投票、备注和调整计划。这对球搭子的重要启发是：**接受赛事邀请 ≠ 自动成为好友 / Club member**，不要把一次性协作强行升级成永久关系。

### Apple Shared Albums｜共享内容

Shared Albums 把参与权限做成非常窄的上下文权限：owner 邀请 subscriber，可允许参与者添加照片；owner 可以移除成员；不使用 iCloud 的人还可通过 public web URL 查看。它证明“围绕一个具体对象共享”可以独立于全局社交网络存在。

对球搭子而言，这比“先成为好友才能看赛事照片/参与赛事”更值得借原则：Event 可以本身成为临时协作边界。

### Meetup｜Group-first 的反例

Meetup 的部分活动要求先是 Group member 才能参加；这对稳定公开社群合理，但对微信里临时收到一场球邀请的人可能是额外门槛。它是重要反例：若球搭子把 Club membership 设成 Event RSVP 的默认前置条件，会把长期组织关系强加给一次性赛事参与。

## Function pattern

建议验证一个统一但轻量的邀请状态模型，而不是继续堆“分享方式”：

**Invite source/context → Event preview → one primary commitment CTA → state confirmation → capacity fallback → post-commit share → optional relationship upgrade**。

关键不是马上规定后台字段，而是让用户体验上清楚区分：

- `被邀请但未决定`
- `已确认参加`
- `等待组织者确认 / 候补`
- `不参加`
- `已到场/实际参加`

邀请来源应在接收页保持上下文，例如“Grace 邀请你参加周六双打”，而不是只显示赛事标题。完成报名以后才出现次级动作“邀请朋友一起”，更符合用户动机时机。

## UI/UX pattern

### 1. Invite landing 应是任务页，不是缩小版赛事后台

首屏优先：赛事名称、时间、地点、邀请者/来源、当前人数或余位、一个主 CTA。规则、赛制、成员详情等渐进披露。不要让被邀请者先穿过首页或赛事大厅。

### 2. 状态 CTA 应替代错误页

有名额：`参加`；需审核：`申请参加`；满员：`加入候补`；已参加：主状态变成 `已参加`，次级提供取消/查看详情。不要用 toast 告诉用户“人数已满”后让页面没有下一步。

### 3. Commitment 之后才请求更多

报名成功页或 inline success state 才是分享给朋友、加到日历、导航、查看参赛者的合适位置。不要在用户尚未决定参加前，用多个分享/社交 CTA 稀释主任务。

### 4. Host 视角用状态分组，不用一张混合名单

移动端可优先用 segmented tabs / chips：Going / Pending / Waitlist / Invited，而不是要求组织者逐个打开成员判断状态。人数变化应即时反馈；高风险动作提供 undo 或明确确认。

### 5. 临时协作与长期关系分离

Event participant 可以拥有赛事内必要权限，但不自动产生 Connection 或 Club membership。赛后或重复共同参赛达到一定上下文时，再出现 `加为球搭子` / `下次再约`，比报名时强制建立关系更自然。

## Why it works / Why it matters

这套模式把“传播指标”从 share click 提升成真正的 social conversion：**邀请打开 → 有上下文 → 做出承诺 → 组织者得到可行动状态 → 参与者继续传播或到场**。

对球搭子价值高，因为赛事天然依赖多人共同完成。邀请链路每少一次登录、导航或状态不确定，都可能直接提升成局率；而 waitlist / pending 让满员和审核从终点变成可恢复状态。

它也可能降低 Club 的过早复杂化：如果 Event 本身已经能很好地承载临时协作、关系复用和下一次邀请，那么只有真正持续的小组才需要升级成 Club。

## Hypothesis

**DECISION_CANDIDATE：高价值 / 外部证据高 / 球搭子自身证据中低 / 复杂度中。**

V8 值得优先验证：把邀请从“分享链接功能”重构为“有上下文的 commitment funnel”，是否比新增更多分享渠道、好友功能或 Club 功能更直接提升赛事成局率。

## Counterexample / Risk

1. Partiful/Luma 的活动通常允许轻量公开 RSVP；球搭子可能涉及真实比赛资格、双打搭档和赛制约束，不能照搬“点一下就 Going”。部分赛事需要 organizer approval 或 partner resolution。
2. Luma 的 waitlist 对大型活动很自然；4 人双打若候补人数长期为 0–1，完整候补管理 UI 可能过重。可先验证简单的“有人退出时通知我”。
3. Referral attribution 很容易滑向增长 gamification。球搭子没有证据需要邀请排行榜、奖励或裂变积分。
4. Airbnb 的一次协作与 Connection 分离值得借鉴，但如果球搭子的核心用户就是固定熟人，过度阻止关系沉淀也可能让复约成本居高。
5. 不应为了“无登录 RSVP”牺牲记分、身份和参赛记录的可信归属；低摩擦入口与需要身份的后续动作可以分阶段，而不是取消身份边界。

## Applicability

- 邀请落地与首次报名：高
- 组织者 guest/participant 状态管理：高
- 满员后的恢复路径：中高
- referral / 二次传播：中
- 自动建立 Connection / Club membership：低，当前不建议
- 邀请奖励/积分裂变：低

## Smallest validation

不开发。用 5–8 位未接触过球搭子的用户做手机宽度原型测试，同一场“朋友微信邀请你周六打双打”，比较：

A. 当前/传统模式：分享卡 → 打开赛事详情 → 自己寻找报名入口；
B. Contextual invite：`Grace 邀请你参加` + 时间/地点/余位 + 单一 `参加` CTA；
C. B 的满员版本：主 CTA 自动变为 `有人退出时通知我 / 加入候补`。

记录：是否能复述自己为什么来到这里、首次点击、完成承诺耗时、是否知道自己当前状态、是否理解“参加赛事”和“成为好友/Club member”是不同事情。

组织者侧再给一张混合名单和一张状态分组名单，让其完成“还有谁没回应、谁在候补、临时空出一个名额应该找谁”三个任务，比较错误率和完成时间。

最后测试报名成功后的两个版本：仅 `完成` vs `邀请朋友一起` + 系统分享，观察用户是否认为后者自然，而不是询问“你喜欢哪个”。

## What not to do yet

- 不做邀请排行榜、裂变积分或奖励系统。
- 不把所有 Event RSVP 自动升级为 Connection。
- 不要求先加入 Club 才能接受普通赛事邀请。
- 不为了完整状态机立即开发复杂候补后台；先验证满员恢复需求频率。
- 不增加 5 种视觉上同权重的分享按钮；优先系统分享 + 必要 fallback。
- 不把“分享次数”当成功指标。优先观察 invite-open → commitment、commitment → attendance、repeat-invite 等更接近真实价值的行为。

## 未决问题

1. 球搭子赛事中哪些场景允许一键参加，哪些必须 organizer approval / partner confirmation？
2. 双打邀请究竟应表达“邀请你参加赛事”还是“邀请你成为我的搭档”，两者是否需要不同 landing context？
3. 微信环境下最小身份确认应放在 commitment 前还是 commitment 后？
4. 小规模比赛的满员恢复，`候补队列` 与 `有人退出通知我` 哪个心智更自然？
5. 哪一种历史关系最值得复用：好友、过去同场、过去搭档、常用阵容，还是 Club 成员？

## Sources / evidence notes

- Partiful official invitation / RSVP pages and Help Center：browser-link RSVP、live event page、past-event mutual filtering。
- Luma Help：registration without mandatory sign-in、guest status model、waitlist、referral links。
- Airbnb Help / Newsroom：group-trip collaboration、shared wishlists、2026-09 mutual Connection model。
- Apple Support：Shared Albums participant permissions and public web access。
- Meetup Help：group-member-first attendance as a useful counterexample。
