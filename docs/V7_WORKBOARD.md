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
| V7-QUICK-01 | Quick started exit → Event finish | P0 | INFRA_BLOCKED | `resolve_quick_match_exit` 已在同一事务实现单场最后一场→Event `finished + finished_at`、多场不提前 finish；`integration-quick-started-exit-behavior.sh` 已覆盖单场 Walkover、多场 Retirement、participant/version/downstream rollback，但 Integration #152 在 `Start isolated local Supabase` 失败，migration replay/behavior tests 未执行 | Infra 恢复后 Verifier 运行真实 DB behavior；当前不得写 CODE_REOPEN/VERIFIED |
| V7-ID-01A | Identity sign-out boundary/cache isolation | P1 | VERIFIED | real `supabase.auth.signOut()` + identity/profile/guest/pending/session storage 清理 + query/in-flight cache clear + `loginRequired`→显式 `/login` boundary 已落地；`unit-identity-session.mjs` 已接入 `test:unit`，Domain Unit #156 PASS。仅验证本切片，不包含 V7-ID-01B nickname exchange/account switch | Done；后续不相关 commit 不机械失效 |
| V7-ID-01B | Nickname identity exchange/account switch | P1 | INFRA_BLOCKED | affected-scope 静态实现与 Domain Unit #167 已通过：test-only Edge 使用 service-role-only normalized nickname lookup，仅返回 one-time magic-link hash，客户端以 `verifyOtp` 恢复 canonical session；DB normalization/唯一索引与 lookup 权限边界已落地。真实 migration replay、duplicate normalized nickname、existing/missing exchange、失败无半登录、刷新后 Profile 绑定仍需 DB Integration；current Integration #163 在 `Start isolated local Supabase` 失败，后续 replay/contracts skipped | Infra 恢复后 Verifier 跑 identity DB/Edge Integration；Browser 阶段再验证 G→老郑私有数据隔离 |
| V7-PHOTO-01 | Event photo → personal album / save to phone | P1 | BROWSER_PENDING | affected-scope 低层证据闭环：赛事相册与“参与赛事相册”均有显式单张“保存到手机”；优先 Web Share files，普通浏览器降级 anchor download，受限 WebView/取图失败降级打开短时 signed photo；取消 share 返回 cancelled；`unit-photo-save.mjs` 已接入 `test:unit`，Domain Unit #167 PASS，H5 build job #569 PASS。既有 source→personal independent copy/delete DB 链未被本切片修改，沿用 affected-scope evidence | Browser/真机验证 iOS Safari/微信 WebView 两处单张保存、取消与降级路径；无需 Builder 继续改代码，除非 Browser 发现真实缺口 |
| V7-QUICK-02 | Unique legal draw regenerate UX | P1 | NEEDS_VERIFY | locked Event 的“重新生成对阵”现仅在 confirmed Entry > 2 时展示；两支 Entry/唯一合法对阵隐藏 destructive no-op；`unit-quick-lifecycle.mjs` 已增加 EventPage source regression guard。Builder self-check only | Verifier：跑 Domain Unit + H5 build；Browser 阶段确认两 Entry 不显示、3+ Entry 仍显示 regenerate |
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
