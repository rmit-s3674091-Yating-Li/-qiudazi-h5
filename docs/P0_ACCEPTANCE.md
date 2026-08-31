# 球搭子 H5 MVP｜P0 验收基线（Current）

> 当前长期验收基线。照片专项以 `docs/PHOTO_ALBUM_BASELINE.md` 为准；Quick Start 专项以 `docs/QUICK_START_BASELINE.md` 为准；赛事对阵/轮次展示以 `docs/TOURNAMENT_PRESENTATION_BASELINE.md` 为准。发布与候选部署顺序以 `docs/RELEASE_GOVERNANCE.md` 为准；真实浏览器黑盒证据以 `docs/BROWSER_BLACKBOX_BASELINE.md` 为准。快速开赛为 P1 新能力，不替代原 P0 标准赛事链路；其对既有 P0 能力造成的回归仍属于发布阻塞问题。

## A. 身份与档案
- [ ] 首次访问可建立测试登录态并完成昵称资料；返回用户可恢复状态。
- [ ] 测试期昵称身份不展示 public ID，不误称正式安全登录。
- [ ] Profile / Player / Connection 不混淆，昵称不做关联键。
- [ ] 旧 auth session → canonical Profile alias 恢复时服务端仍正确识别赛事角色。
- [ ] 身份敏感 RPC / Edge / tournament commit 不重新假设 `profiles.auth_user_id=auth.uid()` 是唯一映射；受控 alias 能解析到同一 canonical Profile。

## B. 导航与页面职责
- [ ] 底部一级入口保持赛事大厅 / 我的赛事 / 球搭子们 / 我的，四者职责不被新功能改写。
- [ ] 大厅负责发现，不承担创建赛事主入口。
- [ ] 我的赛事分“我创建的 / 我参与的”。
- [ ] 我的包含打球档案、战绩、参与赛事相册、邀请记录、设置与隐私；战绩不拆成新的一级导航。
- [ ] “我参与的”按有效 Entry/Player 事实判断，双打两位真实搭档均正确出现。
- [ ] 若当前候选包含中央“快速开赛”入口，它只能作为 action，不是第五个 Tab；不得遮挡、挤压或破坏四个既有一级导航。
- [ ] “编辑头像与昵称”保存成功后回到明确来源页，不在 history 中重复 push “我的打球档案”导致返回循环。

## C. 赛事创建与发现
- [ ] 创建/编辑支持单/双打、赛制、计分、名额、比赛日期、开赛时间、城市、场地、费用、公开/私有。
- [ ] Event.city 独立必填，不从 venue 猜测。
- [ ] 参赛建议级别支持不限、单边、同档、区间；只用于匹配，不作为硬资格。
- [ ] 大厅级别筛选为单项级别选择；赛事建议范围包含所选级别即可匹配，不把筛选变成报名资格。
- [ ] 私有标准赛事大厅仅展示脱敏预览，不泄露组织者、参赛人、精确时间、场地、费用、人数、截止时间。
- [ ] 正常 `event_mode=quick` 默认 public 并进入普通赛事大厅；卡片不得提供报名/候补入口。
- [ ] 新自动化测试身份统一 `TST-*`；legacy `QA-* / QA15-* / EXP-*` 仅兼容过滤。受控测试组织者创建的 standard/quick 赛事不得进入普通 Hall，无论赛事名称是否带测试前缀。
- [ ] 大厅可发现 ≠ 完整详情权限 ≠ 报名资格；已知 URL/ID 不能绕过。

## D. 报名截止与生命周期
- [ ] 最晚报名时间默认开赛前 2 小时，只能更早。
- [ ] 系统自动截止与用户主动提前截止语义可区分：自动值随比赛日期/开赛时间变化持续重算为 T-2h；用户主动提前的值可保留，超过新上限时自动夹紧并提示。
- [ ] 截止前/瞬间/之后以服务器时间正确执行。
- [ ] 截止后单打/双打报名、临时 Player 代报名、最终 Entry、邀请接受、普通退赛均不能绕过。
- [ ] 旧页面、分享深链、直接 RPC 不能绕过。
- [ ] 截止后即使 cron 尚未更新物理状态，也立即按 locked 语义处理。

## E. 球搭子、临时 Player 与邀请
- [ ] accepted Connection 与临时 Player 分组正确。
- [ ] 临时 Player 完整历史后台保留，但创建者前台只获得必要管理信息。
- [ ] 单打 Entry 一人，双打 Entry 两人，不拆成两个 Entry。
- [ ] 双打第二位真实搭档在报名开放期间能退出整个 Entry；截止/锁定后双方均不能退出。
- [ ] 普通赛事邀请、双打组队邀请、球搭子关系邀请、临时 Player claim invite 语义独立。
- [ ] 临时 Player “邀请 TA 加入球搭子”的 create/get/accept claim invite 在测试 alias 身份下仍使用同一 canonical profile。
- [ ] 正式名额、最多 2 Entry 候补、退赛和递补符合规则。
- [ ] 组织者代报名在 confirmed 剩余名额内支持批量多选临时 Player；当前不得擅自让一个批次跨 confirmed → waitlist。

## F. 权威身份与比赛
- [ ] EventPage / MatchPage 以服务端 `viewer_role` 等权威事实决定 owner/participant/invited/viewer。
- [ ] canonical Profile alias 场景中组织者仍可管理、编排、开赛、记分和更正比分。
- [ ] 单循环、淘汰、分组+淘汰编排正确；Bye、排名、晋级、赛果更正正确。
- [ ] 标准赛事组织者确认锁定名单后，系统立即自动调用权威 draw engine 生成首次对阵；正常路径不要求再点击一次“生成对阵”。锁定成功但首次 draw 临时失败时，页面刷新为真实 locked 状态并提供“继续生成对阵”恢复动作；恢复只重试 draw，不重复锁定或修改名单。
- [ ] 首次对阵已生成后，主要动作是“查看对阵 / 开始赛事”；“重新生成对阵”和“解锁名单”为次级受保护动作。开赛前可解锁→清空对阵→调整名单→重新锁定并自动生成；已有真实比赛开始或结束后不得无保护重建签表。
- [ ] 未生成真实对阵/赛果时不伪造选手、比分或排名。
- [ ] standard/quick、singles/doubles 共用同一赛事轮次展示规则，不按模式分别造词。
- [ ] 整个淘汰赛只有 2 个 Entry、1 场 Match 时显示“单场对决 / Single match”，不显示“决赛 / Final”。
- [ ] 4/8/16 Entry 等多轮淘汰签表按网球常见“半决赛 / 1/4 决赛 / 1/8 决赛 / 决赛”等结构展示；循环赛继续使用“第 N 轮”。
- [ ] Match 卡必须清晰显示 Entry A — VS — Entry B；双打时两名队友保持同一 Entry 分组，不得让四名球员视觉上混成独立个体。

## G. 设置、隐私与语言
- [ ] 设置与隐私可真实保存档案字段可见性。
- [ ] “允许赛事邀请”“允许双打组队邀请”为独立后端执行开关。
- [ ] 设置与隐私中存在“参与赛事相册可见范围”：默认仅自己，可切换搭子可见并持久化。
- [ ] 设置与隐私**不存在赛事源照片上传、删除、移除或组织者照片管理入口**。
- [ ] 简体中文 / English 可切换并持久化；业务逻辑不依赖展示文案。

## H. 赛事源相册
- [ ] 一场赛事支持多张赛事源照片。
- [ ] 赛事未结束不可上传；结束后只有 organizer 可上传 JPEG/PNG/WebP，一次可选择一张或多张。
- [ ] 只有 organizer 可删除赛事源照片；participant 不能上传、替换、删除源照片。
- [ ] 源照片删除入口只在赛事页面；二次确认明确“之后不能再新导入，但已成功保存到个人相册的副本不受影响”。
- [ ] 删除源照片一致清理源 metadata、源 original、源 watermarked preview；失败不得误报成功。
- [ ] stale version / 并发删除不能误删其他新照片或误报成功。
- [ ] 公开赛事也不公开照片；匿名、普通 viewer、仅 invited 未报名用户均无读取权。
- [ ] organizer / actual participant 默认只加载受保护水印预览；显式查看高清时重新授权并签短时 URL。
- [ ] 用户侧不得直接暴露 Postgres/SQL/RPC 原始错误。

## I. 主动加入参与赛事相册
- [ ] 系统不因参赛自动导入任何赛事照片。
- [ ] actual participant 可对当前存在的源照片逐张“加入我的参与赛事相册”。
- [ ] 非 actual participant 即使知道 photo_id 也不能导入。
- [ ] 导入瞬间重新校验 Entry→Player 参与事实和源照片仍存在。
- [ ] 导入成功形成该 Profile 自己的独立 private original + protected preview 个人资产，不是仅保存 EventPhoto 引用。
- [ ] 同一用户同一源照片不能重复导入。
- [ ] `source_event_photo_id` 源删除采用 SET NULL / 等价解耦，禁止级联删除个人资产。
- [ ] organizer 后续删除赛事源照片后：赛事页源照片消失，其他用户不能再新导入；此前已导入个人副本继续存在。

## J. 我的 → 参与赛事相册
- [ ] 我的页面存在“参与赛事相册”入口。
- [ ] 页面只显示本人主动导入成功的个人资产，按赛事分组。
- [ ] 本人可以查看个人受保护水印预览。
- [ ] 当前 P0 不要求本人在个人相册查看高清原图；若已有该能力，必须服务端重校验并签短时 URL。
- [ ] “移出我的相册”只删除本人个人 metadata + personal Storage copies，不影响赛事源或其他用户。
- [ ] 个人删除失败不得误报成功，不能留下明显孤儿资产。

## K. 搭子查看个人相册
- [ ] 默认 private 时 accepted Connection 也看不到。
- [ ] 设置为 partners 后，只有 accepted Connection 能进入目标用户参与赛事相册。
- [ ] 搭子列表不下发 original/preview Storage object path。
- [ ] 搭子每张照片只通过服务端重校验 Connection + visibility 后获得短时水印预览。
- [ ] 搭子没有高清原图、删除、修改、导入或赛事管理权限。
- [ ] 非 Connection、普通 viewer、仅 invited 用户不能读取搭子个人相册。

## L. Storage / 安全 / 数据一致性
- [ ] `event-photos` 保持 private，不使用长期 public URL。
- [ ] 赛事源对象与个人副本路径和权限边界可区分。
- [ ] 客户端不能通过任意 path 删除他人对象。
- [ ] SECURITY DEFINER RPC 均有显式调用 ACL + 业务身份校验；anon 不获得照片管理能力。
- [ ] repository migrations 可从 fresh DB clean replay，并与 live schema / RPC / Edge Function 语义一致。
- [ ] repo migration 文件名的 14 位 version 与 live `supabase_migrations.schema_migrations.version` 完全一致；同语义但不同 version 仍为 Gate blocker。
- [ ] 内部审计 backlog 不向 H5 客户端暴露；`public.audit_issue_registry_readonly` 只用于 backend 受控读取，客户端无 SELECT。

## M. 分享、性能、错误与移动端
- [ ] HashRouter 分享深链正确；私有赛事分享不提升权限。
- [ ] 稳定页面不固定 10/15 秒轮询；mutation 后精准刷新。
- [ ] 用户错误不暴露 Supabase/JWT/SQL/RPC/RLS/Postgres 原始文本。
- [ ] 375 / 390 / 430px 检查中文/英文赛事相册、多图上传、加入按钮、删除确认、个人相册、隐私设置、搭子相册，无溢出/遮挡/不可点击。
- [ ] 赛事详情底部 CTA 不因 flex 挤压变成竖排文字。
- [ ] 快速开赛中央按钮在 375 / 390 / 430px 与 iPhone safe-area 下不遮挡四导航；Quick player fallback avatar 保持圆形固定尺寸。
- [ ] 375 / 390 / 430px 下 Match 卡两支 Entry 与 VS 关系清晰，双打队友不换组、不溢出。

## N. Release Gate
- [ ] H5 Build Check 对**当前 PR exact head**全绿，包括 build、migration preflight 与 Supabase clean replay；不得沿用旧 SHA 的 green 结论。
- [ ] PRD / PRODUCT / INTERACTION / QUICK_START / TOURNAMENT_PRESENTATION / TEST_DATA_GOVERNANCE / VISUAL / PHOTO_ALBUM / P0 / ENVIRONMENT_BASELINE / RELEASE_GOVERNANCE / BROWSER_BLACKBOX_BASELINE / AUDIT_AUTOMATION_GOVERNANCE / CHANGELOG 同步。
- [ ] 发布相关 P0/P1 已独立验证；明确延期且非 Gate 阻塞的 P2 可保留，但不得被误标为已修复。
- [ ] Candidate Freeze 后 `release-candidate` 精确指向当前 PR exact head，且该分支不包含独立开发 commit。
- [ ] Vercel candidate `READY`，`githubCommitRef=release-candidate`、`githubCommitSha=当前 PR exact head`，Preview `/build-meta.json` 返回相同 SHA/ref。
- [ ] 同一 exact head 的 Candidate Browser Blackbox completed/success，artifact 两个核心 JSON `ok=true`；Exploratory Browser 内部 FAIL 必须逐条分类。
- [ ] Candidate Freeze 后任何代码/migration/测试基础设施/canonical docs commit 都使旧 candidate/browser/Gate 证据失效。
- [ ] 不得为了触发 Vercel 而提前 merge/push main；main Production 不能替代 Preview 验证。
- [ ] live P0/P1 未关闭项为 0 后才可 Gate PASS；Gate PASS 后仍需用户明确授权 merge。

## O. 快速开赛 P1 独立验收（不重定义 P0）
- [ ] 中央凸起“快速开赛”是动作入口，不是第五个一级 Tab。
- [ ] 可选择本人、accepted real partner、本人临时 Player，也可现场新增临时 Player；不得加入陌生用户 Player。
- [ ] 单打至少 2 人；双打至少 4 人且偶数。
- [ ] 双打选择参赛者后必须明确确认每一队的两名队友，并可调整组合；不得以隐藏的勾选顺序作为最终组队规则。
- [ ] 快速流程最终主动作是“一键开赛”，正常流程自动 create + lock + first draw，不额外要求人工点击“生成对阵”。
- [ ] `event_mode=quick` 创建后直接 locked；`locked` 表示名单已固定，不等于 draw 已完成。
- [ ] 正常 Quick Event 默认 public 并进入公共 Hall，但无报名/候补 CTA。
- [ ] `TST-*` 与 legacy `QA-* / QA15-* / EXP-*` 自动化组织者的 Quick/standard 赛事不得进入普通 Hall。
- [ ] DB → `list_events` / `get_event_snapshot` → TypeScript `Event` 显式保留 `event_mode`。
- [ ] create_quick_event 已成功但首次 draw 失败时保存 event id/version 并进入“恢复开赛”；只重试已有 event draw，不重复创建。
- [ ] alias 身份下 `list_quick_start_players` / create / tournament-command / commit 均解析同一 canonical profile，且不扩大 private alias 表客户端权限。
- [ ] quick event 后续继续复用 viewer_role、Match、记分、排名、完赛、战绩与照片模型。
- [ ] quick mode 不得改变标准赛事 deadline / waitlist / invite / Player / Storage 权限。
- [ ] Quick Start 生成的淘汰赛也必须服从统一赛事展示：2 Entry 唯一一场显示“单场对决”，双打 Team A — VS — Team B。