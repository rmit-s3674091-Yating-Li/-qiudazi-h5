# V7 Workboard

> V7 开发阶段的机器可消费工作状态真源。产品规则仍以各 canonical baseline 为准；本文件只记录“当前要做什么 / 做到哪一步 / 为什么被阻塞”。

## 状态机

- `TODO`：尚未实现，可被 Builder 领取。
- `IN_PROGRESS`：Builder 当前唯一开发切片。
- `NEEDS_VERIFY`：已实现并自检，等待独立 Verifier。
- `CODE_REOPEN`：Verifier 已确认 current implementation 存在真实代码/产品缺口；Builder 最高优先级消费。
- `INFRA_BLOCKED`：实现或验证被 CI/runner/外部基础设施阻塞；不得占住 Builder 队列。
- `EXTERNAL_BLOCKED`：依赖外部凭据/服务；不得占住 Builder 队列。
- `BROWSER_PENDING`：低层证据已足够，必须留到 Browser/真机阶段。
- `VERIFIED`：开发阶段独立验证已完成。

## 证据规则

开发阶段采用 **affected-scope evidence**：head 前移后，仅当新 commit 影响该功能的代码、schema、RPC、测试预期或 canonical AC 时，既有验证才失效。纯文档/不相关模块提交不会机械抹掉其他模块的开发期证据。

进入 Candidate Freeze 后切换为 **strict exact-SHA evidence**：Unit / Integration / Build / Preview / Browser / Gate 必须属于同一 candidate SHA。

## 当前 V7 队列

| ID | Area | Priority | State | Current evidence / blocker | Next owner/action |
|---|---|---:|---|---|---|
| V7-SCORE-01 | Scoring transaction/idempotency | P0 | INFRA_BLOCKED | stable operation UUID/lost-response 相关实现已存在；真实 DB Integration 仍依赖 isolated local Supabase runner | Infra 恢复后 Verifier 跑真实 DB behavior；Builder 不原地等待 |
| V7-QUICK-01 | Quick started exit → Event finish | P0 | NEEDS_VERIFY | migration `20260904161500_finish_quick_event_after_match_exit.sql` + regression 已落地 | Verifier 核验单场 finish 与多场不提前 finish |
| V7-ID-01 | Identity/account switching | P1 | TODO | `/login`、real signOut、cache/private-data isolation 尚未形成完整闭环 | Builder |
| V7-PHOTO-01 | Event photo → personal album | P1 | TODO | canonical model 已明确；完整 UI/DB/Storage/Integration 闭环待收口 | Builder |
| V7-QUICK-02 | Unique legal draw regenerate UX | P1 | TODO | canonical rule 已明确 | Builder |
| V7-HALL-01 | Hall/mobile | P1 | BROWSER_PENDING | filter/mobile containment 已实现并有 Unit evidence | Browser/iPhone/WeChat phase |
| V7-BRAND-01 | Brand/share | P1 | TODO | canonical C logo 已明确；raster share/OG/WeChat 链待收口 | Builder |
| V7-VENUE-01 | Standard Event optional venue geolocation | P2 | TODO | Standard-only；Quick 禁止定位；内部只选/存/展示，导航外跳 | Builder after P0/P1 actionable work |
| V7-DOC-01 | V7 canonical/document cleanup | P1 | IN_PROGRESS | Workboard 建立；需同步治理、README/root changelog，并审计过期文档 | Controller/Builder docs slice |
| V7-REPO-01 | Repo dead/legacy artifact cleanup | P2 | TODO | 已发现 bundle/source restore legacy、历史 QA/workflow/CSS 等候选；必须逐项证明无引用/无追溯价值后才删 | Controller audit; no blind deletion |

## 调度规则

Builder 每轮只领取一个 `CODE_REOPEN` 或 `TODO` 的最小垂直切片；优先级 P0 → P1 → P2。`INFRA_BLOCKED` / `EXTERNAL_BLOCKED` / `BROWSER_PENDING` 不得阻塞其他 actionable work。

Verifier 只消费 `NEEDS_VERIFY`，不全量重审整个 V7。无 `NEEDS_VERIFY` 时无需制造结论。

Controller/Watchdog 只检查流水线健康、状态漂移、CI 分类和越界发布，不实施产品代码，也不重复 Verifier 工作。

## 清理安全线

以下内容默认不得因“看起来旧”直接删除：

1. 已执行的 Supabase migration（迁移历史是 clean replay / live parity 的组成部分）。
2. V6 发布历史 `docs/CHANGELOG_20260829_V6.md`。
3. 当前 Release/Environment/Test canonical baseline。
4. 当前仍被 package scripts、workflow、build/deploy、imports 或文档治理引用的文件。

清理候选必须先满足：无运行时/构建/测试引用；无 live migration/release parity 依赖；无必要审计追溯价值；删除后 Unit/Build 与适用 contract 不受影响。无法证明时先标 `LEGACY_REVIEW`，不删除。
