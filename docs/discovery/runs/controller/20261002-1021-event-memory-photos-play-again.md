# 赛事照片：共同记忆 → 个人保存 → 再约

- 时间：2026-10-02
- 状态：HYPOTHESIS / DECISION_CANDIDATE
- 建议优先级：中高

## Product question

赛事照片到底应该只是文件附件，还是赛后关系和复约的一部分？

## Sources / evidence

参考 Partiful 的活动后共享照片，以及 Apple Photos、Google Photos 对共享照片、个人图库保存、设备导出等不同语义的区分。

## Function pattern

建议研究一条轻量 Event Memory Surface，而不是建设 Feed：

Event → Shared Photos → Highlights → Personal Save → Memory → Play Again

关键动作需要语义拆分：
- Add to event：把照片贡献到赛事共享来源；
- View：浏览赛事照片；
- Save to collection：在产品内保留为个人可回看的内容；
- Save to device：导出到手机系统相册；
- Play Again：从共同经历回到下一场球。

## UI/UX pattern

- 赛后页面可用少量高质量照片作为情绪入口，不需要变成社交信息流。
- 完整图库仍保持照片优先浏览。
- “保存到我的相册”和“保存到手机”不能使用相同图标/文案。
- Play Again 可以出现在 Match Memory / 赛后回顾附近，而不是强行放进每张照片操作栏。

## Why it works

照片是比赛已经发生的强证据，也是比战绩更有情绪价值的共同记忆。把照片与“下一场”轻连接，可以帮助复访，但不要求用户额外生产内容。

## Applicability to 球搭子

适用于赛后沉淀、固定球友、小组/Club 候选。它与“完整社交 Feed”不同：内容来源是赛事本身，不需要引入关注、点赞、评论等新的社交图谱。

## Counterexample / Risk

- 赛事源照片、个人收藏、设备副本的生命周期容易混淆。
- 删除/移出权限如果不清晰，会造成误删或“为什么别人还看得到”的问题。
- 照片本身不一定能驱动复约；若真实用户只想保存到微信/系统相册，站内长期沉淀价值可能有限。
- 不应为了“社区感”把相册演变成 Feed。

## Smallest validation

不开发。比较三种概念：
A. 当前功能型相册；
B. Match Memory：少量赛事照片 + 赛事结果 + 再约入口；
C. Social Feed：照片流 + 社交互动。

测试用户完成：回看、保存、分享、找到上一场一起打的人、发起下一场。观察哪种最符合真实 JTBD。

## Open questions

- “个人保存”是引用、收藏状态还是独立复制品？
- 用户是否真的需要长期站内相册？
- Match Memory 与完整相册应同页还是分层？
- 什么时候出现 Play Again 最自然？
