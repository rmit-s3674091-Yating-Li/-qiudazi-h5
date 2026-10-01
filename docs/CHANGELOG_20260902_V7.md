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
- V7 scoring 参数 persistence schema 已加入 `tiebreak_target`、`tiebreak_win_by_two`、`games_win_by_two`；`save_event` 接受并持久化这些字段，旧客户端缺省值保持 7 / true / true；Snapshot/commit 路径继续携带同一事件规则事实。

### In Progress
- 完成 V7 approved scoring rule 参数化的用户输入与校验收口，并保证旧事件兼容；当前 persistence 已落地，但尚未把整套参数化标记为完成。
- 补齐上述规则参数的 Unit/Integration 与创建/编辑 UI 契约后，才可将 Scoring Core 标记为 Implemented。

### Verification pending
- 弱网、请求超时但服务端已成功、连续快速点击、多端读取、刷新 replay、Undo 等真实交互留给后续独立 Browser/真机验证。
- 当前开发阶段不运行 Release Gate；本文件不得把 self-check 或 CI 直接记为 Verified。

## Hall / mobile

状态：**Implemented / pending independent Browser verification**

### Implemented
- Hall 筛选 Sheet 已增加 city 输入，并与现有 match type、level、date 结果组合生效。
- city 比较在客户端按 Unicode NFKC + trim + case normalization 处理；仅在用户明确输入 city 时启用，因此 city 为空的赛事在未筛城市时仍正常可见。
- 移动端原生 `date` / `datetime-local` / `select` 已加入统一宽度 containment，并覆盖 Sheet / Bottom Sheet / Modal 横向 containment；样式由应用入口加载。
- Hall filter 与 mobile overflow 均已加入 deterministic Domain/Unit regression；当前仅记录 Implemented / SELF-CHECKED，不代表真实 iPhone Safari / 微信 WebView 已 Verified。
- Hall 的 PRODUCT / INTERACTION / VISUAL / USER_STORY canonical AC 已按 V7 approved baseline 同步；USER_STORY 更新保留并恢复了既有 US-G04、Epic H、Epic I、Blackbox 场景生成规则与 AC→AUD 规则，未以 Hall 更新截断其他 canonical 内容。

### Verification pending
- Hall city filter 的真实移动端交互、组合筛选以及 iPhone Safari / 微信 WebView 原生控件/Sheet 行为留待后续独立 Browser/真机验证；当前不得标记 Verified。

## Quick lifecycle

状态：**In Progress**

### Implemented
- 已建立 Quick lifecycle Domain policy 与 deterministic Unit contract，区分 pre-start owner cancel、participant withdraw 与 started 后结果语义。
- owner pre-start cancel 已下沉 authoritative tournament command：仅 owner、仅未开始状态、显式确认，并在成功后写入 `status=cancelled` 与 authoritative `cancelled_at`；cancelled 后普通 tournament mutation 被拒绝。
- `EVENT_LIFECYCLE_BASELINE.md` 已同步 V7 approved lifecycle：participant pre-start withdraw、退出后低于最低人数的受控终止，以及 started 后 ordinary withdrawal 关闭并进入 Retirement / Walkover 结果模型。
- started-exit authoritative DB persistence/RPC 已实现：`resolve_quick_match_exit(...)` 仅在 Quick ongoing Event 上受控处理离场，Match 未开始映射 Walkover、已开始映射 Retirement，并保留 authoritative winner / completion reason；Retirement 不清空既有 Point Log / Set Score，Walkover 不伪造比分。
- started-exit 的 Event completion 已在同一 authoritative transaction 收口：当最后一个 real / non-bye Match 完成时原子写入 Event `status=finished` 与 authoritative `finished_at`；多 Match Event 只要仍有未完成 real Match 就保持 ongoing，避免提前 finished。该行为已有 deterministic low-level regression guard，当前仅记 Implemented / SELF-CHECKED。
- started-exit Edge command 已实现：`tournament-command` 接受受控 `exit`，要求 `match_id + match_version` 与显式确认，并直接路由 authoritative `resolve_quick_match_exit(...)`；MATCH/participant/lifecycle/downstream 错误映射已建立。对应 Edge schema、确认、RPC 路由与错误映射已加入 deterministic Unit contract，当前仅记 Implemented / SELF-CHECKED。
- started-exit 可执行 DB transaction regression 已接入标准 Integration 链，覆盖 single-match Event finish propagation、multi-match non-propagation、identity/stale/downstream guards；当前仅代表 regression 已实现，真实执行仍受 runner 前置阻塞。

### In Progress
- participant pre-start withdraw 在独立核验发现 identity/DB 授权断链后已重新打开整改：Quick Entry 不能依赖 `signup_user_id` 识别实际参赛者，普通 `commit_tournament` 也继续保持 owner-only，禁止为退出功能整体放宽。
- current implementation 新增受控 `withdraw_quick_event` 服务端事务边界：按 Entry → active EntryPlayer → Player.linked_user_id 识别 authenticated participant；仅 Quick、仅 pre-start、non-owner、optimistic version 一致时允许；保留 withdrawn Entry 历史，失效 pre-start draw 原子清理，剩余 confirmed Entry 少于 2 时同事务进入 cancelled 并写 cancelled_at。Edge withdraw command 单独路由该 RPC，普通 tournament mutation 仍走 owner-only `commit_tournament`。
- 上述 participant withdraw 修复当前仅记 **In Progress / SELF-CHECKED**；已补可执行 DB transaction regression，但 isolated local Supabase 尚未实际执行 participant success、non-participant reject、owner reject、started reject、stale-version reject、minimum-participant cancellation，因此不能重新标 Implemented。
- participant withdraw 尚需接入真实 Event UI。
- started 后 Retirement / Walkover 仍缺 Event/Match UI 与跨 Event/Draw/Match/Result/Ranking/My Events 一致性；真实 Edge→RPC→DB / DB transaction Integration 仍需 runner 实际执行，因此不得写成 Verified。
- USER_STORY / PRODUCT / INTERACTION lifecycle AC 继续按实际实现同步；不得因 canonical 已更新而把未实现行为写成完成。

### Verification pending
- owner cancel 的 current-head Domain Unit 历史上已有通过证据；新的 exact head 必须重新读取 same-SHA CI，不复用旧 SHA 结果。authoritative DB/RPC Integration 仍受 isolated local Supabase 启动失败阻塞，因此 owner cancel 继续等待真实事务证据。
- participant withdraw / minimum-participant termination 的真实 DB/RPC transaction 仍需 Integration runner 执行；source/regex contract 不得替代身份与授权行为证据。
- Retirement / Walkover 真实 Edge→RPC→DB / DB transaction Integration 必须覆盖 identity guard、stale version、downstream guard、single-match Event finish propagation 与 multi-match non-propagation；当前 isolated local Supabase 在测试执行前启动失败，只能记 QA/INFRA_BLOCKED。
- Quick cancel / withdraw / minimum-participant termination / Retirement-Walkover 的真实 Browser 场景留给后续独立验证。

## Identity / Photo / Quick UX / Brand-share

状态：**Planned / In Progress（以各专项 canonical 与当前实现为准）**

这些工作继续以对应专项 canonical 与 current exact-head 为事实依据；本文件只记录版本级摘要，避免复制动态实现细节形成第二真源。

## Standard Event venue location

状态：**Planned / In Progress（基础链已实现，真实 POI provider 待接入）**

- 仅标准赛事创建/编辑支持可选场地定位；Quick Start 明确不加入地图/POI 定位链。
- 用户可仅手填场地；需要准确位置时采用“搜索场地或地址 → POI 候选 → 用户选择 → 保存名称/地址/经纬度”的轻量主链，不要求普通用户填写经纬度。
- V7 不做附近网球场推荐/发现、距离排序、球场目录/收藏，不做路线规划、内置导航或导航 SDK；创建页也不要求内嵌完整地图。
- 有合法坐标的 Standard Event 详情仅提供外部地图 handoff；无坐标时只展示场地文本，不出现空地图。外部地图查看/导航不应重复触发 POI 搜索。
- provider-neutral schema / save_event persistence / Standard 主动触发定位基础链已进入实现与验证流程；真实 POI 搜索 provider/credential 仍待配置，按 `EXTERNAL_BLOCKED` 管理，不阻塞其他 V7 P0/P1。
- 数据模型保持 `venue_name/address/latitude/longitude`，并允许 `venue_place_id`、`venue_provider`；地图供应商不得成为 Event 领域真源。
- V7 测试阶段坚持最低成本：免费/试用额度足够时不购买额外地图套餐；正式商业运营前再评估商用授权、配额和单价。
- 后续“附近有哪些网球场 / 球场发现与推荐”作为未来版本独立能力，不进入 V7 scope。

## CI 解释约束

- Domain Unit / Integration / H5 必须按同一 exact head 读取。
- isolated local Supabase 若在 migration replay / integration tests 之前启动失败，只能先分类为 QA/INFRA precondition；没有实际执行到产品契约测试时不得宣称产品失败或通过。
- 谁实现谁不独立 Verified；V7 全范围代码与 canonical 文档完成并达到 same-SHA 可验证状态后，才进入独立验证阶段。
