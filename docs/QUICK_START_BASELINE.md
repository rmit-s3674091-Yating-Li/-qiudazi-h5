# 球搭子｜Quick Start 快速开赛专项基线

> 状态：Canonical product baseline。若 README、PRD V6、PRODUCT_BASELINE、INTERACTION_BASELINE、P0_ACCEPTANCE 或历史 CHANGELOG 中的 Quick Start 规则与本文冲突，以本文为准；自动化测试数据命名与隔离以 `docs/TEST_DATA_GOVERNANCE.md` 为准。

## 1. 产品定位

“快速开赛”用于球友已经约好、无需再走报名/候补/招募，但仍希望使用球搭子的编排、记分、排名、完赛、战绩和照片能力。

它是底部四个一级导航中央的高频主动作，不是第五个 Tab；赛事创建后仍使用同一套 Event / Entry / EntryPlayer / Match / viewer_role / scoring / photo 模型。

## 2. 参赛者来源

Quick Start 可选择：
- 当前用户自己的 self Player；
- 与当前用户存在 accepted Connection 的真实球搭子的 self Player；
- 当前用户创建且尚未关联真实用户的临时 Player；
- 现场新增临时 Player。

不得允许任意陌生用户的 Player 通过前端参数或直接 RPC 被加入 Quick Event。

## 3. 单打与双打

### 单打
- 至少 2 人。
- 每个 Player 独立形成一个 Entry。

### 双打
- 至少 4 人且必须为偶数。
- 选择参赛者后必须进入明确的“确认双打队友”步骤。
- 用户必须能够清楚看到每队两名成员，并可在开赛前调整队伍组合。
- 禁止仅依赖“勾选顺序每两人自动组队”作为最终不可见规则。
- 确认后的每一队形成一个 doubles Entry，两个 Player 分别进入该 Entry 的两个 slot。

## 4. 正常流程

正常流程固定为：

**选择单/双打 → 选择参赛者 →（双打）确认队友 → 设置城市/场地/赛制/计分 → 一键开赛 → 服务端创建赛事并锁定名单 → 系统自动生成首次对阵 → 进入赛事管理**。

正常成功路径不得要求用户再点击一次“生成对阵”。“draw”是内部编排动作，不作为正常流程的第二个主任务暴露给用户。

最后主按钮统一表达为“一键开赛”或等价产品文案，不使用“确认并生成对阵”作为常规用户任务文案。

## 5. 恢复语义

如果 Event / Entry / EntryPlayer 已经创建成功，但首次自动 draw 因网络、Edge Function 或事务临时失败：
- 已创建 Event 必须保留；
- 不得再次调用 create_quick_event 生成重复赛事；
- 客户端保存 pending event id/version；
- 页面进入“开赛未完成 / 恢复开赛”状态；
- 恢复操作只重试同一 event 的 draw；
- 恢复成功后进入赛事管理；
- 刷新页面后仍应能识别并恢复当前 pending event。

错误信息必须对用户说明“赛事已创建，开赛未完成”，不能暴露 JWT / SQL / RPC / RLS / Postgres raw stack。

## 6. 赛事状态

Quick Event 不走报名、候补、报名截止、赛事邀请、双打组队邀请等标准招募流程。

创建时名单已经确定，因此 Event 创建后直接进入 `locked` 是正确底层状态：
- `locked` 表示名单已固定、禁止普通报名变更；
- `locked` 不等于已经生成对阵；
- `draw_generated=false` 时应由自动编排/恢复机制完成首次 draw；
- 正式比赛开始后再进入 `ongoing`；完赛后进入 `finished`。

Hall 用户侧可将 quick + locked 映射成更易理解的“待开赛”等产品文案；不得为了文案改变底层状态机。

## 7. 大厅发现

当前产品决策：**正常用户创建的 Quick Event 是赛事大厅发现的一部分。**

- 新建 Quick Event 默认 `visibility='public'`；
- `event_mode='quick'` 必须进入 Hall 查询；
- Hall 卡可显示“快速赛事/待开赛”等状态，但不提供报名入口；
- Quick Event 不因进入 Hall 就重新启用报名、候补或标准赛事 deadline；
- 实际详情权限继续服从服务端 viewer_role 与赛事权限模型。

同时必须保持全局赛事发现规则：**`event_mode=standard + visibility=private` 的标准私有赛事仍进入赛事大厅，但只能展示脱敏预览。** 未授权 viewer 不得得到 owner、精确日期时间、场地、费用、报名人数/候补人数、报名截止等敏感字段。private Hall 可发现、完整详情可见、报名资格是三件不同的事。

因此，“测试赛事隔离”绝不能实现成 `Hall 只返回 visibility=public`；这种写法会误伤 private standard event，是发布回归。

## 8. 自动化测试数据隔离

自动化测试使用共享 canonical Supabase 时，不得污染真实 Hall。详细唯一规则以 `docs/TEST_DATA_GOVERNANCE.md` 为准。

新自动化身份统一使用 `TST-<SUITE>-<ROLE>-<SHA6>-<RUN>`；历史 `QA-* / QA15-* / EXP-*` 只作为 legacy 兼容过滤，禁止新脚本继续发明新的根前缀。

Hall 隔离依据受控测试组织者身份/未来结构化 test marker，不依赖赛事名称。Quick Event 即使自动生成“08月31日 快速单打”之类自然语言名称，只要组织者属于受控测试身份，就不得进入普通 Hall。

隔离只影响普通发现，不删除 Event/Entry/Match 证据，也不影响测试组织者在“我的赛事”、direct URL、Browser trace/artifact 中访问。

## 9. 身份与权限

当前测试身份支持 auth alias。Quick Start 全链路必须统一 canonical profile 解析：
- `list_quick_start_players`；
- `create_quick_event`；
- `tournament-command` Edge Function；
- `commit_tournament`；
- 相关 viewer / snapshot RPC。

不得在链路中再次直接假设 `profiles.auth_user_id = auth.uid()` 是唯一身份映射。

服务端 alias 解析不得扩大 `private.profile_auth_aliases` 对客户端角色的访问权；私有 alias 表继续保持受控边界。

## 10. UI / Visual

- Quick player row 中真实头像和 fallback avatar 均必须保持圆形固定尺寸，不能被文本 flex selector 拉伸。
- 真实 connected partner、临时 Player、本人应有清晰来源标签。
- 双打组队确认必须一眼看出 Team 1 / Team 2 ... 的成员组合。
- 375 / 390 / 430px 均不得出现头像拉伸、按钮遮挡、队伍卡溢出。

## 11. 验收

至少覆盖：
1. self + 临时 Player 单打创建并自动 draw；
2. self + accepted real partners 快速开赛；
3. 双打 4 人明确确认两队后自动 draw；
4. alias 测试身份完成 create → draw；
5. draw 首次失败后只恢复同一 event；
6. 正常 Quick Event 出现在 Hall；
7. `TST-*` 与 legacy `QA-* / QA15-* / EXP-*` 自动化赛事不出现在普通 Hall；
8. private standard event 仍以脱敏卡出现在 Hall；
9. Quick Event Hall 卡无报名 CTA；
10. fallback avatar 为正常圆形；
11. 赛事创建后 Event/Entry/EntryPlayer/Match 与标准赛事后续管理兼容。
