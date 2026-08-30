# 球搭子真实浏览器黑盒测试基线

> 本文是「球搭子」候选版本真实浏览器黑盒（Browser Blackbox）的 canonical source。它定义什么证据才可以称为“真实黑盒已执行/已通过”。HTTP fetch、源码检查、CI build、数据库查询、Vercel deployment metadata 均不能替代本文要求的真实浏览器交互证据。

## 1. 执行器职责

长期固定采用两层职责：

1. **GitHub Actions + Playwright = 真实浏览器执行器**
   - workflow：`.github/workflows/candidate-browser-blackbox.yml`；
   - shell / mobile / English / dual-session 脚本：`qa/candidate-browser-blackbox.mjs`；
   - 全生命周期脚本：`qa/candidate-full-lifecycle.mjs`；
   - 在 GitHub-hosted runner 中实际启动 Chromium / WebKit，访问 Vercel `release-candidate` Preview；
   - 真实执行页面导航、点击、输入、文件上传、双浏览器会话、viewport 渲染与故障注入；
   - 产出 JSON、截图和 Playwright trace artifact。

2. **ChatGPT「球搭子全功能测试」= 黑盒总控 / 证据复核者**
   - 不再把自身运行环境假定为浏览器执行器；
   - 必须读取当前 PR exact head、Vercel candidate、`Candidate Browser Blackbox` workflow run 与 artifact；
   - 只有 workflow 对同一 exact head `completed/success` 且 artifact 内容有效，才允许依据真实浏览器结果推进独立验证；
   - 若自身没有浏览器能力，不得再尝试用 HTTP、源码、CI、Vercel connector 输出伪装成真实页面黑盒。

## 2. Exact-head 硬约束

每轮 Browser Blackbox 必须同时锁定：

- PR #20 当前 exact head SHA；
- `release-candidate` branch SHA；
- Vercel deployment `githubCommitRef=release-candidate`；
- Vercel deployment `githubCommitSha=PR exact head`；
- Preview 内 `/build-meta.json.sha=expected SHA`；
- Preview 内 `/build-meta.json.ref=release-candidate`；
- GitHub Actions workflow `github.sha=同一 SHA`；
- artifact 名称 `candidate-browser-evidence-<same SHA>`。

任一 SHA 不一致，本轮证据无效。旧 Preview、旧 workflow run、旧 screenshot 或“内容看起来一样”均不能继承。

## 3. Vercel Protection 与访问能力

候选 Preview 可以保持 Vercel Protection。Browser Blackbox workflow 使用 GitHub Actions OIDC `id-token: write` 获取短时 token，并通过 `x-vercel-trusted-oidc-idp-token` 访问受保护候选。

规则：

- 不把长期 Vercel bypass secret 写入仓库；
- OIDC token 只在单次 workflow 内短时使用并由 GitHub mask；
- 如果 OIDC / Preview protection / DNS / runner 网络导致浏览器无法访问，属于 **Browser Infrastructure Failure**，不是产品 AUD；
- 只有浏览器实际进入产品页面后发现业务/视觉/权限问题，才按产品缺陷语义去重并登记 AUD。

## 4. 最低真实浏览器覆盖

一份可供 Release Gate 使用的 Browser Blackbox 至少包含以下真实交互：

### 4.1 Mobile / Visual / English

- Chromium：375×812、390×844、430×932；
- WebKit iPhone 类 viewport：390×844；
- English WebKit；
- 四个一级导航存在并可渲染；
- Quick Start 中央 action 可见且不越出 viewport；
- 无横向页面溢出；
- 保存关键 viewport screenshot。

### 4.2 双用户

- 至少两个隔离 BrowserContext；
- 两套真实测试身份/会话不同；
- 两个用户访问同一 Supabase 共享赛事数据；
- organizer-only / participant 权限通过真实页面 CTA 验证，而非只看源码/RPC 定义。

### 4.3 标准赛事 P0 主生命周期

通过真实页面完成：

`创建赛事 → organizer 报名 → 第二用户报名 → 锁定名单 → 自动首次 draw → 开始赛事 → 打开真实 Match → 输入并保存真实比分 → 查看排名 → 结束赛事`

要求：

- 锁定只确认一次；正常成功路径随后直接出现真实对阵 / Start event，不要求额外首次“生成对阵”；
- draw 中必须存在真实 Match，不接受 skeleton / mock；
- 记分必须通过页面 input/button 写入共享后端；
- participant 访问 manage URL 时不能获得 organizer 管理 CTA。

### 4.4 AUD-005 报名截止

通过真实 EventForm 输入验证：

- auto deadline 初始为 T-2h；
- 开赛时间变化时 auto deadline 随之变化；
- 用户手动设定更早截止后，再调整开赛时间，合法 manual 值保持。

### 4.5 AUD-006 Quick Start 故障恢复

通过 Playwright 网络故障注入真实验证：

- `create_quick_event` 已成功后，主动中断第一次 `tournament-command` draw；
- 页面出现已创建赛事恢复状态；
- `sessionStorage qiudazi-pending-quick-draw` 保存原 event id/version；
- 解除故障后点击 Retry draw；
- 必须复用同一 event id，仅重试 draw，并清除 pending key；
- 不创建第二场 quick event。

### 4.6 Settings / Privacy

通过真实页面：

- 改变一个允许的 preference；
- Save settings 成功；
- reload 后值仍持久化；
- 测试结束恢复原值，避免 QA 身份跨轮污染；
- 页面不暴露 SQL/RPC/Postgres 原始错误。

### 4.7 赛事照片 / 独立个人副本

在上述已完成标准赛事上真实执行：

1. organizer 在 Photo tab 使用真实 `<input type=file>` 上传赛事源照片；
2. actual participant 加入自己的参与赛事相册；
3. organizer 删除源照片；
4. participant 打开 `我的 → 参与赛事相册`；
5. 已导入个人副本仍存在。

同时检查删除/读取流程不出现 `ambiguous column`、SQLSTATE、RLS、RPC、Postgres 等原始后端错误文案。

## 5. Artifact / Trace 要求

workflow 无论成功/失败均上传：

- `qa-artifacts/result.json`：mobile / English / dual-session 结果；
- `qa-artifacts/full-lifecycle-result.json`：主生命周期 / deadline / privacy / Quick Start / photo 结果；
- 关键页面 PNG screenshot；
- 复杂流程 Playwright trace `.zip`；
- artifact 名：`candidate-browser-evidence-${github.sha}`；
- 默认保留 14 天。

Release Gate 不能仅凭 workflow 绿色图标。至少应核对：run SHA、artifact 名、两个 JSON 的 `expectedSha`、`ok=true` 和关键检查项。

## 6. 失败分类

### `WAITING_FOR_BROWSER_EVIDENCE`

- exact-head candidate 已存在，但该 SHA 的 `Candidate Browser Blackbox` 尚未完成；
- 不创建产品 AUD；
- Release Gate 等待。

### `BROWSER_INFRA_FAILURE`

例如：

- GitHub runner 无法安装/启动 Playwright；
- Vercel OIDC trusted access 失败；
- runner DNS/网络无法访问 Preview；
- artifact 上传机制自身失败；
- 测试代码语法/selector 基础设施错误，且没有证据证明是产品行为问题。

此类问题必须修复测试基础设施并重新跑 exact-head browser workflow，不得登记成产品 AUD，也不得用伪黑盒绕过。

### `PRODUCT_BLACKBOX_FAILURE`

真实浏览器已进入产品并实际操作后，复现：

- 业务流程错误；
- 权限越权/缺失；
- 数据未持久化/双用户不一致；
- 真实 mobile/English 视觉问题；
- 页面暴露后端原始错误；
- 文件上传/照片权限/副本解耦失败。

此时按 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 语义去重后更新已有 AUD 或创建新 AUD。

## 7. Release Gate 硬规则

从本文生效起：

- `Candidate Browser Blackbox` exact-head workflow 未成功 → Gate 不得 PASS；
- artifact 不存在或 SHA 对不上 → Gate 不得 PASS；
- 只完成 shell/viewport 而 `full-lifecycle-result.json` 不成功 → Gate 不得 PASS；
- HTTP fetch、源码、CI、Supabase SQL、Vercel metadata 只能作为补充证据，不能替代 Browser Blackbox；
- 黑盒真实浏览器发现新的 P0/P1 → candidate 作废，进入整改 / 新 exact head / 新 Preview / 新 Browser Blackbox；
- P2 `AUD-20260829-016` 继续按当前控制决定延期，不因本基线自动升为当前 Gate blocker。

## 8. 维护要求

当产品主流程、关键 CTA、路由或权限模型改变时：

1. 同步更新本文件；
2. 同步更新 Playwright 测试；
3. 同步 `docs/RELEASE_GOVERNANCE.md`、`docs/P0_ACCEPTANCE.md`、`docs/AUDIT_AUTOMATION_GOVERNANCE.md`、`docs/ENVIRONMENT_BASELINE.md`、README、CHANGELOG；
4. 检查「球搭子全功能测试」和 Release Gate automation prompt；
5. 重新在新的 exact-head candidate 上跑通真实浏览器 workflow。

禁止出现“文档要求真实黑盒，但自动化实际只能 HTTP fetch”的能力漂移。
