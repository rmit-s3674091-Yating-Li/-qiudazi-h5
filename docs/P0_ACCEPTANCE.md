# 球搭子 H5 MVP｜P0 验收基线（Current）

> 当前长期验收基线。照片专项以 `docs/PHOTO_ALBUM_BASELINE.md` 为准。

## A. 身份与档案
- [ ] 首次访问可建立测试登录态并完成昵称资料；返回用户可恢复状态。
- [ ] 测试期昵称身份不展示 public ID，不误称正式安全登录。
- [ ] Profile / Player / Connection 不混淆，昵称不做关联键。
- [ ] 旧 auth session → canonical Profile alias 恢复时服务端仍正确识别赛事角色。

## B. 导航与页面职责
- [ ] 底部入口保持赛事大厅 / 我的赛事 / 球搭子们 / 我的。
- [ ] 大厅负责发现，不承担创建赛事主入口。
- [ ] 我的赛事分“我创建的 / 我参与的”。
- [ ] 我的包含打球档案、战绩、参与赛事相册、邀请记录、设置与隐私。
- [ ] “我参与的”按有效 Entry/Player 事实判断，双打两位真实搭档均正确出现。

## C. 赛事创建与发现
- [ ] 创建/编辑支持单/双打、赛制、计分、名额、比赛日期、开赛时间、城市、场地、费用、公开/私有。
- [ ] Event.city 独立必填，不从 venue 猜测。
- [ ] 参赛建议级别支持不限、单边、同档、区间；只用于匹配，不作为硬资格。
- [ ] 私有大厅仅展示脱敏预览，不泄露组织者、参赛人、精确时间、场地、费用、人数、截止时间。
- [ ] 大厅可发现 ≠ 完整详情权限 ≠ 报名资格；已知 URL/ID 不能绕过。

## D. 报名截止与生命周期
- [ ] 最晚报名时间默认开赛前 2 小时，只能更早。
- [ ] 修改开赛时间导致截止非法时自动收紧并提示。
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

## F. 权威身份与比赛
- [ ] EventPage / MatchPage 以服务端 `viewer_role` 等权威事实决定 owner/participant/invited/viewer。
- [ ] canonical Profile alias 场景中组织者仍可管理、编排、开赛、记分和更正比分。
- [ ] 单循环、淘汰、分组+淘汰编排正确；Bye、排名、晋级、赛果更正正确。
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
- [ ] 本人可以查看个人水印预览和自己的短时高清副本。
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

## M. 分享、性能、错误与移动端
- [ ] HashRouter 分享深链正确；私有赛事分享不提升权限。
- [ ] 稳定页面不固定 10/15 秒轮询；mutation 后精准刷新。
- [ ] 用户错误不暴露 Supabase/JWT/SQL/RPC/RLS 原始文本。
- [ ] 375 / 390 / 430px 检查中文/英文赛事相册、多图上传、加入按钮、删除确认、个人相册、隐私设置、搭子相册，无溢出/遮挡/不可点击。

## N. Release Gate
- [ ] H5 Build Check 全绿，包括 build 与 Supabase clean replay。
- [ ] PRD / PRODUCT / INTERACTION / PHOTO_ALBUM / P0 / CHANGELOG 同步。
- [ ] 发布相关 P0/P1 已独立验证。
- [ ] 完整候选后才受控触发一次 Vercel Preview；真实黑盒、Visual/UX、English QA 通过后才进入 CloudBase。
- [ ] 未通过 Gate 不自动 merge main。
