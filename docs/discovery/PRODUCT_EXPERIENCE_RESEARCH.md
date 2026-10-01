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
