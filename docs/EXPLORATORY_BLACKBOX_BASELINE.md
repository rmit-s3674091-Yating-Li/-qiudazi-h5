# 球搭子探索型浏览器黑盒基线

> 本文是 `Exploratory Browser Blackbox` 的 specialized canonical baseline。它与 `docs/BROWSER_BLACKBOX_BASELINE.md` 的发布级固定黑盒并存：固定黑盒负责 Release Gate 证明，探索黑盒负责在同一 exact-head Preview 上尽量一次发现更多问题。

## 1. 双轨职责

### A. Candidate Browser Blackbox

- workflow：`.github/workflows/candidate-browser-blackbox.yml`；
- 允许 fail-fast；
- 目标是证明当前 exact SHA 是否满足固定发布验收；
- `result.json` + `full-lifecycle-result.json` 均需 `ok=true` 才能作为 Gate 证据；
- 任何真实 P0/P1 都使该 candidate 的发布证明失败。

### B. Exploratory Browser Blackbox

- workflow：`.github/workflows/exploratory-browser-blackbox.yml`；
- runner：GitHub Actions + Playwright；
- 脚本：`qa/exploratory-browser-blackbox.mjs`；
- 目标是主动找 bug，而不是证明 Gate；
- independent scenarios 必须 non-fail-fast：一个场景失败不能阻止其他独立场景继续；
- 最终统一产出 `qa-artifacts-exploratory/exploratory-result.json`、截图和 trace；
- artifact：`exploratory-browser-evidence-<exact SHA>`。

## 2. Exact-head 与 Preview 规则

两条黑盒必须测试同一个 release candidate：

`PR exact head → H5 CI success → release-candidate same SHA → Vercel READY Preview → /build-meta.json sha/ref exact match → 双黑盒`

探索黑盒不得：

- 在 feature branch 本地构建上替代 Preview；
- 使用旧 Preview 或不同 SHA；
- 在 `/build-meta.json` 未确认前开始正式业务测试；
- 将 Vercel OIDC header 注入 BrowserContext 并传播到 Supabase；OIDC 仅用于 exact-head preflight。

## 3. Non-fail-fast 原则

探索型以“尽量一次收集一批问题”为目标：

- 每个场景独立 `try/catch`；
- 每个场景独立记录 `ok/error/evidence`；
- 每个失败尽量保存 screenshot/trace/event id；
- 单个产品失败不应令 workflow 提前退出；
- exact-head / deployment / Playwright runtime 等基础设施级失败可以令 workflow 失败，因为此时后续结果没有可信基础；
- 最终 `exploratory-result.json` 必须包含 `passCount`、`failCount`、完整 scenarios 和 findings。

探索 workflow 的绿色图标不等于“没有 bug”。产品发现由 JSON 内容和后续根因分析决定。

## 4. 首版覆盖

首版至少并行覆盖以下独立场景：

1. deadline：自动 T-2h、随 start time 更新、manual earlier deadline 保持；
2. Privacy persistence：允许值修改、保存、reload 持久化；
3. Quick Start recovery：第一次 draw 故障注入、same-event Retry、pending key 清理；
4. 标准赛事：创建 → 两个隔离用户报名 → Lock roster → 自动首次 draw → Start → 真实保存比分 → Finish；
5. Mobile / WebKit shell：Chromium 375/390/430 + WebKit 390。

后续逐步增加：候补与递补、解锁/重生成、刷新与返回、重复点击/并发操作、更多 organizer/participant/viewer 权限、照片上传/导入/源删除/个人副本存续、中英文视觉等。

固定发布黑盒仍必须保留完整照片 Gate 流程，探索覆盖不能降低 `docs/BROWSER_BLACKBOX_BASELINE.md` 的发布要求。

## 5. 失败分析与批量整改

「球搭子全功能测试」负责消费 exploratory artifact，并一次分析全部 findings：

- `PRODUCT_BLACKBOX_FAILURE`：真实产品行为问题；
- `QA/HARNESS_FAILURE`：locator、wait、race 或测试脚本缺陷；
- `BROWSER_INFRA_FAILURE`：runner、OIDC、DNS、Vercel、Playwright runtime、artifact 等基础设施问题。

对 PRODUCT failures：

- 先读取 live audit backlog 语义去重；
- 同一根因导致的多个表面失败只维护一个 AUD；
- 不同根因可在同一 exploratory run 中批量形成多个 AUD；
- evidence 至少包含 exact SHA、workflow run、scenario、event/match id、trace/screenshot、live DB/Edge/Postgres 与源码链路；
- 整改师可以在一轮中批量修复多个已经完成根因分析的 release-blocking P0/P1，而不是只处理第一个红点。

## 6. Release Gate 关系

探索型不是 Candidate Browser Blackbox 的替代品。

Gate 前必须同时满足：

- fixed Candidate Browser Blackbox 的两个 JSON same SHA 且 `ok=true`；
- same-SHA Exploratory Browser 已完成；
- exploratory 全部 findings 已完成 failure-class/root-cause 分类；
- live backlog 无未处理 release-blocking P0/P1；
- 已分类为 QA/HARNESS 或明确延期 P2 的 finding 可以存在，但不能留下未分析未知失败。

PR head 一旦变化，旧 CI、Preview、Candidate Browser、Exploratory Browser 和 Gate 证据全部失效，新 SHA 重新执行全链。
