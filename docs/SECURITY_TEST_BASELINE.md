# 球搭子｜安全测试基线

> 状态：Canonical security test baseline。适用于当前受控测试环境与 release-candidate；不得对 Production、第三方非自有系统或无授权目标开展攻击性测试。

## 1. 测试目标
验证“前端不可见”不是安全边界，关键身份、赛事、记分、邀请、隐私和照片能力均由 Supabase Auth / RPC / Edge Function / RLS / Storage Policy / 服务端业务校验强制执行。

## 2. 范围
- 身份与会话：测试昵称 alias、canonical Profile 解析、切换账号/退出、session storage 隔离。
- 授权矩阵：owner / participant / invited / viewer / anonymous。
- 对象级授权（IDOR）：event_id、match_id、entry_id、player/profile id、invite token、event photo id、personal photo id。
- RPC / Edge：execute 权限、service_role 专用函数、actor 绑定、错误信息最小化。
- 数据库：RLS、SECURITY DEFINER 的 search_path、函数对 anon/authenticated/public 的 grant/revoke。
- Storage：event-photos / personal album 保持 private；signed URL 短时、按角色签发；路径不可通过列表接口泄漏。
- 隐私：private standard Hall 脱敏；profile visibility；partner-only album；公开赛事不等于照片公开。
- 邀请：token 生命周期、重复接受/取消/过期、本人邀请、跨用户清理边界。
- 记分：version/idempotency/operation_id、并发更新、失败重试不得重复计分。
- 输入与文件：昵称/城市/场地/队伍名边界、异常 Unicode、文件类型/大小/路径、Storage key 注入。
- 客户端泄漏：bundle/env/build-meta/log/错误提示不得出现 service-role key、JWT、refresh token、SQL stack 或私有 schema 数据。
- 发布供应链：migration repo/live exact version、Edge live/repo 对齐、Preview build-meta exact SHA。

## 3. 方法
1. 白盒静态审计：代码、migration、grant/revoke、RLS、Edge、Storage policy、客户端 bundle 引用。
2. 数据库/服务端动态测试：仅 shared test Supabase；优先事务 rollback fixture；用不同角色证明允许/拒绝边界。
3. 浏览器安全黑盒：release-candidate exact Preview；验证匿名/普通 viewer/participant/owner 的可见入口与直接请求拒绝。
4. 证据要求：记录 exact SHA、live migration version、Edge version、测试身份、请求目标、预期/实际结果；失败需区分 product security defect / harness / infra。

## 4. 必测用例
### 4.1 身份与 Alias
- alias 用户所有身份敏感 RPC/Edge 通过 canonical resolver 得到同一 Profile。
- private alias 表不得授权给 anon/authenticated。
- 切换账号/退出后不得继续读到上一身份私有数据。

### 4.2 赛事对象级授权
- 非 owner 直接调用管理/取消/解锁/draw/start/score 必须拒绝。
- participant 仅拥有其明确允许能力；invited/viewer 不因知道 event_id/match_id 获得写权限。
- private event 通过直接 URL/RPC 不泄漏大厅已脱敏字段之外的信息。

### 4.3 照片
- event-photos 和 personal assets 不公开列目录。
- viewer / invited 非 participant 直接调用 list/original/sign/import/delete 均拒绝。
- participant 可 import 自己参与赛事的源照片，但不能删源。
- organizer 可管理源照片；若同时 participant，也可 import personal copy。
- 源删除不删除已导入 personal copy；partner 仅获得允许的水印预览，不获得 original/path。

### 4.4 邀请与关系
- invite token 不可用于建立与目标不符的关系；重复/取消/过期状态不可绕过。
- “清理已取消”只能删除当前用户自己发出的 cancelled，不能删除其他用户或 pending/accepted/expired。

### 4.5 记分与并发
- begin/score/point/undo 均校验 owner、event version、match version。
- 同 operation_id 重试不得重复加分。
- 并发冲突失败不产生部分写入。
- alias owner command 返回 snapshot 仍保持 viewer_role=owner。

### 4.6 输入/输出与信息泄漏
- 用户可控文本不得产生 SQL 注入/HTML script 执行。
- 错误响应和 UI 不显示 SQL/RPC/JWT/RLS/raw stack/service key。
- 客户端构建物不得包含 service-role secret。
- 上传文件拒绝不支持类型；Storage path 由受控规则生成，不能由文件名注入任意路径。

## 5. 当前非目标
- 不做 DoS/高频压力攻击。
- 不对 Vercel/Supabase 平台本身做漏洞探测。
- 不把受控测试昵称机制当成正式生产身份安全方案；测试目标是确认其边界被明确限制且不会越权。

## 6. 通过条件
P0/P1 安全缺陷为 0；所有服务端权限拒绝均有可重复证据；无 service-role/JWT/私有 Storage path/raw SQL 泄漏；repo/live migration 与 Edge 版本可追溯；Browser security smoke 在 exact-head Candidate 上通过。
