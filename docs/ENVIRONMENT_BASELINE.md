# 球搭子环境与基础配置基线

> 本文是「球搭子」工程环境身份、基础配置与部署边界的 canonical source。凡是项目 ID、仓库、分支、运行环境、环境变量、部署平台角色等基础信息发生冲突，以本文 + 运行时重新校验结果为准；不得以旧聊天、旧日志、历史截图或模型记忆替代。发布流程与候选分支的详细顺序以 `docs/RELEASE_GOVERNANCE.md` 为准；真实浏览器黑盒执行能力以 `docs/BROWSER_BLACKBOX_BASELINE.md` 为准；repository visibility 变更边界以 `docs/PUBLIC_READINESS.md` 为准。

## 1. GitHub

- Repository：`rmit-s3674091-Yating-Li/-qiudazi-h5`
- 当前运行态 visibility：**Private**。repository visibility 是受控环境配置，不是应用安全边界，也不再要求永久固定为 Private。任何 Private → Public 变更必须先满足 `docs/PUBLIC_READINESS.md` 的 full-Git-history secret scan、current-head tracked-file preflight、canonical docs sync、integration/fork 权限复核等要求，并取得 Owner 明确授权；在授权前不得改变 visibility。
- `.github/workflows/build.yml` 不再以 `github.event.repository.private=true` 作为产品/发布 invariant。Build 继续校验 canonical Supabase identity、migration/preflight、tracked server-secret 模式与实际构建；visibility 合法性由本文 + `docs/PUBLIC_READINESS.md` 的受控配置流程判断。
- 默认分支：`main`
- 当前 remediation 开发分支、PR 编号与 exact head 均属于运行时事实；每轮必须直接读取当前受控 remediation PR 的 head branch / exact head，不在本文固化。
- 发布候选分支：`release-candidate`。该分支不是长期开发分支，只在 Candidate Freeze 后由总控移动到已经通过要求的 PR exact head，用于触发一份可追溯 Vercel Preview；任何独立开发、cherry-pick 或额外内容 commit 都不得落在该分支。
- 当前 remediation PR 在整改与收口阶段保持 Draft；未通过 Release Gate 不 merge main。
- GitHub Actions：`.github/workflows/build.yml` 的 `H5 Build Check` 是基础 Build CI；开发阶段按 affected-scope evidence 节流，Candidate Freeze / Release 阶段恢复 strict exact-SHA full-chain evidence。
- GitHub Actions：`.github/workflows/candidate-browser-blackbox.yml` 是当前唯一正式候选真实浏览器执行器；仅针对 `release-candidate` exact head，使用 Playwright 启动 Chromium / WebKit，并上传 exact-SHA browser evidence artifact。
- Browser Blackbox 使用 GitHub Actions `id-token: write` 获取短时 OIDC token 访问受保护 Vercel Preview，不在仓库保存长期 Vercel bypass secret。
- 当前 Private + 账号方案下，repository ruleset API 已返回“Upgrade to GitHub Pro or make this repository public to enable this feature”；因此**当前不得声称 main 已由 GitHub ruleset 平台强制保护**。若后续经 Owner 授权改为 Public，应重新读取 ruleset/branch-protection 能力并按实际可用能力配置或记录，不得沿用 Private 阶段结论。
- 当前 main 保护采用流程治理：所有开发只写当前受控 feature branch → 当前 PR → 开发期 affected-scope CI → Candidate Freeze → strict exact-SHA CI → `release-candidate` exact-head Preview + Candidate Browser Blackbox → 黑盒证据复核 → Release Gate → 人工 merge 决策；所有自动化均禁止直接 merge/push main。
- ChatGPT GitHub connector 当前可正常读取当前 Private PR。若后续 visibility 发生受控变化，连接器权限、PR、Vercel Git link 与 Actions 行为都必须在变更后重新验证，不得把历史 Private 验证结果自动外推到 Public。

> 分支 head SHA、PR merge SHA、workflow run id 属于动态运行事实，不写成长期固定值；每轮工作必须实时读取。

## 2. Supabase 共享测试环境

- 项目名：`qiudazi-test`
- canonical project ref / project_id：`rtmjzmgrhifjzxaliltm`
- API host：`https://rtmjzmgrhifjzxaliltm.supabase.co`
- 前端环境变量：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_ANON_KEY` / publishable key 是浏览器客户端凭据，不等同于 service role；service-role key、数据库密码、访问 token 等不得写入仓库或本文。repository 变为 Public 时也不得把 browser-visible publishable/anon key 错判为 server secret；真实安全边界仍是 Auth、RLS、RPC ACL、Storage policy 与 server-only secrets。
- 任何 SQL、migration、Storage、Edge Function、Advisor、审计 backlog 操作前必须运行时确认 project list / detail 中存在 `qiudazi-test → rtmjzmgrhifjzxaliltm`。
- 出现 `You do not have permission to perform this action` 时，诊断顺序：project ref 可见性 → ChatGPT/连接器权限 → Supabase project/organization role → 数据库 grant/RPC/RLS。

## 3. Supabase migration 基础规则

- 目录：`supabase/migrations/`
- 文件名：`YYYYMMDDHHMMSS_snake_case.sql`
- 14 位 migration version 在 repo 内全局唯一。
- live 已应用的 migration 写回 repo 时必须使用 live 的同一 version 和同一 SQL 语义。
- 新 migration 前必须同时读取 live migration list 与 repo migration 目录，避免并发 writer 重号或 version 漂移。
- H5 Build / Integration 的 clean replay 应按 workflow 当前 scope 执行；开发期可避免无关 PR 重复 replay，但 `main`、显式完整验证与 Candidate/Release 所需 strict evidence 不得降低 migration invariant。
- Release Gate 必须检查 repo/live migration version 与最终 schema/RPC/RLS/Storage/Edge Function 一致性。

## 4. 前端运行配置

- 应用：React + Vite H5。
- `package.json` 当前 Node engine：`>=22.12.0`；CI 使用 Node `22.12.0`。
- Vite build target：`es2022`。
- `npm run build` 在 Vite build 前执行 `scripts/write-build-meta.mjs`，生成 `/build-meta.json`；Vercel 候选构建必须把 `VERCEL_GIT_COMMIT_SHA` 与 `VERCEL_GIT_COMMIT_REF` 写入该文件，供 Browser Blackbox 做运行时 exact-head 二次校验。
- 前端 Supabase 配置的 canonical 来源优先级：部署环境变量 → 本地 `.env`；任何源码 fallback 若存在，只能作为测试环境容灾，并且其 URL 必须与本文 canonical project ref 一致。
- `.env*` 默认不入库；仅 `.env.example` 可以入库，且不得包含 service-role key、数据库密码或其它服务器秘密。
- `.env.example` 应写清 canonical 测试 URL，并把 publishable key 保持为占位符，避免开发者拿错 project ref。
- H5 Build Check 会扫描 tracked files 中的典型服务器秘密模式（service secret token、GitHub PAT、private key、含密码 PostgreSQL URL 等）；publishable/anon browser key 不作为服务器秘密处理。
- tracked-file preflight 只能证明当前被检查内容；**不能替代 full-Git-history secret scan**。Public visibility 变更前必须按 `docs/PUBLIC_READINESS.md` 对所有可达历史对象/refs 执行真实 history scanner，并复核发现项。

## 5. Vercel

- 角色：公网 Preview / 候选黑盒验证，不是 Supabase 数据真源。
- 当前项目名：`qiudazi-h5`；运行时已确认 Git link：`rmit-s3674091-Yating-Li/-qiudazi-h5`。project id 属于平台事实，使用时仍应从 Vercel 当前项目列表重新读取。
- `vercel.json`：framework=`vite`、build=`npm run build`、output=`dist`。
- Git deployment 采用**候选分支白名单**：`git.deploymentEnabled` 中 `** = false`，仅 `main = true` 与 `release-candidate = true`。使用 globstar 是为了覆盖 `feature/...` 等包含 `/` 的分支名；普通 feature/docs/fix push 不产生 Vercel deployment，从而控制 Hobby 配额。
- 三层发布模型固定为：feature/docs/fix 只跑 CI → `release-candidate` 只触发唯一候选 Preview → `main` 只承担 Gate 通过后的正式发布语义。详细规则见 `docs/RELEASE_GOVERNANCE.md`。
- `release-candidate` 是 Preview 触发器，不承载独立开发。总控只有在 release-blocking P0/P1 不存在 `OPEN` / `IN_PROGRESS`、PR exact head 满足 Candidate Freeze 所需 CI、repo/live 一致性满足候选条件、canonical 文档已同步后，才允许把 `release-candidate` 移动到该 exact head。开发期 affected-scope evidence 不等于 Candidate Freeze evidence；Freeze 时必须重新满足 strict exact-SHA 要求。
- 移动 candidate 后必须读取 Vercel deployment metadata，确认 `state=READY`、`githubCommitRef=release-candidate`、`githubCommitSha` 与 PR exact head 完全一致，且 Browser Blackbox 从 `/build-meta.json` 再次确认同一 SHA/ref，才视为正式可测 candidate。
- Candidate Freeze 后任何代码、migration、测试基础设施或 canonical 文档提交都会使旧 Preview 失去 exact-head 资格。此时必须暂停黑盒/Gate，重新等待新 head CI，再移动 `release-candidate`；不得继续测试旧 SHA。
- 若 `release-candidate` 产生的 deployment SHA 与 PR exact head 不一致，不得用于黑盒/Gate；应停止后续测试并调查 Git/Vercel integration，不得用旧 Preview 顶替。
- Browser Blackbox 的 GitHub-hosted Playwright runner 是真实浏览器执行环境；ChatGPT/Vercel connector 的 HTTP fetch 能力不是浏览器执行环境，不能承担点击、输入、viewport、文件上传或双会话验收。
- `main` 保留 Git deployment 是为了 Gate 通过、人工 merge 决策后产生正式部署；未通过 Gate 时自动化仍禁止 merge/push main，也不得用 main Production 替代 Preview 验证。
- repository visibility 发生受控变化后，必须重新验证 Vercel GitHub App 对该 repository 的访问、Git link、Preview/Production branch mapping 与 deployment metadata；若后续无法列出项目或部署，应先检查 GitHub App repository access，而不是立即重连/重建项目。
- deployment id、Preview URL、候选 SHA 属于运行时平台事实，不凭历史值长期硬编码；使用前从 Vercel 当前项目/部署列表重新读取。
- 2026-08-30 已真实验证：将 `release-candidate` 移到当时 exact head 后，Vercel 自动生成 READY Preview，metadata 正确记录同一 `githubCommitRef` 与 `githubCommitSha`。该事实证明机制有效，但具体 SHA/deployment id 不作为长期配置保存。

## 6. CloudBase

- 角色：中国区手工测试/候选部署目标。
- CloudBase 当前不作为 GitHub 自动同步真源；必须在 Release Gate / 受控 Preview 通过后再手工更新。
- CloudBase environment id、domain、deployment id 等若未在当前运行时重新验证，不得写成“已确认”基础事实；后续取得稳定环境标识后补充本文。

## 7. 审计与自动化

- 正式审计 backlog 唯一事实源：Supabase `audit_ops.issue_registry`。
- `public.audit_issue_registry_readonly` 与 `public.audit_list_issues()` 只是读取接口；`docs/AUDIT_BACKLOG_SNAPSHOT.json` 只是降级缓存。
- 现役自动化涉及 Supabase 前均必须先验证本文的 environment identity；不得从任务 prompt、旧运行结果或 snapshot 自己猜 project_id。
- 环境映射与本文不一致时，停止写操作并报告 `ENVIRONMENT_IDENTITY_MISMATCH`；不得通过不断尝试不同 project_id 来“碰运气”。
- GitHub repository visibility 与本文记录的当前运行态不一致时属于**未受控配置漂移**；审计/Release Gate 应报告并阻塞候选。经 `docs/PUBLIC_READINESS.md` 完成前置检查、Owner 明确授权、运行时完成 visibility change 并同步本文后，Public 本身不得再被自动判定为安全事故或产品失败。
- 当前 Private + 非 Pro 运行态下，不得把“ruleset/platform branch protection 存在”当成 Gate 证据；若 Public 后平台能力发生变化，必须重新读取并记录实际 ruleset/branch-protection 状态后才能作为证据。无论 visibility 如何，所有自动化继续严格禁止直接 merge main。
- 黑盒和 Gate 必须以 `docs/RELEASE_GOVERNANCE.md` 与 `docs/BROWSER_BLACKBOX_BASELINE.md` 的 exact-head candidate / browser evidence 条件为准；没有 current-head READY candidate 或没有 same-SHA Browser Blackbox artifact 时不得给最终 Gate PASS。
- Browser runner/OIDC/DNS/Playwright 自身故障统一标记 `BROWSER_INFRA_FAILURE`，不是产品 AUD；真实浏览器进入产品后复现的业务/权限/视觉问题才进入正式 backlog。
- GitHub Actions quota/billing 类 job-start blocker 属于基础设施证据。若 job 在 workflow steps 前被拒绝，不得把无 steps 的 failure 自动解释为产品、Supabase 或 workflow regression；应先核对账户 Actions allowance/budget/visibility 条件。

## 8. 配置变更流程

任何基础配置发生变化（例如 Supabase project ref、GitHub repo、repository visibility、主分支、候选分支、部署环境、Browser Blackbox 执行器、关键 env var 名称）时，必须在同一受控变更切片完成：

1. 运行时验证新事实；
2. 若涉及 Private/Public，先满足 `docs/PUBLIC_READINESS.md` 的前置 Gate 并取得 Owner 明确授权；
3. 更新本文；
4. 更新 `docs/RELEASE_GOVERNANCE.md` 与 `docs/BROWSER_BLACKBOX_BASELINE.md`（若涉及发布/黑盒）；
5. 更新实际配置/代码/CI/Playwright；
6. 更新 README 的引用与必要摘要；
7. 更新 `docs/P0_ACCEPTANCE.md` 与 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 中相关 Gate 规则；
8. 更新 `CHANGELOG.md`（实际配置变化时）；
9. 检查自动化 prompt 是否还硬编码旧值或假定自身拥有浏览器能力；
10. 配置变化后重新执行与变化范围相匹配的环境验证；进入 Candidate Freeze/Release 时必须重新建立 strict exact-SHA CI / READY Preview / same-SHA Browser Blackbox 证据。

**禁止只修改其中一处。** 基础配置属于“低频但高影响”信息，宁可运行时再次确认，也不得依赖记忆。Public Readiness 文档准备本身不等于已经改变 repository visibility；只有 Owner 明确授权后的实际 GitHub 配置变更才更新“当前运行态”事实。