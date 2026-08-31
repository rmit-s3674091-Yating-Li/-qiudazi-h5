# 球搭子发布与候选部署治理基线

> 本文是「球搭子」发布分支、Candidate Freeze、Vercel Preview、真实浏览器黑盒、Release Gate 与 main/CloudBase 发布顺序的 canonical source。真实浏览器执行能力的专项规则见 `docs/BROWSER_BLACKBOX_BASELINE.md`。本文定义工程发布治理，不改变产品业务规则。

## 1. 三层发布模型

长期固定采用三层模型：

1. **feature / docs / fix 开发层**
   - 日常开发、整改、文档和迁移均在 feature 分支完成。
   - GitHub CI 正常运行，但 Vercel Git deployment 默认关闭。
   - 目的：避免每个开发 commit 都消耗 Hobby Preview 配额，也避免把未冻结代码误当候选。

2. **release-candidate 候选层**
   - `release-candidate` 不是开发分支，只是受控 Preview 触发器。
   - Candidate Freeze 后，由总控把它精确移动到已经通过 exact-head CI 的 PR head。
   - 该移动同时触发 Vercel Git Integration 的候选 Preview，以及 GitHub Actions `Candidate Browser Blackbox` 的真实浏览器验证。
   - 黑盒 / Visual / English / 双用户权限验证与 Release Gate 只消费这个 exact-head candidate。

3. **main / 正式发布层**
   - `main` 不用于绕过候选验证，也不用于“先部署再测试”。
   - 只有 Release Gate 通过后，才由用户/总控决定是否 merge main。
   - main Git deployment 只承担 Gate 通过后的正式部署语义。
   - 中国区 CloudBase 在受控候选通过后再手动更新。

标准路径：

`feature/* → PR → exact-head H5 Build Check → Candidate Freeze → release-candidate → exact-head Vercel Preview + Candidate Browser Blackbox → ChatGPT 黑盒证据复核 → Release Gate → merge main 决策 → CloudBase/正式发布`

## 2. Vercel 分支白名单

`vercel.json` 必须保持 Git deployment 白名单：

```json
{
  "git": {
    "deploymentEnabled": {
      "**": false,
      "main": true,
      "release-candidate": true
    }
  }
}
```

- 必须使用 `**` 作为默认关闭规则，以覆盖 `feature/...` 等包含 `/` 的分支名；单星号 `*` 不能可靠覆盖斜杠分支。
- feature/docs/fix push 不应产生 Vercel deployment。
- `release-candidate` 与 `main` 是唯一允许 Git 自动部署的长期分支。
- 若未来改变该策略，必须同步更新本文、`docs/ENVIRONMENT_BASELINE.md`、README、P0、审计治理、Browser Blackbox 基线和 CHANGELOG，并重新验证实际 Vercel behavior。

## 3. Candidate Freeze 条件

总控只有在以下条件满足后才能移动 `release-candidate`：

- 当前 PR exact head 已实时读取，不使用缓存 SHA。
- 发布相关 P0/P1 不存在 `OPEN` / `IN_PROGRESS`；明确延期且非 Gate 阻塞的 P2 可保留。
- H5 Build Check 对该 exact head `completed/success`，包括前端 build、migration preflight 与 Supabase clean replay。
- repo/live migration version 与 SQL 语义一致；关键 RPC/RLS/Storage/Edge Function 无已知发布阻塞漂移。
- canonical 文档已经同步到准备冻结的同一 PR head。
- Browser Blackbox workflow / Playwright 脚本本身已通过静态/CI 基础校验，不能在明知测试执行器损坏时冻结候选并伪称可测。
- 自动整改任务暂停或处于不会继续推产品改动的状态，避免 freeze 后 head 持续移动。

Candidate Freeze 后，任何新的代码、migration、canonical 文档或测试基础设施提交都会产生新的 PR head，并自动使旧 candidate 失去 exact-head 资格。此时必须：暂停黑盒/Gate → 完成新 head CI → 再移动 `release-candidate` → 只测试新的 Preview。

## 4. release-candidate 的移动规则

- `release-candidate` 必须直接指向 PR exact head，不创建额外内容 commit，不 cherry-pick 独立修复，不承载人工开发。
- 移动前再次读取 PR exact head，防止在 CI 等待期间 head 已前移。
- 若新 head 只包含发布治理/文档/测试基础设施变化，也必须重新跑 exact-head CI；不能继承旧 SHA 的 green 结论。
- `release-candidate` 可以被后续候选覆盖；它表示“当前唯一候选”，不是历史归档分支。

## 5. Vercel Candidate 身份判定

Vercel Preview 只有同时满足以下条件才是正式 candidate：

- deployment `state = READY`；
- `meta.githubCommitRef = release-candidate`；
- `meta.githubCommitSha = 当前 PR exact head`；
- Preview `/build-meta.json.sha = 当前 PR exact head`；
- Preview `/build-meta.json.ref = release-candidate`；
- Git repository 与 canonical repo 一致；
- repository visibility / Git link 等基础环境没有漂移。

Preview URL、deployment id、SHA 都是运行时事实，不写成长期固定值。

以下均不能替代 exact-head candidate：

- 旧 Preview；
- feature branch 上相近 SHA 的 Preview；
- HTTP 200；
- 本地 build；
- 单独 CI green；
- Vercel branch alias 指向未知旧 deployment。

## 6. 真实浏览器黑盒与 Release Gate

### Browser Blackbox 执行器

从 2026-08-30 起，黑盒执行能力固定为：

- GitHub Actions workflow `.github/workflows/candidate-browser-blackbox.yml`；
- Playwright Chromium + WebKit；
- `qa/candidate-browser-blackbox.mjs` 负责 mobile / English / dual-session shell；
- `qa/candidate-full-lifecycle.mjs` 负责标准赛事主生命周期、报名截止、Settings/Privacy、Quick Start 故障恢复、赛事照片与独立个人副本；
- 使用 GitHub OIDC 短时 token 访问受保护 Vercel Preview；
- 产出 `candidate-browser-evidence-<exact SHA>` artifact、JSON、截图和 trace。

详细最低覆盖、artifact 与失败分类以 `docs/BROWSER_BLACKBOX_BASELINE.md` 为准。

### ChatGPT「球搭子全功能测试」

该任务现在是**黑盒总控 / 证据复核者**，不是浏览器执行器：

- 先执行 Candidate Preflight；
- 再读取同一 exact SHA 的 `Candidate Browser Blackbox` workflow run；
- workflow 未完成时仅 `WAITING_FOR_BROWSER_EVIDENCE`；
- workflow 因 runner/OIDC/DNS/Playwright 基础设施失败时标记 `BROWSER_INFRA_FAILURE`，不得创建产品 AUD；
- workflow 成功后必须读取 artifact，至少核对 `result.json`、`full-lifecycle-result.json`、expected SHA 与关键 screenshot/trace；
- HTTP fetch、源码、CI、Vercel connector 只能补充，不得替代真实页面交互。

### Release Gate

Gate 只有在以下证据属于同一 exact head 时才可给最终结论：

- H5 Build Check success；
- READY Vercel candidate；
- `Candidate Browser Blackbox` completed/success；
- artifact `candidate-browser-evidence-<same SHA>` 存在；
- `result.json.ok=true` 与 `full-lifecycle-result.json.ok=true`；
- 对该 deployment 的真实 mobile / Visual / English / 双用户 / 主生命周期浏览器证据；
- live backlog 与发布相关 P0/P1 状态；
- repo/live Supabase 与安全一致性证据。

缺少 candidate 或对应真实浏览器证据时，Gate 只能 `WAITING_FOR_CANDIDATE_OR_BLACKBOX`，不能把“没有 Preview/浏览器能力”登记成产品缺陷。

## 7. main 与生产边界

- 不得为了让 Vercel 自动部署而提前 merge/push main。
- 不得用 main Production 代替 Preview 验证。
- Gate PASS 之前所有自动化禁止直接 merge/push main。
- Gate PASS 也不等于自动 merge；最终 merge 决策仍由用户/总控做出。
- 若 main merge 后生产部署失败，应按发布事故处理，不回写成“候选已经通过所以忽略”。

## 8. Hobby 配额治理

- 日常开发不自动部署是主动成本控制策略，不是 Vercel 故障。
- 一个候选周期原则上只移动一次 `release-candidate` 并产生一份 Preview。
- 若 candidate freeze 后确有必要更新代码、测试基础设施或 canonical 文档，应接受旧 candidate 作废，并在新 exact-head CI green 后重新生成 candidate；不得为了节省一次 Preview 而测试旧 SHA。
- 手动通用 Deploy 若不能证明 Git source SHA，不作为 Gate 证据；优先使用 `release-candidate` Git Integration。

## 9. 2026-08-30 首次实证与浏览器能力收口

发布分支模型已在真实项目上完成首次闭环验证：

- feature branch Git deployment 被默认关闭；
- `release-candidate` 被移动到当时 PR #20 exact head；
- Vercel 自动生成 READY Preview；
- deployment metadata 正确记录 `githubCommitRef=release-candidate` 与相同 `githubCommitSha`；
- 因而证明该模型可同时满足 Hobby 配额控制与 exact-head 可追溯性。

随后真实黑盒自动化复盘发现：ChatGPT 定时任务自身运行环境不具备稳定浏览器/DNS/移动端页面操作能力。该事件不属于产品缺陷，而属于测试执行器能力缺口。项目因此新增 GitHub Actions + Playwright 真实浏览器层，并将 ChatGPT 自动化改为证据复核者。以后不得再把“连接器能 fetch 页面”误称为真实浏览器黑盒。

具体 SHA、deployment id 与 URL 只属于当次运行证据，不在本文固化。

## 10. 文档同步要求

任何发布模型、Vercel 分支策略或 Browser Blackbox 能力变化，必须在同一轮同步：

1. `docs/RELEASE_GOVERNANCE.md`；
2. `docs/BROWSER_BLACKBOX_BASELINE.md`；
3. `docs/ENVIRONMENT_BASELINE.md`；
4. `docs/AUDIT_AUTOMATION_GOVERNANCE.md`；
5. `docs/P0_ACCEPTANCE.md`；
6. README；
7. `vercel.json` / CI / Playwright 等实际配置；
8. `CHANGELOG.md`；
9. 相关自动化 prompt。

禁止只更新 workflow、只更新 `vercel.json` 或只在聊天中约定。
