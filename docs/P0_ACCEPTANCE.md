# 球搭子 H5 MVP｜P0 验收基线（Current）

> 当前长期验收基线。专项真源：照片 `PHOTO_ALBUM_BASELINE.md`；Quick Start `QUICK_START_BASELINE.md`；赛事对阵/计分/轮次/完赛展示 `TOURNAMENT_PRESENTATION_BASELINE.md`；发布 `RELEASE_GOVERNANCE.md`；浏览器证据 `BROWSER_BLACKBOX_BASELINE.md`。

## A. 身份与档案
- [ ] 测试登录态、canonical Profile alias、Player/Connection 分离正确。
- [ ] 身份敏感 RPC/Edge/tournament commit 不假设 `profiles.auth_user_id=auth.uid()` 是唯一映射。

## B. 导航与发现
- [ ] 四个一级导航职责稳定；快速开赛是中央 action，不是第五个 Tab。
- [ ] 私有标准赛事 Hall 仅脱敏预览。
- [ ] 正常 Quick Event 默认 public 进入 Hall，无报名/候补 CTA。
- [ ] 新测试身份 `TST-*`；legacy `QA-* / QA15-* / EXP-*` 仅兼容过滤，测试赛事不污染普通 Hall。
- [ ] 我的赛事有效赛事优先、过期赛事置后；各组按时间规则排序。

## C. 标准赛事生命周期
- [ ] 创建/编辑、报名、deadline、候补、锁定、自动首次 draw、开始赛事、记分、完赛链路完整。
- [ ] 锁定成功但 draw 失败只恢复同一 Event，不重复锁定/创建。
- [ ] 已有真实比赛开始或结束后不得无保护重建签表。

## D. Quick Start
- [ ] self、accepted partner、本人临时 Player 可选；陌生 Player 不可越权加入。
- [ ] 双打必须显式确认队友。
- [ ] 一键开赛创建 Event/Entry/EntryPlayer，锁定名单并自动 draw。
- [ ] alias 身份 create → draw 正常。
- [ ] draw 失败恢复同一 event。

## E. 网球计分与术语
- [ ] 全产品遵循 point → game → set → match → event 层级。
- [ ] `games_6` 用户侧显示“每盘先到6局”，不得让用户理解成6盘或6轮。
- [ ] `best_of=1` 显示“1盘制”；推荐组合为“1盘制 · 每盘先到6局 · 6:6抢七”。
- [ ] `best_of=3` 显示“3盘2胜”；任一方取得2盘后 Match 结束。
- [ ] 比赛详情默认入口为“录入比分”，同时可进入“逐分实时记分”；不得以“直接录入最终比分”误导为只能赛后填赢家。
- [ ] 1盘制合法 6:x 结果只产生一盘并结束 Match，不出现“第2盘～第6盘”。
- [ ] 已完成 Match 才显示“更正比分”。无下游变化时更正确认只说明替换本场赛果；有下游变化时才提示级联影响。

## F. 对阵、排名与完赛一致性
- [ ] 两 Entry、唯一一场 knockout 显示“单场对决”，不显示“决赛”。
- [ ] Match 卡明确 Entry A — VS — Entry B；双打队友保持分组。
- [ ] 单场赛事结果显示“本场胜方 / 另一方”，不显示冠军/亚军。
- [ ] 多轮淘汰赛仍按半决赛/决赛等正常展示赛事名次。
- [ ] 单场 Quick Event 的唯一真实 Match 完成后 Event 自动 `finished` 并写 `finished_at`。
- [ ] Event finished 后 Hall、赛事详情、排名/结果、我的赛事、相册权限必须一致显示已结束。
- [ ] 不得出现 Match 已结束/排名已宣告结果，但 Event/Hall 仍进行中、相册仍不可上传的状态分裂。

## G. 赛事相册
- [ ] Event 未结束不可上传；finished 后 organizer 可上传 JPEG/PNG/WebP 多图。
- [ ] participant 可查看受保护预览并主动加入个人赛事相册，但不能管理源照片。
- [ ] 源照片删除不级联删除已导入个人副本。
- [ ] Storage private、短时授权、服务端权限校验保持有效。

## H. 移动端、语言与错误
- [ ] 中文/English 业务语义一致。
- [ ] 375/390/430px 无 CTA 竖排、头像拉伸、队伍错组、Sheet 溢出。
- [ ] 用户错误不暴露 JWT/SQL/RPC/RLS/Postgres raw stack。

## I. 发布治理
- [ ] fresh DB clean replay。
- [ ] repo migration 14位 version 与 live `schema_migrations.version` 完全一致。
- [ ] exact PR head → CI → release-candidate → Preview/build-meta → Candidate Browser → Exploratory → Gate 全链同 SHA。
- [ ] 修复实施者不得自行把自己实现的问题标记 VERIFIED；必须由独立白盒/浏览器/Gate 验证。
