# 球搭子｜自动化测试数据治理基线

> 状态：Canonical governance baseline。适用于 Candidate Browser、Exploratory Browser、AUD 专项浏览器测试、未来新增 E2E/Smoke/Regression 自动化。不得再由各脚本自行发明测试昵称或赛事命名。

## 1. 核心原则

自动化测试数据必须满足三个目标：
1. **一眼可识别**：人看到即可知道是自动化测试数据；
2. **机器可识别**：Hall/cleanup/audit 不依赖自然语言赛事名猜测来源；
3. **可追溯**：昵称/赛事名能够关联 suite、角色、代码 SHA 或 run 标识。

仅靠赛事名称是否含 QA/EXP 不可靠。测试身份是主识别锚点；长期应增加结构化 test marker，昵称规则作为人类可读与兼容边界。

## 2. 新增测试身份唯一命名规则

自本基线生效后，所有新自动化测试 Profile 昵称统一以 `TST-` 开头：

`TST-<SUITE>-<ROLE>-<SHA6>-<RUN>`

其中：
- `SUITE`：固定枚举，当前允许 `CAND`（Candidate）、`EXP`（Exploratory）、`AUD`（专项审计）、`SMOKE`（生产/部署后轻量测试，若未来启用）；
- `ROLE`：如 `OWNER`、`P2`、`QUICK`、`PARTNER`；
- `SHA6`：当前 exact head 前 6 位；
- `RUN`：短随机数或 workflow run 尾号，用于避免昵称冲突。

示例：
- `TST-CAND-OWNER-abc123-4821`
- `TST-EXP-QUICK-abc123-9137`
- `TST-AUD-PARTNER-abc123-2274`

禁止新增其它根前缀，例如 `QA2-`、`E2E-`、`AUTO-`、`REG-`。需要新增 suite 时先修改本文的允许枚举，再改脚本。

## 3. 测试赛事命名规则

标准赛事建议：

`TST <SUITE> <SCENARIO> <SHA6> <RUN>`

Quick Event 若产品自动生成自然语言名称，可以保留产品真实命名，例如“08月31日 快速单打”；**机器识别不得依赖赛事名**，而应依赖测试组织者/未来 test marker。

不得为了方便过滤而强迫真实产品逻辑把所有 Quick Event 名称改成 TST 前缀。

## 4. Legacy 兼容

历史自动化已经使用以下根前缀：
- `QA-*`
- `QA15-*`
- `EXP-*`

这些仅作为 legacy test identities 保留兼容过滤，不允许新测试继续创建。迁移完成后，新脚本只使用 `TST-*`。

## 5. Hall 隔离

公共赛事大厅不得显示任何受控自动化测试身份创建的赛事。当前过滤集合：

`TST-*` + legacy `QA-* / QA15-* / EXP-*`

该规则只影响公共 Hall 发现：
- 不删除 Event/Entry/Match 测试证据；
- 不影响测试组织者从“我的赛事”访问；
- 不影响 direct URL / browser trace / artifact 复核；
- 不影响 private/公开产品赛事的一般发现规则。

**尤其禁止把“隐藏测试赛事”误实现为“只返回 visibility=public”。** 标准 private event 仍应进入 Hall 的脱敏发现流。

## 6. Private 赛事与测试隔离是两条独立规则

产品规则：
- `event_mode=standard + visibility=private`：进入赛事大厅，但只返回脱敏卡；
- 未授权 viewer 不得看到 owner、精确日期时间、场地、费用、参赛人数、报名截止等敏感信息；
- private Hall 可发现 ≠ 完整详情可见 ≠ 可报名。

测试治理规则：
- 若组织者是受控 test identity，则无论 public/private、standard/quick，公共 Hall 都不展示。

两者不得混用。

## 7. Cleanup 与长期结构化标记

昵称约定不是最终数据模型。后续优先引入结构化字段，例如 `profiles.is_test_account`、`events.test_run_id` 或等价受控 marker，并让 Hall/cleanup 以结构化字段为主、昵称为兼容 fallback。

自动化应逐步增加 cleanup：测试结束后可安全清理自己 run 创建的 disposable 数据；需要保留作为 Release evidence 的数据可延迟清理，但仍不得进入公共 Hall。

## 8. 变更要求

新增或修改任何浏览器测试 suite 时必须同时检查：
- 本文 suite 枚举；
- 测试身份生成 helper；
- Hall test isolation；
- cleanup；
- Browser/Exploratory baseline；
- CHANGELOG（若改变治理规则）。

不得只在单个 Playwright 脚本里临时换昵称。
