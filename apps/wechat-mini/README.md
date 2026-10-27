> 代码更新：第18–34批17份已融合，316项离线测试与真实Taro G1通过；第33批增加坐标来源/坐标系失败关闭门禁，第34批增加已确认场馆草稿与坐标来源关联门禁。二者均为 `OFFLINE_MOCK_ONLY`，正式身份仍为 `SESSION_BRIDGE_UNPROVEN`。[逐批代码台账](../../docs/V8_CODE_BATCH_20261027.json)。下文旧批次状态按历史快照理解。

# 球搭子微信小程序 · 零新增外部付费离线 PoC

**状态（2026-10-27 同步）：第十三至十七批已合并到本次源码：新鲜构建产物、直接依赖锁完整性、共享域同步隔离、连续点击及身份时钟回拨防护。G1 已在完整工作区运行；精确提交与 CI 结果以 Git 和 `WeChat Mini G1` 工作流为准。正式微信登录仍为 `SESSION_BRIDGE_UNPROVEN`，未经发布验收。**

在仓库根目录执行：

```bash
# package-lock.json 已落仓；使用现有锁文件复现，只有有意更改依赖时才审核更新锁文件。
npm --prefix apps/wechat-mini ci
# 不会下载依赖或部署；失败时列出 G1_BLOCKED 原因：
npm --prefix apps/wechat-mini run preflight:g1
# 串行执行 offline tests → boundary → typecheck → Prettier → Taro build，任一步失败即停：
npm --prefix apps/wechat-mini run verify:g1
# 另在仓库根执行既有 H5 test/build 与必要格式/CI 检查；不改地图 P3。
```

H5 根目录的 `package.json`、构建、路由和地图 P3 不变。`scripts/sync-domain.mjs` 从仓库唯一真源 `src/domain/{types,ScoringEngine,QuickGroupConfig,ParticipantPointReceipt,AuthAccountGeneration}.ts` 复制生成文件到被 gitignore 的 `src/shared-domain/`；不在 H5 创建第二套计分规则。离线单测同时运行原 H5 与小程序生成规则，防止复制漂移。

小程序只展示模拟记分、Quick 规则和静态地图；`TaroTransport`/`TaroUpload` 只是平台原语封装，**没有接入真实 Supabase Storage/Auth**，不可用于生产。`MockIdentityServer` 的 `SESSION_BRIDGE_UNPROVEN` 是刻意失败关闭，绝不返回真实 JWT/refresh token。旧账号绑定 mock 仅凭预设的服务端证明；不通过昵称、头像或手机号相似性恢复。Admin 继续以 JWT Auth UUID 独立授权，不能通过 Profile alias 自动继承。

`project.config.json` 的 `touristappid` 只用于本地开发工具模拟，不是可发布 AppID。所有分享/邀请 intent 只是路由语法，真实服务端仍必须检查有效期、接收人、角色、隐私及撤销状态。真实小程序合法域名、服务类目、个人主体认证、APP 备案、隐私配置和费用均待微信后台与官方原文核验。

**验收分层：** G1 `offline-test`、`typecheck`、`format`、`build` 的实际日志才能证明编译；G2 必须单独批准 TEST 微信→Supabase 可刷新会话、RLS、G/老郑历史 Profile/照片及 Admin 隔离；G4 还需个人主体类目/备案/合法域名、iOS/Android 中国真机、微信审核。三个 Gate 不得相互替代。

G1 通过仅表示本地源码测试和小程序构建通过；**不**表示微信 AppID、可刷新 Supabase Auth Session、G/老郑身份迁移、国内真机、备案/审核通过。真实登录仍为 `SESSION_BRIDGE_UNPROVEN`。`verify:g1` 不执行 npm install、Supabase 写入、微信 API、部署、push 或付费操作；依赖安装与测试由主 Chat 在批准的本地工作区完成。

## G1 仓库状态证据（第十一批）

`verify:g1` 在执行前后核对 Git HEAD 和小程序目录外已跟踪的 H5 文件变更；如果工作树在测试期间发生越界变更或 HEAD 变化则失败关闭，并记录 `G1_EVIDENCE_HEAD`。这仍不证明微信正式会话或真机审核通过。

第18–28批共11份候选代码尚未应用。本轮只同步研究/治理文档；当前路线及真实身份/媒体/地图/发布门槛见[实施 PRD](../../docs/research/miniprogram/miniprogram-implementation-prd.md)。不能把这些补丁的隔离结果当成本仓库 G1。
