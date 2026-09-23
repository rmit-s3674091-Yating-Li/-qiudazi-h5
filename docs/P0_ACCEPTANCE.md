# 球搭子 H5 MVP｜P0 验收基线（Current）

> 当前长期验收基线。专项真源：照片 `PHOTO_ALBUM_BASELINE.md`；Quick Start `QUICK_START_BASELINE.md`；赛事编辑/取消/删除 `EVENT_LIFECYCLE_BASELINE.md`；赛事对阵/计分/轮次/完赛展示 `TOURNAMENT_PRESENTATION_BASELINE.md`；发布 `RELEASE_GOVERNANCE.md`；浏览器证据 `BROWSER_BLACKBOX_BASELINE.md`。

## A. 身份与档案
- [ ] 测试登录态、canonical Profile alias、Player/Connection 分离正确。
- [ ] 身份敏感 RPC/Edge/tournament commit 不假设 `profiles.auth_user_id=auth.uid()` 是唯一映射。
- [ ] 关闭头像可见性后，球搭子列表与详情均不得继续泄露头像；前后端返回语义一致。

## B. 导航与发现
- [ ] 四个一级导航职责稳定；快速开赛是中央 action，不是第五个 Tab。
- [ ] 私有标准赛事 Hall 仅脱敏预览。
- [ ] 正常 Quick Event 默认 public 进入 Hall，无报名/候补 CTA。
- [ ] 新测试身份 `TST-*`；legacy `QA-* / QA15-* / EXP-*` 仅兼容过滤，测试赛事不污染普通 Hall。
- [ ] 我的赛事有效赛事优先、过期/结束/取消赛事置后；各组按时间规则排序。

## C. 标准赛事生命周期
- [ ] 创建/编辑、报名、deadline、候补、锁定、自动首次 draw、开始赛事、记分、完赛链路完整。
- [ ] 报名成功后的 `已报名 / 候补中` 是不可点击状态，不得伪装成按钮；后续 Primary Action 与状态分离。
- [ ] owner 在 signup 或 locked 且真实比赛尚未开始时仍能进入赛事设置；开赛后普通编辑入口关闭且服务端拒绝直接 RPC 修改。
- [ ] 未产生任何 Entry 历史的未开赛赛事可以物理删除；产生过报名历史后不得物理删除，只能在未开赛阶段取消并保留历史。
- [ ] cancelled 赛事从公共 Hall 移除，但 owner/participant 的“我的赛事”保留并显示“已取消”；取消后不能继续报名、编排、开赛或记分。
- [ ] 已有报名后，单/双打、赛制、计分规则（含 `advantage / no_ad`）等结构字段被保护；locked 后结构保护进一步收紧。
- [ ] 锁定成功但 draw 失败只恢复同一 Event，不重复锁定/创建。
- [ ] 已有真实比赛开始或结束后不得无保护重建签表、普通取消或删除赛事。

## D. Quick Start
- [ ] “一键开赛”是真正一键：创建 + 锁名单 + 首次 draw + Event 自动 ongoing；不得再次要求“开始赛事”。
- [ ] 唯一真实 Match 直接进入 Match；多 Match 进入 Draw；Quick 正常路径不要求“标记本场已开始”。
- [ ] self、accepted partner、本人临时 Player 可选；陌生 Player 不可越权加入。
- [ ] 双打必须显式确认队友。
- [ ] 一键开赛创建 Event/Entry/EntryPlayer，锁定名单并自动 draw。
- [ ] alias 身份 create → draw → auto-start 正常，且 actor-aware snapshot 全链保持 owner 权限。
- [ ] draw 失败恢复同一 event。

## E. 网球计分与术语
- [ ] 全产品遵循 point → game → set → match → event 层级。
- [ ] `games_6` 用户侧显示“每盘先到6局”，不得让用户理解成6盘或6轮。
- [ ] `best_of=1` 显示“1盘制”；推荐组合为“1盘制 · 每盘先到6局 · 6:6抢七”。
- [ ] `best_of=3` 显示“3盘2胜”；任一方取得2盘后 Match 结束。
- [ ] Advantage 普通局显示 0/15/30/40/AD；No-Ad 在 40:40 显示平分金球且下一分直接 Game；抢七两种普通局规则下均保持目标分+领先2分。
- [ ] `game_scoring` 默认 advantage；创建/编辑可选 advantage/no_ad，但已有有效报名或名单 locked 后不得修改。
- [ ] 比赛详情默认入口为“录入比分”，同时可进入“逐分实时记分”；不得以“直接录入最终比分”误导为只能赛后填赢家。
- [ ] Live 模式 Point Log 是唯一计分真源；当前 point/game/set/match/event 只能由 Event Rules + ScoringEngine replay 派生，不存在可独立编辑局分的第二真源。
- [ ] Live 正常纠错只提供“撤销上一分”；不得出现“删除上一局”、逐局 +/- 或额外“确认结果”。
- [ ] 1盘制合法 6:x 结果只产生一盘并结束 Match，不出现“第2盘～第6盘”。
- [ ] 已完成 Match 的“更正比分”必须遵守生命周期/权限/version；不可安全更正时展示明确降级说明或恢复路径，不通过放宽保护绕过。

## F. 对阵、排名与完赛一致性
- [ ] 两 Entry、唯一一场 knockout 显示“单场对决”，不显示“决赛”。
- [ ] Match 卡与结果页明确 Entry A — VS — Entry B；比分与对应参赛方绑定。
- [ ] 双打每侧两名队友使用两个等权头像/身份位，不把第二名队友降成附属信息。
- [ ] 单场赛事结果显示“本场胜方 / 另一方”，不显示冠军/亚军。
- [ ] 多轮淘汰赛仍按半决赛/决赛等正常展示赛事名次。
- [ ] 单场 Quick Event 的唯一真实 Match 完成后 Event 自动 `finished` 并写 `finished_at`。
- [ ] Event finished 后 Hall、赛事详情、排名/结果、我的赛事、相册权限必须一致显示已结束。
- [ ] 不得出现 Match 已结束/排名已宣告结果，但 Event/Hall 仍进行中、相册仍不可上传的状态分裂。

## G. 赛事相册
- [ ] Event 未结束不可上传；finished 后 organizer 可上传 JPEG/PNG/WebP 多图。
- [ ] participant 可查看受保护预览并主动加入个人赛事相册，但不能管理源照片。
- [ ] viewer / invited 非 actual participant 的赛事详情不展示“合影” Tab；直接调用照片 RPC 仍应被服务端拒绝，而不是通过前端隐藏替代权限。
- [ ] 源照片删除不级联删除已导入个人副本。
- [ ] Storage private、短时授权、服务端权限校验保持有效。
- [ ] 水印在照片主体低透明度斜向重复“球搭子 · 赛事相册”，底部赛事 provenance 仅作补充；不得只在底部放文字冒充水印。
- [ ] 空相册装饰/说明卡不得伪装成可点击上传区；视觉 affordance 与真实点击区域一致。

## H. 移动端、语言与错误
- [ ] 登录前隐私政策无需登录即可访问；登录后“我的”和“设置与隐私”都能稳定进入同一份隐私政策；登录后的设置与隐私可稳定返回“我的”，二级页无底栏时有明确主页出口。
- [ ] 错误/提示遵循分级：业务校验、并发冲突、网络/基础设施、状态/成功反馈语义明确；已有缓存时后台刷新失败不遮挡可用内容。
- [ ] 已取消邀请可批量清理，清理只影响当前用户自己发出的 cancelled 记录。
- [ ] 中文/English 业务语义一致。
- [ ] 375/390/430px 无 CTA 竖排、头像拉伸、队伍错组、Sheet 溢出。
- [ ] 用户错误不暴露 JWT/SQL/RPC/RLS/Postgres raw stack。

## I. 发布治理
- [ ] fresh DB clean replay。
- [ ] repo migration 14位 version 与 live `schema_migrations.version` 完全一致，canonical live manifest 与真实 live 同步。
- [ ] exact PR head → CI → release-candidate → Preview/build-meta → Candidate Browser → Exploratory → Gate 全链同 SHA。
- [ ] 修复实施者不得自行把自己实现的问题标记 VERIFIED；必须由独立白盒/浏览器/Gate 验证。
