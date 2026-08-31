# 球搭子环境与基础配置基线

> 本文是「球搭子」工程环境身份、基础配置与部署边界的 canonical source。凡是项目 ID、仓库、分支、运行环境、环境变量、部署平台角色等基础信息发生冲突，以本文 + 运行时重新校验结果为准；不得以旧聊天、旧日志、历史截图或模型记忆替代。发布流程与候选分支的详细顺序以 `docs/RELEASE_GOVERNANCE.md` 为准；真实浏览器黑盒执行能力以 `docs/BROWSER_BLACKBOX_BASELINE.md` 为准。

## 1. GitHub

- Repository：`rmit-s3674091-Yating-Li/-qiudazi-h5`
- canonical visibility：**Private**。运行时 `visibility` 必须为 `private`；H5 Build Check 会校验 `github.event.repository.private=true`，若意外变回 public 直接失败。
- 默认分支：`main`
- 当前 remediation 开发分支：`feature/20260831-postdeploy-ui-quickstart-filter-qa`
- 发布候选分支：`release-candidate`。该分支不是长期开发分支，只在 Candidate Freeze 后由总控移动到已经通过 exact-head CI 的 PR head，用于触发一份可追溯 Vercel Preview；任何独立开发、cherry-pick 或额外内容 commit 都不得落在该分支。
- 当前 remediation PR：`#22`；PR 编号、head SHA 与分支仍属于运行时事实，每轮必须重新读取，不得仅凭本文缓存。
- PR #22 在整改与收口阶段保持 Draft；未通过 Release Gate 不 merge main。
- GitHub Actions：`.github/workflows/build.yml` 的 `H5 Build Check` 是当前基础 CI。
- GitHub Actions：`.github/workflows/candidate-browser-blackbox.yml` 是当前唯一正式候选真实浏览器执行器；仅针对 `release-candidate` exact head，使用 Playwright 启动 Chromium / WebKit，并上传 exact-SHA browser evidence artifact。
- Browser Blackbox 使用 GitHub Actions `id-token: write` 获取短时 OIDC token 访问受保护 Vercel Preview，不在仓库保存长期 Vercel bypass secret。
- 当前 GitHub 账号方案下，仓库转为 Private 后 repository ruleset API 返回“Upgrade to GitHub Pro or make this repository public to enable this feature”；因此**不得再声称 main 当前由 GitHub ruleset 平台强制保护**。
- 当前 main 保护采用流程治理：所有开发只写当前受控 feature branch → 当前 PR → exact-head CI → Candidate Freeze → `release-candidate` exact-head Preview + Candidate Browser Blackbox → 黑盒证据复核 → Release Gate → 人工 merge 决策；所有自动化均禁止直接 merge/push main。若未来升级 GitHub Pro 并重新启用 private-repo ruleset，必须运行时验证后再把“平台强制保护”写回本文。
- Private 转换后已确认：ChatGPT GitHub connector 仍可正常读取当前 PR；Vercel Git link 仍指向同一 repository。连接器权限、PR 编号与 Git link 使用前仍应运行时复核。

> 分支 head SHA、PR merge SHA、workflow run id 属于动态运行事实，不写成长期固定值；每轮工作必须实时读取。

## 2. Supabase 共享测试环境

- 项目名：`qiudazi-test`
- canonical project ref / project_id：`rtmjzmgrhifjzxaliltm`
- API host：`https://rtmjzmgrhifjzxaliltm.supabase.co`
- 前端环境变量：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_ANON_KEY` / publishable key 是浏览器客户端凭据，不等同于 service role；service-role key、数据库密码、访问 token 等不得写入仓库或本文。
- 任何 SQL、migration、Storage、Edge Function、Advisor、审计 backlog 操作前必须运行时确认 project list / detail 中存在 `qiudazi-test → rtmjzmgrhifjzxaliltm`。
- 出现 `You do not have permission to perform this action` 时，诊断顺序：project ref 可见性 → ChatGPT/连接器权限 → Supabase project/organization role → 数据库 grant/RPC/RLS。

## 3. Supabase migration 基础规则

- 目录：`supabase/migrations/`
- 文件名：`YYYYMMDDHHMMSS_snake_case.sql`
- 14 位 migration version 在 repo 内全局唯一。
- live 已应用的 migration 写回 repo 时必须使用 live 的同一 version 和同一 SQL 语义。
- 新 migration 前必须同时读取 live migration list 与 repo migration 目录，避免并发 writer 重号或 version 漂移。
- H5 Build Check 在启动本地 Supabase 前必须先执行 filename/version uniqueness preflight；随后 clean replay。
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

## 5. Vercel

- 角色：公网 Preview / 候选黑盒验证，不是 Supabase 数据真源。
- 当前项目名：`qiudazi-h5`；运行时已确认 Git link：`rmit-s3674091-Yating-Li/-qiudazi-h5`。project id 属于平台事实，使用时仍应从 Vercel 当前项目列表重新读取。
- `vercel.json`：framework=`vite`、build=`npm run build`、output=`dist`。
- Git deployment 采用**候选分支白名单**：`git.deploymentEnabled` 中 `** = false`，仅 `main = true` 与 `release-candidate = true`。使用 globstar 是为了覆盖 `feature/...` 等包含 `/` 的分支名；普通 feature/docs/fix push 不产生 Vercel deployment，从而控制 Hobby 配额。
- 三层发布模型固定为：feature/docs/fix 只跑 CI → `release-candidate` 只触发唯一候选 Preview → `main` 只承担 Gate 通过后的正式发布语义。详细规则见 `docs/RELEASE_GOVERNANCE.md`。
- `release-candidate` 是 Preview 触发器，不承载独立开发。总控只有在发布相关 P0/P1 收口、PR exact head CI green、repo/live 一致性满足候选条件、canonical 文档已同步后，才允许把 `release-candidate` 移动到该 exact head；移动后必须读取 Vercel deployment metadata，确认 `state=READY`、`githubCommitRef=release-candidate`、`githubCommitSha` 与 PR exact head 完全一致，且 Browser Blackbox 从 `/build-meta.json` 再次确认同一 SHA/ref，才视为正式可测 candidate。
- Candidate Freeze 后任何代码、migration、测试基础设施或 canonical 文档提交都会使旧 Preview 失去 exact-head 资格。此时必须暂停黑盒/Gate，重新等待新 head CI，再移动 `release-candidate`；不得继续测试旧 SHA。
- 若 `release-candidate` 产生的 deployment SHA 与 PR exact head 不一致，不得用于黑盒/Gate；应停止后续测试并调查 Git/Vercel integration，不得用旧 Preview 顶替。
- Browser Blackbox 的 GitHub-hosted Playwright runner 是真实浏览器执行环境；ChatGPT/Vercel connector 的 HTTP fetch 能力不是浏览器执行环境，不能承担点击、输入、viewport、文件上传或双会话验收。
- `main` 保留 Git deployment 是为了 Gate 通过、人工 merge 决策后产生正式部署；未通过 Gate 时自动化仍禁止 merge/push main，也不得用 main Production 替代 Preview 验证。
- repository 改 Private 后，必须保持 Vercel 对 private GitHub repo 的授权；若后续无法列出项目或部署，应先检查 GitHub App repository access，而不是立即重连/重建项目。
- deployment id、Preview URL、候选 SHA 属于运行时平台事实，不凭历史值长期硬编码；使用前从 Vercel 当前项目/部署列表重新读取。
- 2026-08-30 已真实验证：将 `release-candidate` 移到当时 exact head 后，Vercel 自动生成 READY Preview，metadata 正确记录同一 `githubCommitRef` 与 `githubCommitSha`。该事实证明机制有效，但具体 SHA/deployment id 不作为长期配置保存。

## 6. CloudBase

- 角色：中国区手工测试/候选部署目标。
- CloudBase 当前不作为 GitHub 自动同步真源；必须在 Release Gate / 受控 Preview 通过后再手工更新。
- CloudBase environment id、domain、deployment id 等若未在当前运行时重新验证，不得写成“已确认”基础事实；后续取得稳定环境标识后补充本文。

## 7. 审计与自动化

- 正式审计 backlog 唯一事实源：Supabase `audit_ops.issue_registry`。
- `public.audit_issue_registry_readonly` 与 `public.audit_list_issues()` 只是读取接口；`docs/AUDIT_BACKLOG_SNAPSHOT.json` 只是降级缓存。
- 五个现役自动化涉及 Supabase 前均必须先验证本文的 environment identity；不得从任务 prompt、旧运行结果或 snapshot 自己猜 project_id。
- 环境映射与本文不一致时，停止写操作并报告 `ENVIRONMENT_IDENTITY_MISMATCH`；不得通过不断尝试不同 project_id 来“碰运气”。
- GitHub repository visibility 若不是 private，属于基础环境漂移；安全审计/Release Gate 应报告并阻塞候选。
- 在当前 private + 非 Pro 方案下，不得把“ruleset/platform branch protection 存在”当成 Gate 证据；只能把 PR/CI/Candidate/Browser Blackbox/Gate 过程证据视为当前有效治理。所有自动化继续严格禁止直接 merge main。
- 黑盒和 Gate 必须以 `docs/RELEASE_GOVERNANCE.md` 与 `docs/BROWSER_BLACKBOX_BASELINE.md` 的 exact-head candidate / browser evidence 条件为准；没有 current-head READY candidate 或没有 same-SHA Browser Blackbox artifact 时不得给最终 Gate PASS。
- Browser runner/OIDC/DNS/Playwright 自身故障统一标记 `BROWSER_INFRA_FAILURE`，不是产品 AUD；真实浏览器进入产品后复现的业务/权限/视觉问题才进入正式 backlog。

## 8. 配置变更流程

任何基础配置发生变化（例如 Supabase project ref、GitHub repo、repository visibility、主分支、候选分支、部署环境、Browser Blackbox 执行器、关键 env var 名称）时，必须在同一轮完成：

1. 运行时验证新事实；
2. 更新本文；
3. 更新 `docs/RELEASE_GOVERNANCE.md` 与 `docs/BROWSER_BLACKBOX_BASELINE.md`（若涉及发布/黑盒）；
4. 更新实际配置/代码/CI/Playwright；
5. 更新 README 的引用与必要摘要；
6. 更新 `docs/P0_ACCEPTANCE.md` 与 `docs/AUDIT_AUTOMATION_GOVERNANCE.md` 中相关 Gate 规则；
7. 更新 `CHANGELOG.md`；
8. 检查自动化 prompt 是否还硬编码旧值或假定自身拥有浏览器能力；
9. 重新跑 exact-head CI / 必要环境验证 / same-SHA Browser Blackbox。

**禁止只修改其中一处。** 基础配置属于“低频但高影响”信息，宁可运行时再次确认，也不得依赖记忆。