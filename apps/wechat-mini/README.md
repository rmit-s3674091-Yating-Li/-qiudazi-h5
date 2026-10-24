# 球搭子微信小程序 · 零新增外部付费离线 PoC

**状态：仅源码候选 PATCH_PACKAGE；未在 GitHub 落地、未安装依赖、未完成 Taro 编译或微信真机验证。**

在仓库根目录执行：

```bash
npm --prefix apps/wechat-mini run test:offline
npm --prefix apps/wechat-mini run lint:boundary
# 经主 Chat 审核版本/依赖后，允许下载开源 npm 包（不是采购服务）：
npm --prefix apps/wechat-mini install --package-lock-only
npm --prefix apps/wechat-mini ci
npm --prefix apps/wechat-mini run typecheck
npm --prefix apps/wechat-mini run format:check
npm --prefix apps/wechat-mini run build:weapp
```

H5 根目录的 `package.json`、构建、路由和地图 P3 不变。`scripts/sync-domain.mjs` 从仓库唯一真源 `src/domain/{types,ScoringEngine,QuickGroupConfig,ParticipantPointReceipt,AuthAccountGeneration}.ts` 复制生成文件到被 gitignore 的 `src/shared-domain/`；不在 H5 创建第二套计分规则。离线单测同时运行原 H5 与小程序生成规则，防止复制漂移。

小程序只展示模拟记分、Quick 规则和静态地图；`TaroTransport`/`TaroUpload` 只是平台原语封装，**没有接入真实 Supabase Storage/Auth**，不可用于生产。`MockIdentityServer` 的 `SESSION_BRIDGE_UNPROVEN` 是刻意失败关闭，绝不返回真实 JWT/refresh token。旧账号绑定 mock 仅凭预设的服务端证明；不通过昵称、头像或手机号相似性恢复。Admin 继续以 JWT Auth UUID 独立授权，不能通过 Profile alias 自动继承。

`project.config.json` 的 `touristappid` 只用于本地开发工具模拟，不是可发布 AppID。所有分享/邀请 intent 只是路由语法，真实服务端仍必须检查有效期、接收人、角色、隐私及撤销状态。真实小程序合法域名、服务类目、个人主体认证、APP 备案、隐私配置和费用均待微信后台与官方原文核验。

**验收分层：** G1 `offline-test`、`typecheck`、`format`、`build` 的实际日志才能证明编译；G2 必须单独批准 TEST 微信→Supabase 可刷新会话、RLS、G/老郑历史 Profile/照片及 Admin 隔离；G4 还需个人主体类目/备案/合法域名、iOS/Android 中国真机、微信审核。三个 Gate 不得相互替代。
