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
