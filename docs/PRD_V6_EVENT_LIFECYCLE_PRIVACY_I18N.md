# 球搭子 H5 MVP｜PRD V6 增量基线

> 日期：2026-08-31。承接 PRD V5，记录当前已经确认并进入实现/验收的增量规则。与旧文档冲突时，以本文件 + `docs/PRODUCT_BASELINE.md` + 对应专项 canonical baseline 为准。Quick Start 以 `docs/QUICK_START_BASELINE.md` 为专项真源；照片以 `docs/PHOTO_ALBUM_BASELINE.md` 为专项真源。

## 1. 参赛建议级别
赛事用户侧使用“参赛建议级别”区间，不把单一赛事级别作为硬报名资格。档位：2.0及以下 / 2.5 / 3.0 / 3.5 / 4.0 / 4.5及以上。创建/编辑支持不限、单档、区间、仅最低、仅最高，最低不得高于最高。

大厅筛选使用**单项级别**：只要赛事建议区间包含所选级别即可匹配。例如选择 2.5 时，2.0–3.0、2.5–4.0、≤2.5 均匹配，3.0–4.0 不匹配；不限赛事也匹配。筛选不改变报名资格。

## 2. 比赛时间与报名截止
标准赛事比赛日期与开赛时间为 P0 必填。最晚报名时间默认 T-2h；组织者可以设得更早，不能晚于 T-2h。系统自动截止与用户主动提前截止必须区分：自动值随开赛时间变化持续重算；用户主动提前值原则上保留，超过新上限时自动夹紧并提示。

截止时间是服务端名单写入边界，不是前端提示。到达截止后，报名、双打最终 Entry、临时 Player 代报名、邀请接受、普通退赛等改变名单的路径均必须拒绝，旧页面/深链/直接 RPC 不能绕过。

## 3. 标准赛事生命周期
标准赛事固定为：**创建 → 报名/组队/候补 → 锁定名单 → 系统自动生成首次对阵 → 查看/复核 → 开始赛事 → 记分 → 排名/晋级 → 完赛**。

组织者确认锁定后先完成权威 roster lock，再立即调用 draw engine。正常路径不要求用户额外点击一次“生成对阵”。若 lock 已成功但首次 draw 临时失败，赛事保持真实 locked，页面提供“继续生成对阵 / Retry draw”；恢复只重试当前 event draw，不重复 lock、不改变名单。

开赛前人员变化：解锁 → 清空签表 → 调整名单/候补 → 重新锁定 → 自动生成首次对阵。已有真实比赛开始或结束后不得无保护解锁/重建签表。

## 4. 赛事发现与隐私
公开标准赛事进入大厅并展示公开详情。私有标准赛事大厅只显示脱敏预览，不泄露组织者、参赛人、精确日期时间、场地、费用、报名/候补人数、截止时间。

大厅可发现 ≠ 完整详情权限 ≠ 报名资格。赛事详情与管理权限以服务端 `viewer_role` 等权威事实为准。

正常 Quick Event 当前也进入公共 Hall，但无报名/候补 CTA；详见 §6 与 `docs/QUICK_START_BASELINE.md`。

自动化 QA 组织者（当前 `QA-*` / `QA15-*`）创建的赛事不得进入公共 Hall，无论赛事名称是否带 QA、event_mode 是 standard 还是 quick。测试赛事仍保留在测试账号自己的上下文作为证据。

## 5. Profile / Player / Connection / 邀请
Profile/User、Player、Connection 分离，昵称不是关联键。实际参赛事实按有效 Entry → active EntryPlayer → Player 判断；双打第二位真实搭档同样属于实际 participant。

“球搭子们”区分 accepted Connection 的真实球搭子与尚未关联真实用户的临时 Player。球搭子关系邀请、赛事邀请、双打组队邀请、临时 Player claim invite 保持独立语义。

测试阶段支持 auth alias 恢复到 canonical Profile。身份敏感 RPC / Edge / tournament transaction 必须统一 canonical profile 解析，不能各自重新假设 `profiles.auth_user_id=auth.uid()` 是唯一身份映射；也不得为方便服务端处理而扩大 private alias 表对客户端角色的访问权。

临时 Player “邀请 TA 加入球搭子”的 create/get/accept claim invite 同样必须支持 alias 身份。

## 6. Quick Start 快速开赛
快速开赛解决“人已经约好，直接开打”的场景。底部仍保持四个一级导航；中央凸起“快速开赛”是全局 action，不是第五个 Tab。

### 6.1 参赛者来源
可选：本人 self Player；accepted Connection 的真实球搭子的 self Player；本人创建且未关联真实用户的临时 Player；现场新增临时 Player。不得通过参数加入任意陌生用户 Player。

### 6.2 单打 / 双打
单打至少 2 人，每个 Player 一个 Entry。

双打至少 4 人且为偶数。选择参赛者后必须进入**明确的双打队友确认步骤**，逐队展示两名成员并允许调整。废止“仅按勾选顺序每两人静默成队”作为最终产品规则。

### 6.3 一键开赛
流程固定为：**选择单/双打 → 选人 →（双打）确认队友 → 设置城市/场地/赛制/计分 → 一键开赛 → 创建 Event/Entry/EntryPlayer → 名单 locked → 自动首次 draw → 赛事管理**。

正常路径不再把“生成对阵”作为第二个人工任务。Quick Event 创建时 `event_mode='quick'`、名单直接 locked。`locked` 表示 roster 已固定，不等于 draw 已完成；draw 完成前可以是 locked + draw_generated=false。

### 6.4 异常恢复
若 Event/Entry 已创建但首次 draw 因网络、Edge 或事务临时失败：保留同一 Event；保存 pending event id/version；页面显示“开赛未完成 / 恢复开赛”；恢复只重试该 event draw；禁止再次调用 `create_quick_event` 产生重复赛事；刷新后仍可恢复。

### 6.5 大厅
正常 Quick Event 默认 `visibility='public'` 并进入公共 Hall，但不重新开启报名、候补、赛事邀请、双打组队邀请或 standard deadline。Hall 可显示“快速赛事 / 已锁定”等状态。

旧规则“quick 不进入大厅 / quick 必须 private”自 2026-08-31 起废止。

## 7. 设置与隐私
“我的 → 设置与隐私”承担头像、水平、城市、约球时间、单双打偏好的搭子可见性；允许赛事邀请；允许双打组队邀请；参与赛事相册可见范围；简体中文 / English。设置与隐私不承担赛事源照片上传/删除管理。

## 8. 赛事相册与参与赛事相册
赛事相册是 source album，一场可多图。只有 organizer 上传/删除；actual participant 可查看但不能管理；公开赛事也不会因此公开照片。

系统不自动导入赛事照片。participant 逐张“加入我的参与赛事相册”后形成独立 private original + protected preview 个人资产。源照片后续删除只影响赛事源与未来导入，不级联删除已导入个人副本；`source_event_photo_id` 使用 SET NULL / 等价解耦。

个人参与赛事相册默认仅自己可见，可切换搭子可见；accepted Connection 只获得服务端短时水印预览，无高清、修改、删除权。详细规则见 `docs/PHOTO_ALBUM_BASELINE.md`。

## 9. 我的打球档案与头像昵称编辑
“我的打球档案”维护水平、城市、单双打偏好、常打时间等资料。“编辑头像与昵称”只处理赛事展示昵称/头像。

从打球档案进入编辑页后，保存成功必须回到明确来源并 replace 当前 history entry；不得再 push 一个新的“我的打球档案”导致左上返回重新进入编辑页。直接 URL 进入编辑页时保留安全 fallback。

## 10. 移动端与错误体验
375 / 390 / 430px 与 iPhone safe-area 必须真实检查。赛事详情底部 CTA 不得因 flex 压缩变成竖排文字。Quick player row 的真实头像与 fallback avatar 均保持圆形固定尺寸；双打队伍确认卡不得溢出。

用户错误提示遵循“发生了什么 + 下一步”，不得显示 JWT、SQL、RPC、RLS、Postgres raw stack。

## 11. 语言
H5 MVP 支持简体中文 / English。核心流程、状态、错误、空状态必须完成英文覆盖；业务逻辑不得通过比较展示文案判断状态。Quick Start 的选人、双打确认、设置、一键开赛、恢复开赛同样必须完整双语。

## 12. 数据、Migration 与发布
新增业务字段必须贯穿 DB schema → migration → RPC/Edge → TypeScript → UI → cache → acceptance。

repo migration 的 14 位 version 必须与 live `supabase_migrations.schema_migrations.version` 完全一致；仅 SQL 语义相同但 version 不同仍属于 Release Gate blocker。

正式候选必须使用当前 PR exact head：H5 Build + migration preflight + Supabase clean replay → release-candidate exact Preview → `/build-meta.json` same SHA/ref → Candidate Browser + Exploratory Browser → live P0/P1 review → Release Gate。Candidate Freeze 后任何代码、migration、测试基础设施或 canonical docs commit 都使旧候选证据失效。

不得自动 merge main；最终 merge 必须由用户明确授权。
