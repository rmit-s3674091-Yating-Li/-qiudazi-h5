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

详细规则以 `NEXT_VERSION_PRODUCT_BASELINE_20260902.md` 为准，当前包括：
- Match → Set → Game → Point；Point Log 单一真源；Advantage/No-Ad/Tiebreak；规则参数化；局/盘进度明确。
- 记分 UI optimistic near-instant，后台可靠持久化且保持幂等/版本/失败恢复。
- Quick city/venue optional，禁止默认北京；最低前置为参赛者 + 赛制/计分规则。
- 两人单打唯一对阵不显示重新生成；仅多合法方案时允许重新生成。
- Quick 开赛前创建人取消、参赛者退出；开赛后进入退赛/弃权结果语义。
- 实际参赛者从赛事相册主动导入个人参赛相册；personal copy 与 source 解耦；另提供保存到手机。
- Hall 增加 city filter；移动端原生日期/选择控件不得溢出。
- 单循环按轮次组织；Match 状态及 Result/Draw/Ranking 跨页面一致。

## 6. 自动化读取规则

开发整改任务每轮必须先读本文件和 `NEXT_VERSION_PRODUCT_BASELINE_20260902.md`，再按主题读取专项 baseline 与 current exact-head runtime truth。测试/审计任务恢复后也必须先读取当前阶段 baseline，禁止旧 selector、旧文案、旧 PRD 或聊天记忆成为事实源。

谁实现谁不独立 VERIFIED。新高风险纯逻辑下沉 Unit；RPC/RLS/Storage/事务/identity/幂等下沉 Integration；真实移动端、弱网、快速连续记分、相册导入/保存、Quick 生命周期由后续 User Story Browser 验证。
