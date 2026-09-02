# 球搭子｜下一版本并行开发分工（2026-09-02）

> 适用主线：Draft PR #24 / `feature/20260902-next-version-scoring-quick-photo`
> 产品真源：`NEXT_VERSION_PRODUCT_BASELINE_20260902.md`
> 目标：允许项目总控与问题整改工程师并行开发，同时避免修改同一行为/文件造成覆盖、回退和重复实现。

## A. 问题整改工程师独占：Scoring Core

负责 P1-A / P1-B：
- 实时 +1 分十几秒延迟；optimistic near-instant UI；后台可靠持久化。
- Point Log 单一真源；operation id/idempotency；optimistic version；失败恢复；重复点击防双记；refresh/replay 一致。
- Match → Set → Game → Point。
- 第 X 盘 · 第 Y 局、局分、当前分；赢局/赢盘切换反馈。
- Advantage 0/15/30/40/AD/Game、Deuce；No-Ad；Tiebreak 数字分。
- 盘数、先胜局数、净胜规则、抢七触发/目标分、Advantage/No-Ad 等 scoring rule 参数。
- Game/Set/Match/Result 从规则引擎和 Point Log 推导。
- 赛中 Undo last point 与赛后 controlled score correction 分离。
- 直接相关 ScoringEngine、Match scoring UI/state、point command、Unit/Integration、scoring canonical docs。

整改工程师不得修改 B 区范围，除非项目总控显式解除边界。

## B. 项目总控独占：Product Interaction / Lifecycle / Photo / Hall / Identity UX

负责：
- Quick Start：city/venue optional；删除 city `*`；禁止默认北京；最低前置=参赛者+赛制/计分规则；成功后的合理 Draw/Match 导航。
- 对阵操作：两人单打唯一合法对阵时隐藏重新生成；只有存在多个合法方案时显示。
- Quick 生命周期：开赛前创建人取消、参赛者退出；人数不足处理；开赛后转入退赛/弃权结果语义。复核标准赛事报名期退赛入口。
- Hall：移动端 date/datetime-local/select 溢出；新增 city filter，与 match type/level/date 共存。
- Photo：实际参赛者从赛事相册逐张/批量加入“我的参赛相册”；personal copy 与 source 解耦；新增“保存到手机”，与“加入我的参赛相册”清晰区分。
- Identity UX：我的页面“切换账号/退出登录”；显式 `/login`；sign-out 后清 profile/guest credentials/query/pending identity state；IdentityGate 未登录不得静默创建 guest；测试阶段 nickname → canonical test identity 必须走受控后端 exchange，禁止仅凭公开 profile 数据伪造身份；切换后 private 数据不得串号。
- Tournament presentation：单循环按 Round 分组；Match 未开始/进行中/已结束；跨 Event/Draw/Result/Ranking 状态一致中不属于 Scoring Core 的 UI/交互部分。
- 上述范围专项 docs、AC、必要 Unit/Integration。

项目总控不得重写 Scoring Core，除非整改工程师尚未开始且先更新本分工文件。

## C. 并行提交规则

1. 每次写入前读取 PR #24 最新 exact head；永远在最新 head 上增量提交，不 force push、不 reset 他人提交。
2. 尽量不修改同一文件；不可避免的共享文件（如 CHANGELOG/PRODUCT 摘要）由后提交者先读取最新内容再追加，禁止整文件回退。
3. Commit message 使用范围前缀：`scoring:`（整改师）或 `quick:` / `photo:` / `hall:` / `lifecycle:` / `identity:` / `docs:`（总控）。
4. 谁实现谁不独立 VERIFIED；稳定后恢复白盒/黑盒做独立验证。
5. 当前开发阶段不得 merge main、Production、移动 release-candidate 或运行 Gate。

## D. 完成定义

每个工作包只有同时满足以下条件才算 implementation complete：canonical/AC 已同步；代码实现完成；对应 Unit/Integration 已补；无明显跨域回归；待独立验证的真实浏览器场景已登记。最终 release readiness 仍由后续 exact-head whitebox/blackbox/candidate/Gate 判定。
