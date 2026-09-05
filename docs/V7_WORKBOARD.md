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
| V7-QUICK-02 | Unique legal draw regenerate UX | P1 | BROWSER_PENDING | canonical 要求两人单打/唯一合法对阵不显示 regenerate；current `EventPage` 仅在 confirmed Entry `active.length > 2` 时渲染“重新生成对阵”，两 Entry 隐藏 destructive no-op；`unit-quick-lifecycle.mjs` 已锁定该 source contract，`test:unit` 已包含该脚本；current head Domain Unit #175 PASS，H5 build job #577 PASS | Browser 阶段确认两 Entry 不显示、3+ Entry 仍显示 regenerate；低层无需 Builder 继续改代码，除非 Browser 发现真实缺口 |
| V7-HALL-01 | Hall/mobile | P1 | BROWSER_PENDING | filter/mobile containment 已实现并有 Unit evidence | Browser/iPhone/WeChat phase |
| V7-BRAND-01A | Canonical C logo consistency | P1 | VERIFIED | canonical C 识别已在 H5 `.brand-mark`、`public/brand-icon.svg` 与 `public/share-cover.svg` 对齐：sage 圆角方块 + off-white 开放 C；share cover 已移除旧三圆点 pseudo-logo，favicon/apple-touch-icon 均指向 `brand-icon.svg`；`unit-brand-assets.mjs` 已接入 `test:unit`，current head Domain Unit #175 PASS，H5 build job #577 PASS。Raster social preview/真实微信抓取属于独立 V7-BRAND-01B | Done；后续仅在影响品牌资产/`.brand-mark`/canonical 的 commit 下失效 |
| V7-BRAND-01B | Raster social preview / OG / WeChat | P1 | BROWSER_PENDING | affected-scope evidence 闭环：`predev`/`prebuild` 以 Node built-ins 生成 1200×1200 `public/share-cover.png`；OG/Twitter metadata 使用 PNG 并声明 image/png/尺寸；`unit-brand-assets.mjs` 实际生成并校验 PNG signature/dimensions/metadata。current head Domain Unit #184 PASS，H5 build job #586 PASS。canonical 明确要求 Candidate 真实微信抓取/缓存兼容验证，低层证据不能替代平台抓取 | Candidate Browser/真实微信验证分享卡片实际抓取 PNG、缓存与小尺寸识别；若平台失败再区分资产/抓取/缓存问题 |
| V7-VENUE-01A | Standard Event venue location foundation | P2 | INFRA_BLOCKED | affected-scope code/Unit 未发现产品缺口：provider-neutral schema/migration 包含 `venue_name/address/latitude/longitude/place_id/provider`，`save_event` create/edit 持久化并校验坐标成对/范围，旧 `venue`→`venue_name` 兼容；Standard form 仅主动展开后提供“使用当前位置”，Quick 不接 geolocation；`unit-venue-location.mjs` 已进入 `test:unit`，current head Domain Unit #184 PASS，H5 build job #586 PASS。但该切片包含 schema/RPC migration，必须有真实 DB replay/contract；current Integration #180 在 Supabase CLI setup 阶段失败，clean replay job #586 亦在 isolated local Supabase 启动失败，migration replay 均未执行 | Infra 恢复后 Verifier 跑 clean migration replay/save_event DB contract；当前不得因 build/静态 Unit 写 VERIFIED，也不得写 CODE_REOPEN |
| V7-VENUE-01B | Standard Event detail external-map handoff | P2 | BROWSER_PENDING | affected-scope 低层证据闭环：Standard Event 详情优先展示 `venue_name`、可选 `venue_address`；仅 `event_mode!='quick'` 且 `hasVenueCoordinates(e)` 为真时生成 `browserMapProvider.externalMapUrl()`，入口使用 `target="_blank" rel="noreferrer"`，详情页不调用 `getCurrentPosition`。`unit-venue-location.mjs` 已锁定上述 source contract；current head Domain Unit #187 PASS，H5 build job #589 PASS。无需 DB Integration 才能证明本“详情外部 handoff”子切片，底层 venue persistence 仍由 V7-VENUE-01A 单独 INFRA_BLOCKED | Browser 阶段确认 Standard Event 有坐标时入口可用、无坐标时隐藏、Quick 始终隐藏；若浏览器/外部地图行为异常再回开 |
| V7-VENUE-01C | Standard Event place search / map picker provider | P2 | EXTERNAL_BLOCKED | MapProvider 边界已建立；当前未配置真实地点搜索/地图选点 provider credential，未硬编码 Key | Controller 提供 provider/credential 后 Builder 接入；阻塞期间不占开发队列 |
| V7-DOC-01 | V7 canonical/document cleanup | P1 | IN_PROGRESS | Workboard 建立；需同步治理、README/root changelog，并审计过期文档 | Controller/Builder docs slice |
| V7-REPO-01A | Repo restore-bundle legacy audit | P2 | VERIFIED | affected-scope 引用链已复核：`scripts/restore-source.mjs` 明确循环读取 `bundle/chunk00..08.txt`，`.github/workflows/restore-readable-source.yml` 的 Restore deployment source 步骤直接执行该脚本；九个 chunk 当前均存在。依据清理安全线“仍被 workflow/build/deploy 等引用的文件不得因看起来旧而删除”，保留并分类 `LEGACY_REVIEW` 是正确结论，当前没有删除资格 | Done；若未来先移除 restore workflow/script 及其审计/追溯依赖，再重新创建删除评估切片 |
| V7-REPO-01B | Legacy layered CSS import audit | P2 | NEEDS_VERIFY | conservative source audit complete：`src/main.tsx` 当前直接 import `styles.css`、`polish.css`、`v6.css`、`postdeploy.css`、`v7-mobile.css`，因此这些看似历史分层 CSS 仍属于运行时 build dependency，当前无删除资格。此切片未删除或改写 CSS，不需要人为制造功能 regression；证据为 current-head import graph + build dependency 判定 | Verifier 独立确认 import graph/清理安全线；不得仅因文件名含 v6/postdeploy 就删除 |
| V7-REPO-01C | `source.bundle.b64` legacy audit | P2 | NEEDS_VERIFY | current-head audit confirms `source.bundle.b64` is still deliberately emitted by `scripts/pack-source.mjs` / `npm run pack`, while `scripts/restore-source.mjs` restores from `bundle/chunk00..08.txt` and does not read the monolithic file. Because the artifact is still part of an explicit packaging path and its historical release/audit trace value has not been disproved, deletion is not justified under the cleanup safety line; keep it as `LEGACY_REVIEW`. No runtime/source behavior changed, so no synthetic Unit regression is warranted | Verifier independently confirm pack/restore reference graph and conservative `LEGACY_REVIEW` classification; do not delete unless packaging plus release/audit dependency is first proven absent |
| V7-REPO-01D | Repo remaining dead/legacy artifact cleanup | P2 | TODO | restore bundle、layered CSS 与 `source.bundle.b64` 已分别审计；历史 QA/workflow 等其他候选仍未逐项证明无运行/构建/测试/release/审计追溯依赖 | Builder 后续逐项审计；不能证明则继续标 `LEGACY_REVIEW`，不得盲删 |

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
