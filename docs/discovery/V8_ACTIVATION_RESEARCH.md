# V8｜首次有效行为与角色化激活研究

> 日期：2026-10-02
> 状态：DECISION_CANDIDATE
> 阶段：POST-V7 DISCOVERY / NEXT-VERSION PLANNING
> 边界：纯研究记录，不构成开发任务或发布授权。

## 核心结论

V8 应优先验证 Role-aware Activation / Intent-preserving Entry：用户第一次进入球搭子时，不应先学习整个产品，而应直接完成其当前现实任务。组织者的 first success 是发出一个可响应的约球/赛事；被邀请者是理解场次并完成承诺；探索者是找到一个值得保存、报名或继续查看的真实场次。

## Function pattern

- 入口意图优先于统一 onboarding：邀请、创建、发现入口保留用户已经表达的意图。
- 先完成核心动作，再按需要补身份和资料；身份连续性、战绩归属或权限真正需要时再升级要求。
- 完成第一次场次后，再逐步出现 Play Again、最近球友、最近场地和战绩等复用入口。
- Club、排行榜、完整个人档案和管理员能力采用 progressive disclosure，不在首次体验同时解释。

## UI / UX pattern

- Deep link 直接落在赛事/邀请上下文，不先经过通用首页。
- 首屏只保留一个与当前意图一致的主要 CTA；资料补全、通知和位置授权按需触发。
- 空状态根据角色给第一步，而不是只写“暂无数据”。
- 首次动作完成后的 success state 再承担下一层教育，例如 RSVP 后展示日历/分享，首次完赛后再出现战绩与 Play Again。
- 双语场景优先短动词 CTA 和真实上下文，不依赖长 onboarding carousel。

## Why it works

成熟产品普遍把 activation 定义为价值动作而不是产品设置。Partiful 和 Luma 都允许访客先完成活动 RSVP/registration，再在确有需要时处理账户连续性；Discord Community Onboarding 用少量问题只分配相关频道/角色，并明确避免过多选项；Slack 用 default channels 把新人带到必要空间，而不是要求先理解整个 workspace；Meetup 则把用户自己的日程与 Explore 分开。

## Applicability

高：尤其适用于微信/链接邀请进入的参赛者和第一次组织比赛的人。它可以成为 Intent → Plan → Commitment → Game → Result → Play Again 生命周期的入口层，让不同入口进入不同节点，而不是强迫所有人从首页开始。

## Counterexample / 风险

- 球搭子有战绩归属、搭档和权限，不能完全照搬无账户 RSVP；先行动后身份仍需明确归属边界。
- Discord 式兴趣问卷若被照搬成水平、城市、打法、Club 等长表单，会适得其反。
- Meetup 的 Explore-first 依赖供给密度；公开赛事不足时，把新人送进空大厅会比引导创建/邀请更差。
- 角色不应永久化：同一人可以在不同场次成为组织者或参赛者，应基于当前入口适配。

## 球搭子可能含义

### DECISION_CANDIDATE

把 Role-aware Activation / Intent-preserving Entry 纳入 V8 候选设计原则，但不转开发任务。它不是独立功能，而是未来 Plan、Invitation、Discovery、Play Again 候选进入实现阶段时共同遵循的体验约束。

## Smallest validation

不开发。做三条 3–4 屏静态路径：A 被邀请后先进入通用首页/登录再找赛事；B 被邀请后直接进入赛事承诺页，回应后必要时绑定身份；C 新组织者从“发起第一次约球”进入最小创建。让 5–8 位未使用过球搭子的目标用户完成“朋友发来链接我要参加”和“我想约 4 个人周末打球”两个任务，观察首次价值出现前的步骤、是否知道下一步、何时觉得登录/授权合理，并用“赛事大厅几乎为空”的版本验证 Explore 是否适合作为默认新手路径。

## 建议优先级

中高。跨行业证据强，球搭子自身证据仍弱；研究和原型成本低。

## 未决问题

1. 未登录回应在战绩归属前允许到什么程度？
2. 邀请 deep link 登录后是否能恢复原上下文？
3. 新组织者最小创建信息需与 Pre-event Planning 研究合并验证。
4. 赛事大厅供给达到什么程度后 Explore 才适合作为新用户首要入口？
5. First success 应优先看首次有效承诺/首次成功发出邀请，而不是注册完成率或首页浏览量。
