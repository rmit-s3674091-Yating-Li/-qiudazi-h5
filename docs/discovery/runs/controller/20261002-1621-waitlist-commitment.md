# Waitlist / commitment research — 2026-10-02 16:21 CST

> Backfilled from an automation run that completed the research but could not persist it because recurring-task GitHub writes were blocked by the automation safety layer.
> This note records the conclusion only; it does not authorize implementation.

- Status: HYPOTHESIS / DECISION_CANDIDATE
- Suggested priority: 中高
- Evidence strength: external patterns 中高; 球搭子自身发生频率仍待验证

## Product question

成熟活动平台常见 waitlist，但球搭子是否真的需要完整候补状态机，取决于“满员后仍有需求 + 临时退出 + 人工找替补”是否高频反复发生。

## Cross-industry pattern

成熟活动/报名产品通常把 capacity、waitlist、临时退出后的补位放在同一 commitment flow 中。但这类设计成立的前提是：容量约束明确、需求超过容量、退出会产生真实空位，并且组织者存在持续人工补位成本。

## Implication for 球搭子

不要因为成熟活动平台都有 waitlist 就直接引入完整候补系统。

如果真实用户中“满员后仍有人想参加 + 临时有人退出 + 组织者手工找替补”并不常见，额外状态机会增加理解和治理成本。

如果这一模式反复发生，更薄的 event-scoped 候补 / 补位循环可能比算法推荐、复杂匹配或长期候补池更直接地提高成局率。

## UI/UX implication

优先研究事件内的轻量状态，而不是新增独立候补中心：
- 满员时允许“想补位 / 加入候补”
- 出现空位后向候补者发出有限时响应
- 组织者能看到当前候补与响应状态
- 状态只服务当前赛事，不默认升级为长期关系或公开匹配

## Counterexample / risk

- 小规模熟人局可能直接在微信群里找替补，站内 waitlist 反而多一步。
- 状态过多会增加参赛者和组织者的认知负担。
- 若缺人问题主要发生在开赛前主动找人，而不是“满员后退出”，waitlist 解决的是错的问题。
- 算法匹配或陌生人推荐在该问题尚未验证前明显过重。

## Smallest validation

访谈/任务测试优先确认真实发生频率：
1. 最近 5–10 场里，有几次先满员后又有人退出？
2. 退出后组织者通常如何补位、耗时多久？
3. 是否有人在满员后仍主动表达“有空位叫我”？
4. 对比“候补名单”和“临时缺 1 人 → 发补位邀请”两种轻方案，哪种更自然？

## Decision condition

只有当“满员后的退出与补位”被验证为稳定、高频组织摩擦时，才考虑把 event-scoped waitlist / substitute loop 进入 V8 范围；否则继续保持为研究假设。
