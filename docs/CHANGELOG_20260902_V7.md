# 球搭子 V7 开发变更记录（2026-09-02）

> 本文件记录 V7 开发状态，不作为产品规则真源。产品规则以 `NEXT_VERSION_PRODUCT_BASELINE_20260902.md` 与对应专项 canonical baseline 为准。
> 状态仅使用 Planned / In Progress / Implemented / Verified。实现者只能推进到 Implemented；Verified 必须来自后续独立验证。

## Scoring Core

状态：**In Progress**

### Implemented
- 实时逐分 UI 使用 near-instant optimistic response；后台按 authoritative snapshot/version 有序持久化，失败后回到服务端事实并 replay。
- Match → Set → Game → Point 规则引擎驱动实时比分；进行中持续展示当前盘/局、局分与当前 Game 分数。
- Advantage / Deuce、No-Ad、抢七/连续抢分均由 ScoringEngine 与 Point Log replay 推导；赛中 Undo last point 与赛后比分更正保持独立语义。
- point command 已建立稳定 operation UUID 链：用户 point 入队时生成一次，pending queue 与持久化请求复用；服务端要求 point 携带合法 `operation_id`，并以该 UUID 作为 authoritative Point Log id。
- 重复 operation 对同一 match/side 幂等返回 authoritative snapshot；跨 point 复用返回 `OPERATION_CONFLICT`；并发 duplicate 在 version conflict 后重新按 operation 查询已提交事实，避免双记。
- Scoring operation-id contract 已纳入 Integration 回归；纯 ScoringEngine 行为由 Domain Unit 覆盖。

### In Progress
- 完成 V7 approved scoring rule 参数化：盘数/先赢盘数、每盘先胜局数、是否净胜两局、抢七触发与目标分、Advantage/No-Ad，并保证旧事件兼容。
- 补齐上述规则参数的 Unit/Integration 与持久化契约后，才可将 Scoring Core 标记为 Implemented。

### Verification pending
- 弱网、请求超时但服务端已成功、连续快速点击、多端读取、刷新 replay、Undo 等真实交互留给后续独立 Browser/真机验证。
- 当前开发阶段不运行 Release Gate；本文件不得把 self-check 或 CI 直接记为 Verified。

## Quick lifecycle / Identity / Hall / Photo / Quick UX / Brand-share

状态：**Planned / In Progress（以各专项 canonical 与当前实现为准）**

这些工作属于并行 Product Interaction 工作区。本文件不复制其动态实现细节，避免与专项文档形成第二真源。完成状态应由对应实现者在读取最新 exact head 后增量更新。

## CI 解释约束

- Domain Unit / Integration / H5 必须按同一 exact head 读取。
- isolated local Supabase 若在 migration replay / integration tests 之前启动失败，只能先分类为 QA/INFRA precondition；没有实际执行到产品契约测试时不得宣称产品失败或通过。
- 谁实现谁不独立 Verified；V7 全范围代码与 canonical 文档完成并达到 same-SHA 可验证状态后，才进入独立验证阶段。
