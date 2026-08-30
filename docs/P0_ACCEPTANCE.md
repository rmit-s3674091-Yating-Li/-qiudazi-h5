# 球搭子 H5 MVP｜P0 验收基线（Current）

> 当前长期验收基线。照片专项以 `docs/PHOTO_ALBUM_BASELINE.md` 为准。快速开赛为 P1 新能力，不替代原 P0 标准赛事链路；其对既有 P0 能力造成的回归仍属于发布阻塞问题。

## A. 身份与档案
- [ ] 首次访问可建立测试登录态并完成昵称资料；返回用户可恢复状态。
- [ ] 测试期昵称身份不展示 public ID，不误称正式安全登录。
- [ ] Profile / Player / Connection 不混淆，昵称不做关联键。
- [ ] 旧 auth session → canonical Profile alias 恢复时服务端仍正确识别赛事角色。

## B. 导航与页面职责
- [ ] 底部一级入口保持赛事大厅 / 我的赛事 / 球搭子们 / 我的，四者职责不被新功能改写。
- [ ] 大厅负责发现，不承担创建赛事主入口。
- [ ] 我的赛事分“我创建的 / 我参与的”。
- [ ] 我的包含打球档案、战绩、参与赛事相册、邀请记录、设置与隐私；战绩不拆成新的一级导航。
- [ ] “我参与的”按有效 Entry/Player 事实判断，双打两位真实搭档均正确出现。
- [ ] 若当前候选包含中央“快速开赛”入口，它只能作为 action，不是第五个 Tab；不得遮挡、挤压或破坏四个既有一级导航。

## C. 赛事创建与发现
- [ ] 创建/编辑支持单/双打、赛制、计分、名额、比赛日期、开赛时间、城市、场地、费用、公开/私有。
- [ ] Event.city 独立必填，不从 venue 猜测。
- [ ] 参赛建议级别支持不限、单边、同档、区间；只用于匹配，不作为硬资格。
- [ ] 私有标准赛事大厅仅展示脱敏预览，不泄露组织者、参赛人、精确时间、场地、费用、人数、截止时间。
- [ ] `event_mode=quick` 不进入普通赛事大厅；只在创建人和实际参赛者自己的赛事上下文出现，不能复用私有赛事脱敏发现卡。
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
- [ ] 普通赛事邀请、双打组队邀请、球搭子关系邀请语义独立。
- [ ] 正式名额、最多 2 Entry 候补、退赛和递补符合规则。
- [ ] 组织者代报名在 confirmed 剩余名额内支持批量多选临时 Player；当前不得擅自让一个批次跨 confirmed → waitlist，候补继续保持既有单 Entry 规则，直到另有明确产品决策。

## F. 权威身份与比赛
- [ ] EventPage / MatchPage 以服务端 `viewer_role` 等权威事实决定 owner/participant/invited/viewer。
- [ ] canonical Profile alias 场景中组织者仍可管理、编排、开赛、记分和更正比分。
- [ ] 单循环、淘汰、分组+淘汰编排正确；Bye、排名、晋级、赛果更正正确。
- [ ] 标准赛事锁定名单后的首次编排入口清晰；若产品实现自动生成首次对阵，则仍保留开赛前调整/解锁的安全路径，且不允许已经开赛后无保护重建签表。
- [ ] 未生成真实对阵/赛果时不伪造选手、比分或排名。

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
- [ ] 用户侧不得直接暴露 Postgres/SQL/RPC 原始错误，如 ambiguous column、constraint、RLS 或 stack 文案。

## I. 主动加入参与赛事相册
- [ ] 系统不因参赛自动导入任何赛事照片。
- [ ] actual participant 可对当前存在的源照片逐张“加入我的参与赛事相册”。
- [ ] 非 actual participant 即使知道 photo_id 也不能导入。
- [ ] 导入瞬间重新校验 Entry→Player 参与事实和源照片仍存在。
- [ ] 导入成功形成该 Profile 自己的独立 private original + protected preview 个人资产，不是仅保存 EventPhoto 引用。
- [ ] 同一用户同一源照片不能重复导入。
- [ ] `source_event_photo_id` 源删除采用 SET NULL / 等价解耦，禁止级联删除个人资产。
- [ ] organizer 后续删除赛事源照片后：赛事页源照片消失，其他用户不能再新导入；**此前已导入个人副本继续存在、可查看、可分享给搭子（若用户开启）**。

## J. 我的 → 参与赛事相册
- [ ] 我的页面存在“参与赛事相册”入口。
- [ ] 页面只显示本人主动导入成功的个人资产，按赛事分组。
- [ ] 本人可以查看个人受保护水印预览。
- [ ] 当前 P0 不要求本人在个人相册查看高清原图；若已有该能力，必须服务端重校验并签短时 URL，列表不得下发长期 URL 或 Storage path。
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
- [ ] 内部审计 backlog 不向 H5 客户端暴露；`public.audit_issue_registry_readonly` 只用于 backend 受控读取，客户端无 SELECT。

## M. 分享、性能、错误与移动端
- [ ] HashRouter 分享深链正确；私有赛事分享不提升权限。
- [ ] 稳定页面不固定 10/15 秒轮询；mutation 后精准刷新。
- [ ] 用户错误不暴露 Supabase/JWT/SQL/RPC/RLS/Postgres 原始文本。
- [ ] 375 / 390 / 430px 检查中文/英文赛事相册、多图上传、加入按钮、删除确认、个人相册、隐私设置、搭子相册，无溢出/遮挡/不可点击。
- [ ] 若当前候选包含快速开赛中央按钮，375 / 390 / 430px 与 iPhone safe-area 下必须不遮挡四个既有导航；中文/English 文案不挤压导航。

## N. Release Gate
- [ ] H5 Build Check 全绿，包括 build 与 Supabase clean replay。
- [ ] PRD / PRODUCT / INTERACTION / VISUAL / PHOTO_ALBUM / P0 / AUDIT_AUTOMATION_GOVERNANCE / CHANGELOG 同步。
- [ ] 发布相关 P0/P1 已独立验证。
- [ ] 完整候选后才受控触发一次 Vercel Preview；真实黑盒、Visual/UX、English QA 通过后才进入 CloudBase。
- [ ] 快速开赛作为 P1 不因“尚未成为 P0”被机械判失败；但若它已进入候选且造成既有导航/P0 页面回归、权限扩大或标准赛事生命周期回归，则 Gate 必须阻塞。
- [ ] 未通过 Gate 不自动 merge main。

## O. 快速开赛 P1 独立验收（不重定义 P0）

以下是当前分支已实现/正在收口的 P1 新能力，用于独立验证，不将其改写为原 P0 必备链路：

- [ ] 中央凸起“快速开赛”是动作入口，不是第五个一级 Tab。
- [ ] 快速流程：单打/双打 → 选择已有/临时 Player → 城市/可选场地/赛制/计分 → 确认并生成对阵。
- [ ] 单打至少 2 人；双打至少 4 人且偶数；当前双打按选择顺序两两成队。
- [ ] `event_mode=quick` 直接形成 locked Event/Entry/EntryPlayer，不走报名截止、候补、普通赛事邀请。
- [ ] DB → `list_events` / `get_event_snapshot` → TypeScript `Event` 必须显式保留 `event_mode`，不得靠 status/deadline/name 反推模式。
- [ ] quick event 不进入普通赛事大厅；owner / actual participant 仍能从“我的赛事”进入。
- [ ] 首次对阵自动生成；用户不需要再寻找“生成对阵”才能进入下一步。
- [ ] 若 create_quick_event 已成功但首次 draw 因网络/Edge 失败，页面保存该 event id/version 并进入恢复状态；刷新后仍可继续；“继续生成对阵”只重试已有 event 的 draw，不得再次创建赛事。
- [ ] pending draw 状态下允许进入已创建赛事管理，但不能无提示创建第二个 quick event；恢复成功后清除 pending 状态。
- [ ] quick event 后续继续复用 viewer_role、Match、记分、排名、完赛、战绩与照片模型。
- [ ] quick mode 不得改变标准赛事 deadline / waitlist / invite / Player / Storage 权限。
