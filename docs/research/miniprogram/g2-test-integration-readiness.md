# 微信小程序 G2 TEST 集成准备

更新：2026-10-28。状态：`OFFLINE_CONTRACT_READY / EXTERNAL_AUTHORIZATION_REQUIRED`。

本文件只定义 TEST 验收契约和联调顺序，不证明真实微信登录、Supabase 会话、RLS、Storage 或真机通过。离线执行器见 `apps/wechat-mini/src/core/g2-readiness.ts`；任一证据缺失时固定返回 `G2_BLOCKED` 和 `SESSION_BRIDGE_UNPROVEN`。

## 会话桥接契约

1. 小程序只提交一次性 `wx.login` code、request ID 和 client nonce；AppSecret、`session_key`、OpenID 解析与 code2Session 均留在受控服务端。
2. 服务端按 `(provider, app_id, openid)` 解析唯一外部身份；UnionID 可空，不能以昵称、头像或相似手机号自动合并。
3. 只有服务端核验的真实 Supabase Auth user 和可刷新会话才可返回 `SESSION_VERIFIED`。客户端解码 JWT、OpenID、Profile ID 或 mock 状态均不能成为可信 actor。
4. 历史用户必须使用旧账号控制权证明和明确确认，解析到唯一稳定 Profile；同一外部身份、Auth UUID 或 Profile 的冲突必须锁定，禁止重复 Profile。
5. access token 只保存在当前会话适配器，refresh token 使用平台安全存储；日志、路由、分享、缓存 key、错误信息和源码均不得包含凭据。退出需清理凭据、actor 代次、缓存和待执行意图。

## TEST 验收矩阵

| 领域          | 必须提供的真实证据                                       | 失败时状态                |
| ------------- | -------------------------------------------------------- | ------------------------- |
| 微信入口      | code 一次消费、重放拒绝、AppID 作用域、UnionID 可空      | `SESSION_BRIDGE_UNPROVEN` |
| Supabase 会话 | 服务端验证 user、刷新轮换、过期、退出/撤销               | `SESSION_BRIDGE_UNPROVEN` |
| 历史身份      | G/老郑等获授权 fixture 映射唯一旧 Profile，重复创建被拒  | `PROFILE_BINDING_BLOCKED` |
| RLS           | 自己可读写、他人拒绝、alias 路径不扩大公开读取           | `RLS_GATE_BLOCKED`        |
| Admin         | 只按真实 Auth UUID 授权，Profile alias 不继承 Admin      | `ADMIN_GATE_BLOCKED`      |
| 媒体          | 自己赛事/副本允许，其他用户拒绝，signed URL 过期         | `MEDIA_GATE_BLOCKED`      |
| 小程序运行时  | request/upload、actor-scoped Storage、分享恢复、跨页返回 | `WECHAT_RUNTIME_BLOCKED`  |

## 微信开发者工具联调顺序

1. 使用获准的 TEST AppID、TEST Supabase 项目和已登记的 HTTPS request/upload/download 域名；确认当前构建仍显示 `SESSION_BRIDGE_UNPROVEN`。
2. 用隔离测试账号执行登录交换，只在测试进程/安全存储内接收短期会话；通过服务端身份端点核验 Auth UUID 和稳定 Profile ID。
3. 执行刷新、退出、重放、账号 A→B→A、冷启动和 Storage 损坏/拒绝路径；确认旧异步结果、缓存、分享意图和页面返回全部失效。
4. 用获准的正反例 fixture 运行 Profile/RLS/Admin/Storage 媒体矩阵。不得在客户端使用 service role，不得放宽 policy 来让测试通过。
5. 运行赛事创建双页返回、分享恢复、上传弱网/取消测试；只在隔离 TEST 数据上写入，完成后按批准的清理方案回收。
6. 再在中国 iOS/Android 真机复测；开发者工具通过不能替代真机、备案、隐私、类目和审核。

## 进入 G2 需要用户批准或提供

- 可用于 TEST 的微信小程序 AppID/主体成员权限，以及 request/upload/download 合法域名配置权限。
- 明确选定并批准的 Supabase Session Bridge 实现；若涉及后端或 Auth 配置变更，需单独变更审查。
- 隔离 Supabase TEST 项目、短期测试账号，以及允许验证的历史 Profile 清单；禁止使用生产账号或生产数据替代。
- RLS、Admin、Storage/媒体正反例测试范围和必要的 TEST 数据写入/清理授权。
- 微信开发者工具与中国 iOS/Android 真机测试成员；定位、相册、分享等权限用途与隐私文案确认。

当前不需要用户重复提供：Taro/React/TypeScript 路线、离线 mock、G1 构建脚本、批次35–43的离线场馆流程。它们已经是工程基线，但不构成上述外部授权。
