# 球搭子｜小程序与统一身份融合入口

更新：2026-10-27。审阅基线 `3cdb135097014b81cbc043c0ce0ce4d5fcd8f578`；之后的实时 HEAD 必须重读。

技术路线与验收门槛唯一正文为 [实施 PRD](miniprogram-implementation-prd.md)。机器状态索引为 [V8_CURRENT_STATE](../../V8_CURRENT_STATE.json)，范围真源仍是 [五项已确认范围](../../V8_CONFIRMED_SCOPE.md)。历史研究正文保留原日期、基准和证据，不再把旧的“未有小程序源码/PoC 尚未批准”当作当前状态。

## 本轮融合与证据

全量检查两个目录及 consumed，共208个文件：156个既有归档、52个根目录文件。另读此前批量融合和23:48真实诊断报告；源码备份只作历史，不当新 Handoff。完整逐文件 ID、日期、SHA-256、目标路径、重复/替代关系、消费层级及阻断见 [20261027 台账](../../V8_HANDOFF_RECONCILIATION_20261027.json)。

已合并至第17批的离线 PoC 和已记录 G1 是代码/工程事实。第18–28批共11个代码 Handoff 的研究防护结论进入 PRD，但补丁未应用，必须保留根目录且不能标成代码已消费。本轮不改业务代码、数据库、环境或地图供应商。

地图40个历史证据/重复/替代文件的有效结论归入 [P3 状态](../../V8_P3_STATUS_20261025.md)，仅在本轮提交与回读成功后归档；保留最新完整外层包作为一项待处理代码队列。归档旧证据不意味着 P3 通过。

## 主题来源

| 主题             | 原研究与后续 Handoff                        | 当前落点                                                                     |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| 架构与共享领域   | framework reuse、身份成本首轮、G1 第11–17批 | 实施 PRD A；PoC README                                                       |
| Session/绑定/RLS | 20261021-0904、1212、1511；第18–24批        | 实施 PRD B；identity-architecture、legacy-user-migration、session-bridge-poc |
| 地图与候选       | 历史 P3 全链、V4、locale、23:48八接口诊断   | 实施 PRD C；P3 状态                                                          |
| 分享、记分和媒体 | 20261021-1808、20261022-0010；第25–28批     | 实施 PRD D；cross-platform-product-scope、network-media-adaptation           |
| 发布和成本       | 20261021-2112、20261022-0307、主体/备案线索 | 实施 PRD E；wechat-login-options、mini-program-feasibility                   |

## 未闭环门槛

SESSION_BRIDGE_UNPROVEN、ALIAS_RLS_COMPATIBILITY_GATE、TEST_NICKNAME_RETIREMENT_GATE、ADMIN_AUTH_SEPARATE_GATE、MINI_FETCH_STORAGE_RUNTIME_UNPROVEN、MEDIA_UPLOAD_WIRE_COMPAT_UNPROVEN，以及真实主体/AppID/类目、域名/备案/隐私、实际账单和中国真机验证均未关闭。不得将 mock 或已有 CI 推断成这些门槛通过。

下一轮可对11批离线补丁做一次完整源码融合；地图先处理百度应用识别失败，获真实 status=0 和双门控后再执行30+9。腾讯/高德只保留候选，不自动接入。

首批提交后新增12份见[执行增量台账](../../V8_HANDOFF_DELTA_20261027.json)。小程序待应用已增至15份（18–32批）；地图出现V5/V5.1，优先候选已更新，二进制完整性仍待独立重验，不沿用旧的“仅12份剩余”数量。
