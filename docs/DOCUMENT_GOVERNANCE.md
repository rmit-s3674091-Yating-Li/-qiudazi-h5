# 球搭子文档治理基线

本文件是「球搭子」长期文档治理的 canonical source。目标是避免 PRD、专项基线、CHANGELOG、审计 snapshot、自动化 prompt、运行时状态和历史记录互相覆盖或产生“多份真源”。

## 1. 文档/证据四层模型

### A. Canonical policy / product baseline
用于定义“现在应该怎样工作”。包括：
- `docs/NEXT_VERSION_PRODUCT_BASELINE_20260902.md` — 2026-09-02 起下一版本已批准变更总基线；其明确修改的 Quick/Scoring/Photo/Hall/Lifecycle/Presentation 规则优先于旧版本描述
- `docs/PRD_V6_EVENT_LIFECYCLE_PRIVACY_I18N.md`
- `docs/PRODUCT_BASELINE.md`
- `docs/INTERACTION_BASELINE.md`
- `docs/USER_STORY_ACCEPTANCE_BASELINE.md`
- `docs/QUICK_START_BASELINE.md`
- `docs/EVENT_LIFECYCLE_BASELINE.md`
- `docs/TOURNAMENT_PRESENTATION_BASELINE.md`
- `docs/TEST_DATA_GOVERNANCE.md`
- `docs/VISUAL_DESIGN_BASELINE.md`
- `docs/BRAND_ASSET_BASELINE.md`
- `docs/PHOTO_ALBUM_BASELINE.md`
- `docs/P0_ACCEPTANCE.md`
- `docs/ENVIRONMENT_BASELINE.md`
- `docs/RELEASE_GOVERNANCE.md`
- `docs/BROWSER_BLACKBOX_BASELINE.md`
- `docs/SECURITY_TEST_BASELINE.md` — 安全测试范围、方法、越权/RLS/RPC/Edge/Storage/身份/隐私边界真源
- `docs/AUDIT_AUTOMATION_GOVERNANCE.md`
- `docs/PUBLIC_READINESS.md` — repository visibility 变更的准备边界、full-history secret scan、公开范围确认、Owner 授权与 post-change revalidation 真源
- 本文件 `docs/DOCUMENT_GOVERNANCE.md`

专项规则仍放在专项基线。处于下一版本开发期间，若 `NEXT_VERSION_PRODUCT_BASELINE_20260902.md` 明确写出“变更/新增”规则，则该变更是专项文件下一次同步更新的输入；未被明确修改的既有规则继续有效。禁止因为旧专项文件尚未完成逐段迁移而回退已批准产品决策。

### B. Runtime truth
用于回答“现在实际上是什么状态”。GitHub 当前 main/开发 PR exact head、repository visibility、Supabase live schema/RPC/RLS/Storage、Vercel deployment、自动化状态等运行时事实优先于静态文档中的旧状态描述。Repository visibility 是 owner-controlled runtime fact，不是应用安全边界；visibility 变更前置条件与授权边界以 `docs/PUBLIC_READINESS.md` 为准。

### C. Evidence / changelog
Git commit/PR、CHANGELOG、CI/Browser evidence 用于证明某时点发生了什么，但不能覆盖当前 canonical policy。

### D. Historical snapshot
旧 PRD、旧交付包、旧 audit snapshot 只作为历史参考，不得反向覆盖当前产品规则。

## 1.1 Rule Owner Registry + Change Impact Manifest

为减少同一规则在多份文档、Workboard 与 automation prompt 中重复抄写造成的漂移，`docs/CURRENT_STATE.json` 是**机器可读索引/Change Impact Manifest**，不是第二份产品规范。

治理约束：
- 每个 topic 只能有一个 `owner canonical`。完整产品规则只写在 owner；supporting docs 只写本层必须补充的 AC / 交互 / 视觉 / 测试边界，并引用 owner，不复制完整定义。
- `CURRENT_STATE.json` 只记录 topic owner、受影响文档、supersede/invalidation 关系、automation impact 与 drift markers；不得承载一份可与 owner 竞争的完整 PRD。
- 可观察产品语义发生变化时，必须产生一个 `change_id`，并记录 topic、owner、implementation state、supersedes、verification impact、affected docs、affected automations、required/forbidden markers。
- 旧实现曾通过验证，但产品方案被替换时，用 `SUPERSEDED` / `invalidates_verification` 表达“旧证据对新方案不再适用”；不得把旧 verifier 结论改写成“当时验证错误”。
- 同一 change 只保留一个活跃 manifest 记录；完成后可移入历史 changelog，而不是复制出第二套 CURRENT_STATE 文件。

## 1.2 Product truth / Implementation truth / Verification truth / Runtime truth

四类事实严格拆分：
- **Product truth**：topic owner canonical → supporting canonical → README 摘要。
- **Implementation truth**：`docs/V7_WORKBOARD.md`，且只允许 `TODO / IN_PROGRESS / IMPLEMENTED / BLOCKED`。
- **Verification truth**：PR #24 唯一 ledger marker `<!-- v7-verification-ledger -->`；允许 `NEEDS_VERIFY / VERIFIED / REOPENED / SUPERSEDED` 等验证 verdict。
- **Runtime truth**：PR exact head / CI / Supabase / Vercel / live service state。

禁止：
- Workboard 使用 `VERIFIED / NEEDS_VERIFY / BROWSER_PENDING` 作为实施状态；
- ledger 反过来充当产品规范；
- runtime 新旧 SHA 变化自动抹掉 unaffected scope 的既有验证；
- automation 使用聊天记忆或硬编码旧产品事实覆盖 owner canonical。

## 2. 冲突解释顺序

1. 先判断是规范冲突还是运行时事实冲突。
2. 规范：当前阶段已批准的 next-version baseline → 对应专项 canonical → 通用 baseline → README 摘要 → changelog/evidence → historical snapshot。
3. 运行时：受控 live source / current exact-head evidence → 静态文档状态摘要。
4. 两个当前 canonical 对同一未裁决规则冲突时停止受影响写操作；但 `NEXT_VERSION_PRODUCT_BASELINE_20260902.md` 中已经明确批准的变更不属于“未裁决冲突”，应同步到专项文档和实现。

## 3. 下一版本文档联动矩阵

本轮开发至少同步以下主题：
- Scoring：PRODUCT / INTERACTION / USER_STORY / UNIT / INTEGRATION / TOURNAMENT_PRESENTATION。
- Quick Start：QUICK_START / PRODUCT / INTERACTION / EVENT_LIFECYCLE / USER_STORY。
- Photo：PHOTO_ALBUM / PRODUCT / INTERACTION / USER_STORY；涉及 Storage/RLS 时同步 Integration。
- Hall/mobile filter：PRODUCT / INTERACTION / VISUAL / USER_STORY。
- 生命周期：EVENT_LIFECYCLE / PRODUCT / INTERACTION / USER_STORY。
- 对阵/轮次：TOURNAMENT_PRESENTATION / PRODUCT / INTERACTION / USER_STORY。
- 安全边界/RLS/RPC/Edge/Storage/alias/隐私变化：SECURITY_TEST_BASELINE / Integration / 必要 Browser security smoke。
- 所有行为变更写 CHANGELOG。

纯实现优化若不改变已批准行为，不机械改 PRD；一旦可观察行为/AC 改变，必须同步对应专项与 User Story。

## 4. 当前阶段

2026-09-02 起进入下一版本开发迭代阶段。上一版本已经合并 main；开发工作从 main 建立独立 feature 分支/PR。开发阶段不把 Release Gate 当作开发前置，也不围绕上一版本历史 FVP 反复移动 head。

阶段建议：产品规则 → 实现 + Unit/Integration → 稳定后 whitebox → remediation → 功能收口后 blackbox → candidate → Gate → 人工决定是否 merge/release。

任何自动化均不得自行 merge main 或触发 Production。Repository visibility 同样不得由自动化自行改变；Public-prep 可以继续推进，但只有 `docs/PUBLIC_READINESS.md` 的前置条件完成且 Owner 明确授权后才允许切换。Public 授权不等于 `release-candidate`、Release Gate、merge main 或 Production 授权。

## 5. 当前关键产品决策索引

本节仅作人类可读摘要，不是规则 Owner；若与 `docs/CURRENT_STATE.json` 指向的 topic owner 冲突，以 topic owner 为准。当前包括：
- Match → Set → Game → Point；Point Log 单一真源；Advantage/No-Ad/Tiebreak；规则参数化；局/盘进度明确。
- 记分 UI optimistic near-instant，后台可靠持久化且保持幂等/版本/失败恢复。
- Quick city/venue optional，禁止默认北京；最低前置为参赛者 + 赛制/计分规则。
- 两人单打唯一对阵不显示重新生成；仅多合法方案时允许重新生成。
- Quick 开赛前创建人取消、参赛者退出；开赛后进入退赛/弃权结果语义。
- 实际参赛者从赛事相册主动导入个人参赛相册；personal copy 与 source 解耦；另提供“分享 / 保存”。
- Hall 支持 match type + city + level + date 联合筛选，且筛选只作用于赛事大厅，不得影响“我的赛事”；移动端原生日期/选择控件不得溢出。
- Standard Venue 采用手填场地名称/地址 + 可选“使用当前位置 / 地图选点”，中心准星确认静态坐标；当前不以 POI 关键词搜索作为 V7 主链路。
- 单循环按轮次组织；Match 状态及 Result/Draw/Ranking 跨页面一致。

## 6. Automation 读取链与禁止硬编码

所有 Builder / 黑盒 / Browser / 白盒 / 安全 automation 每轮按以下顺序读取：
1. `docs/DOCUMENT_GOVERNANCE.md`
2. `docs/CURRENT_STATE.json`
3. 本轮 topic 的 owner canonical
4. 必要 supporting canonical
5. `docs/V7_WORKBOARD.md`（只读实施/阻塞状态）
6. PR #24 verification ledger（只读独立验证 verdict）
7. current exact-head runtime / CI / Supabase / Vercel evidence

Automation prompt 只应硬编码**读取顺序、角色边界和禁止事项**，不得长期硬编码 Venue/Photo/Hall 等当前产品细节、旧 SHA 或旧 verdict。产品变化后应通过 manifest + owner 自动被消费。

谁实现谁不独立 VERIFIED。高风险纯逻辑下沉 Unit；RPC/RLS/Storage/事务/identity/幂等下沉 Integration；真实移动端、弱网、快速连续记分、相册导入/分享保存、Quick 生命周期由独立 Browser/真机验证。

## 7. Document Drift Detection 规则

机器检查至少覆盖：
- Workboard State 列出现非 `TODO / IN_PROGRESS / IMPLEMENTED / BLOCKED` 值；
- Workboard 将 verification verdict 当作当前状态；
- `CURRENT_STATE.json` 中 topic 缺 owner、同 topic 多 owner、active change 缺 change_id；
- change manifest 宣告 owner 已更新，但 affected docs 仍命中 forbidden markers；
- required markers 在指定 marker scope 中缺失；
- `invalidates_verification` 指向的旧 verdict 仍被 automation/browser baseline 当作新方案当前证据；
- automation prompt 出现旧产品实现关键词、固定 current SHA 或复制完整产品规则；
- 可观察行为变化缺 CHANGELOG；
- supporting docs 与 owner 存在实质冲突。

Drift check 只报告治理问题，不得自行修改产品规则、verification verdict、`release-candidate`、main 或 Production。
