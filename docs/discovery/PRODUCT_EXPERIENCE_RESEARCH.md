# 球搭子｜产品体验研究台账

> 阶段：V8 DISCOVERY
> 分支：`feature/v8-discovery-planning`
> 边界：仅研究记录；不是产品 canonical、开发任务或发布授权。

## 2026-10-01｜Club UX：不要先做“俱乐部功能集合”，先验证“持续关系容器”

- 状态：DECISION_CANDIDATE / CLUB_DECISION_CANDIDATE
- 原始问题：V7 已经能围绕单场赛事组织人、比赛与结果。V8 若引入 Club，真正要解决的是“同一批人如何持续组织下一次活动、沉淀身份与历史”，而不是再造一个拥有大量菜单的组织后台。
- 证据状态：OBSERVED（公开官方资料）+ HYPOTHESIS（球搭子适用性待用户验证）。

### Observed friction

若直接把 Club 设计成新的一级复杂实体，新用户会同时面对“赛事 / 我的赛事 / 球搭子 / Club / Club 内赛事”等多个对象，组织者也可能被迫先建 Club、配置角色、填资料，再完成本来几步就能完成的约球。更危险的是空 Club：0 活动、少成员、无内容、无历史时，一个漂亮的 Club 首页本身没有价值。

### Reference products / cross-industry evidence

1. Discord Community：新成员面对大量频道和角色容易迷失，因此 Community Onboarding 让管理员先定义少量 default channels，再用少量问题给成员分配相关频道/角色；官方示例明确建议不要给过多选项。可借鉴的是“加入后只暴露当前相关结构”，不是 Discord 的频道模型本身。
2. Slack Workspace：默认频道把新人自动带入共同基础空间；guest 又可只获得一个或若干频道的受限访问。可借鉴的是 role/access progressive disclosure——普通成员不需要看到管理复杂度。
3. Strava Club：移动端 Club 把 club identity、成员、posts、events、stats/weekly leaderboard 放在同一持续容器中；public/private 决定加入方式，owner/admin 创建活动，成员以 Join Event 做轻量承诺。其排行榜还会按周重置，说明“持续但短周期”的反馈比永久总榜更适合活跃社群。
4. Meetup Group：Group 是长期关系容器，Event 是发生在其下的时间性对象；组织者可以围绕场地、活动与成员持续经营。可借鉴 Group→Event 的层级，但 Meetup 的正式组织者工具对 4–8 人临时球局明显过重。
5. SaaS Organization / Workspace 模式（以 Slack 为代表）：组织层主要承担身份、权限、共同空间与治理，而实际工作发生在 channel/project 等下层对象。对球搭子的启发是 Club 不应吞掉 Event；Club 管“谁和谁长期在一起、默认规则/身份是什么”，Event 继续管“一次具体比赛发生什么”。

### Function pattern

建议验证的最小抽象不是“Club = 赛事 + Feed + 群聊 + 排名 + 会员 + 收费 + 场馆 + 管理后台”，而是：

**Persistent Group Identity → Members/Roles → Upcoming Sessions → Lightweight RSVP → Shared History → Play Again**。

Club 只承担跨赛事持续存在的信息：名称/头像/运动类型或标签、成员、极简角色、默认可见性、近期/下一场活动、有限历史。赛事仍是独立生命周期对象，可选择归属于 Club。这样单次赛事用户无需先加入 Club，稳定小组则可以减少重复建人群、重复邀请与重复解释规则。

### UI/UX pattern

Club 首页首屏不应做“管理仪表盘”。普通成员移动端首先应看到：Club identity + 下一场/最近活动 + 一个主 CTA（加入下一场/查看活动）；成员与历史作为次级入口。Admin actions 收进 overflow/settings，只有有权限者才看到。

新 Club 的空状态不展示一排空 Tab 或 0/0/0 指标，而应直接给一个上下文 CTA：`邀请第一位球友` 或 `创建第一次活动`。加入流程优先使用 invite/deep link 进入有上下文的 Club preview，再决定加入；不要先要求用户从全局导航理解“Club 是什么”。

角色也应渐进披露。第一版最多验证 Owner/Admin/Member（甚至 Organizer/Member）是否足够，不要复制 Discord/Slack 的细粒度 permission matrix。排行榜若进入实验，优先考虑周/赛季等有重置感的局部反馈，并让用户看见自己的邻近位置，而不是永久总榜。

### Why it matters

Club 的潜在价值主要是降低重复组织成本和形成复访锚点，而不是增加一个功能入口。若它成功，用户打开球搭子时的心智可能从“我要创建一个赛事”变成“我们这群人下一场什么时候打”。这直接连接已有 R-001/R-002 的 Play Again / 固定小组假设，也可能成为赛事、邀请、战绩、照片未来共同的长期归属层。

### Hypothesis

**高价值 / 中等外部证据 / 球搭子自身证据低到中 / 复杂度中高。**

值得验证：对存在稳定复约关系的用户，一个轻量 Club/Group 容器是否比继续扩充“好友网络”更能降低下一场球的组织成本。若成立，V8 Club 的 MVP 应围绕“成员复用 + 下一场活动 + 历史连续性”，而不是社区 Feed 或完整后台。

### Counterexample / Risk

- Discord Server 是强沟通空间；球搭子目前不是聊天产品。复制频道/聊天室会与微信产生正面竞争，价值证据很弱。
- Slack Workspace 的权限体系为企业治理设计，照搬会把小型球局变成管理员软件。
- Strava Club 的 feed/leaderboard 建立在高频运动记录数据之上；球搭子若赛事频率低，首页排行榜可能长期静止，反而制造“死 Club”感。
- Meetup Group 假设组织本身有公开发现价值；很多球搭子关系可能只是 4–12 人熟人小组，公开 Club 搜索、审核、简介运营未必值得。
- 若真实用户主要是一次性比赛或临时拼人，Club 会成为额外层级而不是效率工具。此时“最近一起打过的人 + 复制上一场”可能已经足够。

### Smallest validation

不开发。做三张同一手机宽度的低保真概念稿，让 5–8 位组织者分别完成“上周这 8 个人想再打一场”的任务：

A. 复制上一场赛事；
B. 最近球友/常用阵容 → 新赛事；
C. Club 首页 → 下一场活动。

只比较：首次点击、完成步骤、是否理解 Club 与 Event 的关系、是否愿意维护成员名单、哪一种最像他们现在微信群里的真实组织方式。再给 C 两个空状态版本——`邀请成员` vs `创建第一场活动`——观察哪个更符合创建 Club 后的自然下一步。

访谈必须追问：过去一个月有多少次与同一批人复约；人员变化比例；谁负责催人；是否存在固定规则/费用/场地；他们是否真的需要一个长期“组织身份”。

### What not to do yet

暂不做 Club Feed、站内群聊、复杂角色权限、付费会员、Club 商城、永久积分总榜、公开 Club 推荐算法、完整 Admin Console，也不要因为“俱乐部”听起来专业就把创建 Club 设为组织赛事的前置步骤。

### 未决问题

1. 产品命名应是“俱乐部 / 球友组 / Crew / Group”中的哪一种，取决于目标规模与正式程度。
2. Club 与现有 Connection 的边界：成员关系是否自动产生好友关系，不应预设。
3. Event 是否可以同时属于 Club 且公开进入赛事大厅，需要单独验证隐私/发现模型。
4. Club 的首个成功指标应更接近“第二场活动形成率/成员重复出席率”，而不是 Club 创建数。
5. 如果 Club 不能显著优于“复制上一场 + 常用阵容”，应拒绝该实体，而不是继续堆功能。

## 2026-10-02｜赛后内容：不要把相册当终点，验证“共同记忆 → 个人留存 → 再约一场”

- 状态：DECISION_CANDIDATE
- 原始问题：赛事结束后，照片、比分和参赛关系已经存在，但如果它们只停留在赛事详情/相册里，用户完成保存后就没有自然的复访理由。V8 应验证赛后内容能否成为下一次关系动作的触发器，而不是继续扩充相册工具。
- 证据状态：OBSERVED（Apple Photos / Google Photos / Strava 官方资料）+ HYPOTHESIS（球搭子适用性待验证）。
- 来源：Apple Shared Albums（2026）、Google Photos sharing/help 与 2025 Recap、Strava activity/club/privacy 官方帮助。

### Observed friction

V7 已解决赛事照片上传、查看与保存等基础能力，但“保存到个人相册”本质仍是文件动作。用户真正有情绪价值的时刻通常发生在完赛后：谁赢了、和谁打了、在哪里、有什么照片、下次还约不约。如果比分在赛果、照片在相册、关系在球搭子、复约在创建赛事，这些信息被拆成多个页面，赛后高意愿窗口会被浪费。

另一个风险是把赛后页做成内容 Feed：对低频用户，一周甚至一个月只有一场球时，Feed 很快变空；为了填 Feed 再引入点赞、评论、关注，会把产品带向与微信/小红书/Instagram 竞争的方向。

### Reference products / cross-industry evidence

1. Apple Shared Albums：参与者可被邀请进入同一共享相册，拥有者可控制“Participants Can Add Photos”；参与者可保存共享内容到自己的照片库。值得借的是“共同空间”和“个人副本”明确分离，而不是复制 iCloud 的账户/订阅体系。
2. Google Photos Shared Album：链接可直接传播；共享相册参与者可以添加内容，用户又可以把单张或全部内容 Save 到自己的 Library。Updates 页面集中呈现最近新增照片、评论等共享活动。值得借的是 event-shared collection → personal library 的双层模型，以及“新增内容”作为回访触发。
3. Google Photos Recap：不是要求用户主动整理历史，而是系统把已有内容重组为可回看的 highlight，并在看完后提供适合分享到群聊/社交平台的短视频和 collage。值得借的是“系统先完成整理，再让用户选择分享”，而不是要求用户编辑一张复杂战报。
4. Strava：Activity 是一次运动事实的长期对象，照片、路线、成绩和社交反馈围绕它聚合；公开 activity 还可以出现在 Club feed、Group Activities、routes 等上下文中，但这些展示继续受 activity/privacy controls 约束。值得借的是“一次真实活动成为可复访记录”，以及同一事实可被不同关系上下文引用而不是复制。
5. Strava Club Posts：活动、路线、赛事可以作为结构化对象嵌入 Club post，并继续尊重原对象隐私。对未来 Club 的启发是：Club 历史不必重新造一套内容，赛事本身可以成为 Club memory 的来源。

### Function pattern

建议验证的不是“更强相册”，而是：

**Finished Event → Auto-composed Match Memory → Shared Event Album → Save to My Memories → Share externally / Play Again**。

Match Memory 只重组已经存在的可信赛事事实：日期、场馆、参赛者、最终赛果、1–3 张代表照片；用户不需要填写新内容。赛事仍是事实源，个人侧只是保存/引用，未来 Club 也只引用赛事，不复制第二套比分、成员和照片。

若赛事后来补传照片，可把“新增了 6 张照片”作为一次轻提醒；不要把每张照片上传都做通知。共同相册与个人收藏要语义分离：共同相册属于赛事，个人保存表示“我想以后再看到它”，不是转移所有权。

### UI/UX pattern

完赛后的默认首屏可以验证一张紧凑的“赛后卡”，视觉优先级建议是：赛果/胜者 → 合照或代表照片 → 日期/场馆/参与者；底部只保留一个关系型主 CTA，例如 `再约一场`，以及 `查看全部照片`、`分享` 等次级动作。

不建议在首屏同时堆“保存、下载、分享、发动态、评论、点赞、加好友、建 Club、再来一场”等按钮。移动端可把 Share / Save / More 收进 bottom sheet 或系统 share sheet；“再约一场”若验证有效，可作为 sticky CTA。

照片页继续适合缩略图 grid + HD lightbox；但“赛事相册”和“我的回忆/我的相册”应通过标题、归属和动作文案明确区分。新增内容状态用轻量 badge/`新增 6 张`，而不是无限红点。空相册的赛后卡仍可成立：没有照片时以赛果和参赛者为主，不用放破图 icon 或大面积空相册占位。

若做分享图，默认应由系统生成稳定版式，而不是先上编辑器。双语环境中姓名、场馆原名不应被强制翻译；日期/比分等结构化字段按 locale 排版。

### Why it matters

赛后是少数同时具备“事实完成 + 情绪高点 + 关系已建立”的时刻。把已有数据自动组合成记忆，可以同时服务三件事：让用户觉得赛事有沉淀价值、自然产生外部分享素材、把“再约一场”放在最有上下文的位置。相比新建 Feed，这条链路更贴近球搭子的已有资产，也可能与 Club 的 Shared History 形成同一个底层模型。

### Hypothesis

**高价值 / 外部证据高 / 球搭子自身证据中低 / 复杂度低到中（若只重组现有数据）。**

值得验证：相比单独的“赛事相册”，一张自动生成、无需编辑的 Match Memory 是否能明显提高用户对“这场球被记录下来了”的感知，并提高外部分享或 Play Again 意愿。若成立，V8 应优先重组已有赛果/照片/成员数据，而不是先做内容社区。

### Counterexample / Risk

- Google Photos 的 Recap 有海量照片和高频历史作为原料；球搭子一场赛事可能没有任何照片，不能假设每场都适合视觉化回顾。
- Strava 的 activity 由 GPS/运动数据持续自动产生；球搭子的比分可能依赖人工记分，若数据不完整，过度包装“战报”反而放大错误。
- Shared Album 的多人投稿适合旅行/家庭；比赛中若所有参与者都可无限上传，组织者可能面对重复图、低质量图和隐私争议。权限不能因为“共同记忆”而默认放宽。
- 自动生成分享卡如果带完整姓名、头像、地点，外部分享可能泄露其他参赛者信息；默认分享内容应比站内赛事详情更克制。
- 若用户只想快速保存一张照片，强迫先经过“回顾仪式”会增加摩擦，因此 Memory 应是入口/摘要，不应阻断原相册操作。

### Smallest validation

不开发。选 5–8 个真实或模拟的已完赛赛事数据，制作三种静态移动端原型：

A. 当前式“赛事已结束 + 查看赛果/相册”；
B. 自动 Match Memory（赛果 + 代表照片 + 人 + 场馆）+ `再约一场`；
C. B + `分享战报` 作为主 CTA。

让参与者回答并实际点击完成三个任务：“想留住这场球”“想发到微信群”“想下周再约同一批人”。记录第一点击、是否理解内容归属、是否担心未经同意分享他人信息、哪一个动作最自然。必须包含“无照片赛事”和“比分不完整赛事”两个边界样本。

同时只定义指标，不上线埋点：完赛后 24h 内赛后卡打开率、相册查看率、外部 share-sheet 唤起率、Play Again 启动率；不要用照片上传量或点赞数替代复访价值。

### What not to do yet

暂不做公共动态 Feed、点赞/评论体系、短视频编辑器、AI 自动剪辑、复杂模板市场、年度报告、Club 内容流、照片人脸识别、自动给参赛者打标签，也不要为了“社交感”默认公开赛事照片或完整参赛者身份。

### 未决问题

1. `再约一场` 是否比 `分享战报` 更适合作为赛后唯一主 CTA，需要任务测试而不是拍脑袋决定。
2. Match Memory 是赛事详情的完成态，还是个人“我的战绩/回忆”的独立入口，需要结合 IA 研究。
3. 代表照片由组织者选、首张图、还是参与者个人选择，暂不应引入算法。
4. Club 若成立，应优先引用这些赛事记忆形成 Shared History，而不是另建 Club Feed 数据模型。
5. 外部分享默认字段需要单独做隐私最小化研究。

## 2026-10-02｜组织者工具：不要先做“大后台”，验证“下一件需要处理的事”工作台

- 状态：DECISION_CANDIDATE
- 原始问题：随着报名、邀请、搭档、开赛、记分和完赛状态增多，组织者真正的成本可能不是缺少更多管理页面，而是每次打开赛事都要自己判断“现在最该处理什么、谁还没确认、什么会阻塞开赛”。
- 证据状态：OBSERVED（Luma / Eventbrite / Linear / Trello 官方资料）+ HYPOTHESIS（球搭子适用性待验证）。

### Observed friction
若把所有组织动作平铺成详情页按钮或管理菜单，动作数量会随生命周期增长；同一个组织者在赛前、开赛前、比赛中和完赛后需要的动作完全不同。V8 若继续增加 Club、周期活动或更多成员状态，这种“自己扫描全页面找异常”的认知成本会进一步放大。

### Reference products / cross-industry evidence
1. Luma Guest List 用 Going / Pending / Waitlist / Invited / Checked In / Not Checked In 等状态形成可操作队列；移动端从 Event → Manage → Guests 进入。
2. Luma Check-in 把现场任务压成 Standard 与 Express 两种模式，并允许 check-in-only 权限，不必开放完整 event management。值得借的是“场景化 task mode + 最小权限”，不是 QR ticket 本身。
3. Eventbrite Organizer 同样把现场 check-in 从完整后台抽离：扫码/姓名搜索、实时到场数、重复或无效票即时错误反馈。
4. Linear 用 Triage 作为正式 workflow 前的 Inbox；Backlog / Todo / In Progress / Done 承载生命周期。可借的是“未处理异常进入明确队列”。
5. Trello Automation 用规则和 card buttons 把稳定重复的多步状态变更压成上下文动作，并基于已出现的重复行为建议自动化。

### Function pattern
建议验证：**Event lifecycle → Contextual organizer inbox → One next action → Immediate state feedback → Exception queue**。

组织者入口不展示所有能力，而优先回答“现在需要处理什么”。只基于已有真实状态生成少量 action cards：未确认、人数不足、搭档未定、到开赛时间尚未开始、存在待完成比分等。没有异常时显示“已准备好 / 下一节点”，而不是空 dashboard。第一版应是 deterministic checklist / state-derived inbox，不是 AI 助手；动作来自已有生命周期事实，不创造第二套状态。

### UI/UX pattern
移动端优先考虑顶部紧凑 lifecycle summary + 1 个主 CTA + 下方最多 2–3 个待处理项。解决后 inline 消失并给轻量 success/undo。高频现场动作可进入临时 task mode，让无关导航和管理动作退到次级位置。权限按任务渐进披露：未来若有 Club/Admin，不应因为某人只帮忙记分或点名就给完整组织权限。

### Why it matters
减少创建表单的几个字段只节省一次操作；减少每场比赛反复检查名单、搭档、开赛和比分状态的扫描成本，会在每次赛事复用。若未来 Club 成立，这套“下一动作”还可能成为 Club 首页比 Feed/统计更实用的 organizer surface。

### Hypothesis
**高价值 / 外部证据高 / 球搭子自身证据中低 / 复杂度低到中（若只从现有状态派生）。**
值得验证：相比“更多管理菜单”，只展示 current blocking/next actions 的 Organizer Inbox 是否能显著降低组织者找到下一步的时间，并减少遗漏。

### Counterexample / Risk
- Eventbrite/Luma 服务大型正式活动，球搭子 4–8 人赛事通常不需要二维码、票务式 check-in 或独立工作人员；照搬会把休闲球局仪式化。
- Linear/Trello 管工作任务；若把每个社交动作都变成 TODO，会让约球像项目管理。
- 自动推断若依赖不可靠状态会比普通页面更危险，因此第一版不能用模糊 AI 判断，也不能隐藏原始名单/赛程入口。
- 小型熟人局若没有明显协调负担，Organizer Inbox 可能只是重复现有详情页。

### Smallest validation
不开发。用同一场 8 人双打的四个时间切片（报名中 / 开赛前 / 进行中 / 临近完赛）制作两套手机原型：A 为完整赛事详情+所有管理按钮；B 为顶部状态摘要 + 一个主 CTA + 最多 3 个待处理项。给 5 位经常组织球局的人连续完成“找出现在最需要处理的事”，记录首次点击、找到动作时间、遗漏项和对“被系统催任务”的反感程度。必须加入一个“没有任何异常”的样本，验证 B 是否能安静退场。

### What not to do yet
暂不做完整 Admin Console、AI organizer、二维码签到、复杂通知中心、自动催人、规则引擎、任务指派、Club 工作流、甘特图或多层角色矩阵。先证明“状态派生的下一动作”本身有价值。

### 未决问题
1. Organizer Inbox 应属于赛事详情的一种状态，还是“我的赛事”上的跨赛事摘要，取决于组织者一次管理多少场。
2. 哪些状态是真 blocker、哪些只是 suggestion，必须避免过度提醒。
3. 临时记分员/协助组织者是否真实存在，决定是否值得引入 task-scoped permission。
4. 若测试显示组织者总能立即找到下一步，则应拒绝该候选，而不是为了“专业管理感”继续扩张。


## 2026-10-02｜留存：不要做“每天来打卡”，验证“关系驱动的下一次约球提示”

- 状态：DECISION_CANDIDATE
- 原始问题：球搭子是低频、多人协调的线下运动产品。若直接照搬日活产品的 streak、签到和积分，会把不可控的天气、场地、身体状态和伙伴时间变成用户的“失败”。V8 更值得验证的是：怎样利用已经发生的共同比赛，帮助用户在自然时间窗口完成下一次真实约球。
- 证据状态：OBSERVED（Duolingo / Nintendo / Headspace / Peloton 官方资料）+ HYPOTHESIS（球搭子适用性待验证）。

### Observed friction

已有 Play Again、固定小组、Club、Match Memory 等 discovery 候选都指向复访，但若没有统一留存原则，很容易继续叠加“连续打球天数、每日签到、提醒、积分、徽章”。问题在于球搭子核心行为不是单人随时可完成：一次有效行为需要至少另一位真实参与者，并受场馆、时间和现实状态约束。用日 streak 衡量，会把产品希望促成的“真实复约”错换成“打开 App 保数字”。

### Reference products / cross-industry evidence

1. Duolingo Friend Streak：双方必须建立互相关系并接受邀请后才形成共同 streak；双方完成真实学习行为才能维持，并允许有限 nudge。官方披露有 Friend Streak 的学习者更可能完成每日课程。可借鉴的是“共同承诺 + 轻提醒”，不是 daily cadence。
2. Duolingo Streak Freeze：即使在高度适合日 streak 的学习场景，产品仍专门提供中断保护，避免一次缺席抹掉长期投入。说明 loss aversion 必须配套容错。
3. Nintendo Switch：用户可从“Users You Played With”回看曾经匹配过的人，并看到共同游戏/日期后再决定建立朋友关系；Friend List 又要求双方同意。可借鉴的是“共同经历 → 后续关系动作”，而不是自动把同场参与者变好友。
4. Headspace：run streak 可以由用户在 Profile 中隐藏/关闭；其规则也明确受时区、飞行模式和技术问题影响。反向证明 streak 本身会制造边界和纠错成本。
5. Peloton：同时存在 weekly/yearly streak、challenge 和 activity recognition；它适合高频个人运动，但对球搭子更值得借的是“周期性反馈”，不是强制每天完成。

### Function pattern

建议验证：**Shared event completed → Natural re-engagement window → Contextual reminder → Reuse people/place/setup → New commitment**。

留存对象不是“连续登录”，而是“下一次真实共同活动”。系统只在有足够上下文时提供轻量复约入口，例如赛后、常见周期临近、最近一起打过的人重新活跃；点击后优先复用上一场的人/场馆/赛制，再由用户确认。提醒应围绕事件关系，而不是制造独立签到任务。

### UI/UX pattern

首页/我的赛事若存在复访提示，应是可消失的 contextual card，例如“上次和这 4 人打球是两周前 · 再约一场”，首屏一个 CTA；dismiss 后不要反复红点轰炸。赛后 Match Memory 可承载 Play Again；个人页可显示“本月打了 4 场”这类事实型反馈，但不要显示即将断掉的火焰倒计时。

对共同关系，优先使用 Nintendo 式“最近一起打过”作为找回入口；只有用户主动确认后才升级 Connection/Club。若未来允许 nudge，应由真实关系中的人发起、频率受限，并清楚显示来源，而不是系统伪装成好友催促。

### Why it matters

这会把留存目标从 DAU/打开次数重新对齐到球搭子的真实价值：更容易再打一场。它还可以把已有候选串成同一闭环——Match Memory 提供情绪入口，recent players/固定小组提供人，常用场馆提供地点，Play Again 形成下一次 commitment；不需要额外发明一套 gamification 状态。

### Hypothesis

**高价值 / 外部证据中高 / 球搭子自身证据低到中 / 复杂度低到中。**

值得验证：对于已有至少一次完赛记录的用户，“基于共同经历、在自然周期出现的再约入口”是否比通用提醒、streak 或积分更能触发下一次赛事创建/报名，同时更少产生通知反感。

### Counterexample / Risk

- Duolingo 的行为可独立、每天、几分钟完成；球赛不具备这些条件，因此 Friend Streak 的日频率和断 streak 压力不应照搬。
- Peloton/Headspace 的个人运动可以由用户单独决定，球搭子复约牵涉他人时间；系统推断“该打了”可能变成社交压力。
- “最近一起打过的人”若默认变好友、默认可联系或默认公开活动，会越过用户关系边界。
- 过早提醒可能在用户受伤、旅行、天气差或赛季暂停时显得冒犯；必须允许 dismiss/snooze/关闭。
- 若真实用户天然通过微信群固定复约，App 提醒可能没有增量价值，Play Again 的低摩擦复用本身可能已经足够。

### Smallest validation

不开发。选 5–8 位过去一个月实际重复约球的用户，用他们最近一场比赛做四个手机概念：A 无提醒；B “连续打球 3 周，保持 streak”；C “上次和这 4 人打球是两周前 · 再约一场”；D 赛后立即出现 Play Again。分别在赛后当天、7 天、14 天情境下询问“你现在会不会点、为什么”，并让其完成一次复约任务。记录 CTA 点击意愿、是否觉得被催、是否希望保留上一场人员/场馆，以及真实复约周期。必须加入“受伤/旅行一个月”的情境测试容错。

### What not to do yet

暂不做每日签到、连续登录天数、断 streak 惩罚、streak freeze 商品、通用积分币、徽章墙、强推通知、自动替好友催人，也不要以 DAU 作为该候选的首要成功定义。先验证“自然时间窗口 + 共同经历 + 一键复用”是否能产生真实下一场。

### 未决问题

1. 自然复约窗口是用户个人历史推断、Club 固定周期，还是由组织者显式设置，应先观察真实周期。
2. Reminder 应属于赛事/Match Memory、首页，还是通知层，取决于无通知时是否已有足够发现性。
3. “最近一起打过”是否需要独立 UI，还是仅作为 Play Again 的人员预填，不应预设。
4. 若用户 dismiss，多久后可再次出现必须克制；优先验证不提醒也能否完成复约。
5. 成功指标应优先是 repeat commitment / repeat event formation，而不是打开率或提醒点击率。


## 2026-10-02｜多人记分与弱网：不要把“已点按钮”当“已保存”，验证可见的提交状态与冲突恢复

- 状态：DECISION_CANDIDATE
- 原始问题：球搭子比赛现场可能由不同参与者在移动端记分、开始/结束对局或修改状态；场馆网络不稳定时，“我刚才点了到底算不算”“另一个人是不是也改了”比单纯 loading 更危险。V8 应验证如何让关键赛事状态在多人、弱网和重复提交下保持可理解、可恢复。
- 证据状态：OBSERVED（Google Docs/Drive、Notion、Trello 官方资料）+ HYPOTHESIS（球搭子适用性待验证）。
- 来源：Google Docs Editors Help（自动保存、多人实时更新、版本历史）、Google Drive Help（离线编辑后重连同步）、Notion Help（离线同步及非文本冲突风险）、Atlassian Trello Support（unsent changes、sync indicators、Sync Queue）。

### Observed friction

现场记分是“低注意力 + 高时效 + 多人可能同时操作”的任务。用户真正需要确认的是业务事实是否已经成为共享状态，而不是按钮有没有响应。若 UI 在网络未确认时立即表现成最终成功，随后后台失败或被另一端覆盖，用户会继续基于错误比分操作；反过来若每次都用全屏 loading，又会阻断连续记分。V8 若增加 Club、协助记分员或更多实时角色，这个问题会进一步放大。

### Reference products / cross-industry evidence

1. Google Docs：在线编辑自动保存，多人同时编辑时可以实时看到他人的变化；Version history 允许查看谁在何时修改并恢复较早版本。值得借的是“持续保存 + 可追溯”，不是把比赛变成文档编辑器。
2. Google Drive offline：离线编辑先保存在设备，重新联网后再同步；官方同时提醒较新的更改可能覆盖较早更改。值得借的是把“本地已接受”和“云端已确认”视为不同状态。
3. Notion offline：页面会后台更新；文本冲突会尝试自动解决，但官方明确指出非文本属性并不总能安全合并，例如两人离线修改同一个 select property 时最终只能保留一个值。比分、比赛状态正更接近这种不可自动合并的结构化字段。
4. Trello mobile：离线变更存在明确的 unsent changes、卡片/board sync indicator 和 Sync Queue；在清缓存/重装前还会警告未同步更改可能丢失。值得借的是“未同步是用户可见状态，并有恢复路径”，不是照搬独立队列页面。
5. Google Docs version history 的蓝点/last edit 还说明：并非每个远端变化都需要 modal；轻量“自上次查看后有更新”可以降低打断。

### Function pattern

建议验证：**Local action accepted → Pending sync → Server-confirmed shared state → Remote update awareness → Conflict/failed-submit recovery**。

关键动作至少在概念上区分“已操作”和“已确认”。正常网络下 pending 应极短、几乎无感；弱网时才显式出现。对比分这类不可安全合并的字段，不要假装 CRDT/last-write-wins 一定正确：当客户端基于旧版本提交时，更安全的产品原则是刷新到最新事实、指出发生变化，并让用户确认下一步，而不是静默覆盖。

### UI/UX pattern

移动端连续记分不适合全屏 spinner。可验证局部 optimistic UI + 很轻的 pending 标识：分数先响应触控，但在服务器确认前显示小型“同步中”；确认后自然消失。失败则原位变成“未保存 · 重试”，保留用户刚才的输入，不把用户踢回首页。

若远端在用户操作前已经改变同一场比赛，优先用 inline banner/bottom sheet 表达“比分刚刚由另一位参与者更新”，展示最新值，并提供“使用最新比分继续”；只有真正不可自动判断的冲突才升级确认。网络断开时应明确“离线/等待同步”，而不是反复 toast“网络错误”。

对于关键状态（开始比赛、提交最终比分、结束赛事），可以比普通加一分更保守：服务端确认前不要让后续不可逆动作看起来已经完成。Undo 适合刚发生、可安全反转的本地动作；版本历史/审计适合争议后的恢复，不需要常驻首屏。

### Why it matters

比赛现场最伤信任的不是慢 500ms，而是“两个手机看到不同事实”或“看起来成功其实没保存”。成熟协作产品共同说明：同步状态、远端变化和恢复路径本身就是产品体验，不应只作为技术实现细节。球搭子如果把这一层做好，未来才有资格增加协助记分、Club organizer 或多人管理，而不是靠频繁强制刷新掩盖一致性问题。

### Hypothesis

**高价值 / 外部证据高 / 球搭子自身证据中 / 复杂度中。**

值得验证：相比“点击即最终成功 + 出错 toast”，对关键比赛状态显式区分 pending/confirmed，并在远端变化时提供轻量上下文恢复，是否能显著减少重复点击、错误覆盖和“到底保存没”的不确定感，同时不拖慢正常记分。

### Counterexample / Risk

- Google Docs 的文本天然适合自动合并；比分和 lifecycle 状态是结构化且有顺序约束的事实，不能照搬“大家同时改也没事”。
- Trello 的 Sync Queue 面向复杂离线工作；球搭子不应为少量现场动作增加一个用户必须管理的“同步中心”。
- 全面 optimistic UI 会在“结束赛事/提交最终比分”这类关键动作上制造假成功；并非所有操作都应先显示成功。
- 每个远端变化都弹 modal 会让比赛无法进行；presence、cursor、谁正在编辑等协作 UI 只有在真实冲突频繁时才值得增加。
- 若实际赛事通常只有一个固定记分员且网络稳定，复杂冲突 UX 可能没有增量价值；此时只需可靠的 pending/error 状态。

### Smallest validation

不开发。用同一场双打做 4 个交互原型：A 点击即成功、失败 toast；B 局部 pending→confirmed；C 弱网下 pending→未保存→原位重试；D 两台手机同时改同一比分时出现“另一位参与者已更新，使用最新比分继续”。让 5–8 人在模拟比赛节奏中连续记 10 个分，并故意注入 2 秒延迟、一次断网、一次远端冲突。观察重复点击、错误继续操作、是否能说清“现在共享比分是多少”、以及提示是否打断比赛。

额外测试“最终比分提交”与普通加分：验证用户是否接受前者更明确的确认状态，而后者保持轻量。

### What not to do yet

暂不做完整离线优先架构、用户可见 Sync Queue、协作光标、实时在线头像墙、复杂锁机制、手工版本树、全局强制刷新，也不要用 last-write-wins 静默覆盖关键比分来换取表面流畅。

### 未决问题

1. V8 哪些动作属于必须 server-confirmed 的关键事实：最终比分、开赛、完赛、晋级至少应单独评估。
2. 普通记分是否允许 optimistic update，取决于当前 API 的幂等性和冲突模型；Discovery 只定义体验原则，不预设实现。
3. 是否需要显示“由谁更新”要看真实多人记分频率；不要为了协作感默认暴露身份。
4. 弱网是否是高频真实场景需要真机场馆验证；若不是，优先级可降低。
5. 这套状态语言应与已有全局网络/同步提示统一，避免同时出现 toast、banner、红点和按钮 loading。
