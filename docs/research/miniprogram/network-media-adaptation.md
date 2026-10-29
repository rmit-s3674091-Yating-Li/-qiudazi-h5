> 当前状态校正（2026-10-27）：本文以下为原日期的研究/证据快照，不是当前实施状态。离线 Taro PoC 已落仓且已有 G1 记录；正式身份仍为 SESSION_BRIDGE_UNPROVEN。当前技术决定与状态分层以[实施 PRD](miniprogram-implementation-prd.md)及[融合入口](handoff.md)为准。本文历史“尚未批准 PoC/没有小程序代码”等句不覆盖较新的授权及源码。历史价格、资质与官方线索未在本轮重新核验。

> 设计研究文档 · 本文记录研究证据与候选方案，不代表代码已实现、费用已批准或正式上线。
> 来源：网络、存储、媒体及 Supabase 适配；2026-10-21—22 的原始 Handoff，基线 HEAD 39e17fe。
> 状态：DESIGN_COMPLETE_CANDIDATE_CONDITIONAL；用户尚未批准开发、数据库迁移或付费。

# 球搭子｜微信小程序 × H5：网络/媒体适配边界、存储实测与最低 TCO（第六轮增量）

STATUS=DESIGN_EVIDENCE_CONSUMED  
HANDOFF_ID=QD-MP-20261021-1808-NETWORK-MEDIA-TCO  
RESEARCH_TOPIC=小程序运行时网络与 Supabase SDK 适配；私有赛事照片跨端安全；现有存储复制成本及可执行 PoC 关口  
RESEARCH_DATE=2026-10-21 18:08 Asia/Shanghai  
BASE_REPO=rmit-s3674091-Yating-Li/-qiudazi-h5  
BASE_BRANCH=feature/v8-confirmed-20261011  
BASE_SHA=39e17febc23d5732c867bb2244a02fd2d99e36a8  
BASE_PR=Draft #26（只读核对；小程序研究不自动纳入 V8 五项开发）  
BASE_SUPABASE=qiudazi-test / rtmjzmgrhifjzxaliltm；所在 organization plan=free（只读）  
RESEARCH_MODE=READ_ONLY_GITHUB_SUPABASE_OFFICIAL_SOURCES  
PERSISTENCE_SCOPE=ONLY_LIBRARY_HANDOFF  
SUGGESTED_TARGET_FILES=docs/research/miniprogram/miniprogram-implementation-prd.md; docs/research/miniprogram/mini-program-feasibility.md; docs/research/miniprogram/cross-platform-product-scope.md; docs/research/miniprogram/identity-architecture.md; docs/research/miniprogram/official-sources.md; docs/research/miniprogram/handoff.md  
NO_PRODUCT_CODE_OR_DATABASE_OR_DEPLOYMENT_CHANGES=true  
PATCH_PACKAGE_ID=QD-MP-DOCS-20261021-1808-NETWORK-MEDIA

## 0. 增量说明：避免重做此前三份未消费 handoff

已读取 Library 下仍未消费的 20261021-0904（alias/RLS 审计）、20261021-1212（跨端绑定/恢复契约）、20261021-1511（零成本 session bridge PoC），以及仓库既有 `docs/research/miniprogram/framework-reuse-matrix.md`、`identity-architecture-and-cost.md`、`docs/V8_CONFIRMED_SCOPE.md`、`docs/V8_CURRENT_STATE.json`、`docs/DOCUMENT_GOVERNANCE.md`、`docs/ENVIRONMENT_BASELINE.md`。复用“保留 H5、Taro React/TS 为小程序 PoC 首选、共享纯 domain/backend、正式微信 session 桥接未证实”的既有结论。本轮不重复 wx.login/OIDC 路线比较，也不改变地图 P3 验收。

**本轮真正新增**：

1. 基于**实时测试库**核实赛事照片的 `storage.objects`/业务表一一对账与容量；发现当前个人相册导入采取**两份物理文件复制**，是免费存储额度的增长因素，但现有对象未发现孤儿文件。
2. 将 H5 `@supabase/supabase-js` 与 Taro 网络/媒体 API 的差异收敛为明确的 `TransportPort`/`SessionPort`/`MediaPort`/`StoragePort` 和测试门槛；**不能把 `Taro.uploadFile` 或自定义 `fetch` 当作已经与 Supabase 完全兼容**。
3. 发现当前 `avatars` 的 Storage policy 按 `auth.uid()` 路径授权，而业务照片既依赖 `auth.uid()` 路径，又依赖 alias-aware `current_profile_id()` 赛事 owner。跨 Auth UUID 绑定迁移不能只测赛事 RPC，还要测媒体访问/删除。
4. 官方资料确认：Supabase JS 允许 custom `global.fetch` 与 `auth.storage`；Taro 4 `request`、`uploadFile`、`FileSystemManager.readFile` 的输入输出并不等同标准浏览器 `fetch`/`Blob`。适配器的功能可测，不代表整套 SDK 已通过真机验证。

## 1. 运行时只读事实：现有媒体资产与授权

### 1.1 真实库统计（2026-10-21，本轮 SELECT，仅聚合、不导出文件路径或身份）

| 对象/表                           |                                 实际值 | 解释                                                   |
| --------------------------------- | -------------------------------------: | ------------------------------------------------------ |
| `storage.objects` `event-photos`  | 108 个对象，8,080,414 bytes ≈ 7.71 MiB | 当前私有赛事照片及个人相册媒体总量；不是全组织存储账单 |
| `storage.objects` `avatars`       |    89 个对象，198,787 bytes ≈ 0.19 MiB | 公开头像桶，不能据此推断历史账户总量                   |
| `public.event_photos`             |                                   5 条 | 赛事来源照片元数据                                     |
| `public.participant_album_photos` |                                  49 条 | 个人导入副本元数据                                     |
| 两表原图/水印引用路径             |                 108 条、108 个不同路径 | `2 × (5+49)=108`；与 Storage 108 个对象一致            |
| 引用路径在 Storage 缺失           |                                      0 | 本次快照未发现悬空引用                                 |
| Storage 中未被上述两表引用        |                                      0 | 本次快照未发现孤儿对象；**不要因此启动删除任务**       |

以上是同一时点测试库的**当前快照**，不是历史增长率或生产 SLA；统计依赖 `metadata.size` 可读，不代表全部组织其他项目的用量。已读取 organization 信息，`qiudazi-test` 所在 organization 为 **Free**；同组织还存在其他项目，不能将 Free 1 GB 额度全部当作球搭子独占剩余额度。建议主 Chat 后续只读读取组织 Usage 后才能定实际阈值。

### 1.2 文件访问与路径规则（已由源码+数据库 catalog 双重验证）

- `supabase/migrations/20260829143639_storage_reproducibility.sql` 与实时 `public.can_upload_photo(text)`：赛事照片路径第一段必须等于 JWT `auth.uid()`，第二段必须对应**已结束且当前业务 Profile 是 owner**的赛事。
- `supabase/functions/photo-management/index.ts` 的 `finalize_upload` 同时要求 `event.owner_user_id = ensure_profile().id`、`event.status = finished`、路径前缀为 `<auth_user_id>/<event_id>/`。因此**Auth UUID 与稳定 Profile ID 是两套独立校验，不可任意互换**。
- 实时 `avatars` 桶 `public=true`，头像 `INSERT/SELECT/DELETE` RLS 仍按路径第一段 `auth.uid()`。跨 Auth alias 后，旧头像可能仍可通过公开 URL 展示，但新 Auth 不一定有权删除旧 Auth 前缀对象；不应通过放宽 RLS 来补救。
- 实时 `event-photos` 桶 `public=false`，`SELECT` 通过 `can_view_event_photo()` 检查赛事 owner/真实参赛者。前端 `ProtectedEventPhoto.tsx` 为赛事预览生成 300 秒 signed URL、原图 60 秒 signed URL；`photo-management` 对个人/好友相册也按 RPC 权限签发短期 URL。
- `supabase/functions/photo-management/index.ts` 的 `import_personal` 从私有 Storage 下载原图和水印，再向独立路径各复制一份，并以 `finalize_personal_album_import` 关联个人相册。**每一次成功导入当前设计增加两份 Storage 对象**，而非单纯增加引用关系。独立生命周期是产品隐私语义：源照片删除不必连带删除已经合法导入的个人副本；不得仅为节约存储未经产品/隐私评审改成引用同一原文件。
- 当前 `src/components/TournamentPanels.tsx` 使用浏览器 `File`、`Blob`、水印 `watermarkPhoto()`，分别上传 `-original.jpg` 与 `-watermark.jpg`；小程序不可直接复制这些 DOM/Blob 实现。

**安全含义**：只复用 Profile 的外键不够；G/老郑等历史用户绑定后，必须同时验证旧头像可见、新头像可上传、赛事照片可读/可新传、旧 Auth 路径删除授权、个人相册继续可见。管理员仍独立基于 JWT `auth.uid()` 授权，绝不通过照片路径或 Profile alias 推导 Admin。

## 2. 跨端网络与 SDK 适配契约（设计，不执行）

### 2.1 现有 H5 的真实依赖

- `src/repositories/supabase.ts` 顶层使用 `import.meta.env`、`createClient(...,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})`；默认浏览器 `fetch`/Storage/可能的 WebSocket 行为，不是小程序运行时可直接执行的证明。
- 同文件 `rpc` 使用 Supabase PostgREST；`command()` 先取 Session、绑定 `operation_id` 与 Auth ID，再用 `functions.invoke('tournament-command', Authorization: Bearer JWT)`；小程序必须保持**相同服务端 actor 验证与操作幂等**。
- `src/hooks/useQuery.ts` 使用 `window.focus`、`document.visibilitychange`、定时轮询；小程序须以 `onShow/onHide`/网络恢复驱动，不能直接引入 DOM。
- `src/domain/IdentitySession.ts` 的清理逻辑基于 Storage-like 接口，但类型取自 DOM `Storage`；小程序实现应抽象 `AsyncStoragePort` 并显式 account scope，不能把测试 guest credentials 复制为正式微信凭据。
- `src/domain/AuthAccountGeneration.ts` 以 Auth user ID 变更使 generation 增加；新跨端场景需验证**同一 Auth ID 下会话重建、Profile 绑定变更、异步请求/照片缓存**是否还需额外 `session_epoch`/`profile_scope`，不能凭代码存在就宣称所有串号已解决。

### 2.2 建议最小接口（文档伪代码；不应直接拷贝为生产代码）

```ts
interface SessionPort {
  getVerifiedActor(): Promise<{
    authUserId: string;
    profileId: string;
    sessionEpoch: string;
  } | null>;
  refresh(): Promise<void>;
  signOutAndClearActorScope(): Promise<void>;
}
interface TransportPort {
  rpc<T>(
    name: string,
    args: Record<string, unknown>,
    actorEpoch: string,
  ): Promise<T>;
  edge<T>(
    functionName: string,
    payload: unknown,
    actorEpoch: string,
  ): Promise<T>;
  cancelActorRequests(actorEpoch: string): void;
}
interface MediaPort {
  chooseImages(): Promise<
    Array<{ localPath: string; mime: string; bytes: number }>
  >;
  watermark(inputPath: string, eventSnapshot: unknown): Promise<string>;
  saveToAlbum(authorizedTempPath: string): Promise<void>;
}
interface StoragePort {
  uploadEventPair(
    eventId: string,
    originalPath: string,
    markedPath: string,
    actorEpoch: string,
  ): Promise<{ originalKey: string; markedKey: string }>;
  signedEventPreview(
    photoId: string,
  ): Promise<{ url: string; expiresAt: number }>;
}
```

**安全约束**：`getVerifiedActor` 需基于服务端可信 JWT/`getUser`/业务 resolver，而不是本地 `getSession().user` 直接作为授权结论；`actorEpoch` 只做客户端响应隔离，服务端仍从 JWT 独立授权。`TransportPort` 必须保证 POST 不自动重放非幂等操作；对记分仅可按原 `operation_id` 和服务端版本协议安全重试。任何客户端 adapter 不得持有 service-role、微信 AppSecret、`session_key`、可代签 JWT 的私钥。

### 2.3 Supabase/Taro 兼容路线的低 TCO 排序与证据边界

| 路线                                                                                          | 优点                                                           | 主要未知/安全门槛                                                                                                           | 当前排序                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| A. 保留 Supabase JS v2，提供审计后的 `global.fetch` + `auth.storage` + 生命周期适配           | 最少重复 RPC/Auth 逻辑；官方 SDK 支持注入 custom fetch/storage | `Request`/`Response`/Headers、AbortSignal、`FormData`、refresh lock、WS、Storage 上传/下载在微信真机不保证；须实际编译+真机 | **优先零元 PoC**，未证实可用 |
| B. 小程序原生 `Taro.request`/`FileSystemManager` 的最小 REST adapter，保留共享 DTO 与后端 RPC | 不依赖浏览器 polyfill；控制调用面与包体                        | 需正确实现 Supabase Auth 刷新/错误、RPC、Edge JWT、Storage；不应自己实现签发 token 或绕过 RLS                               | A 关键能力失败时的兜底       |
| C. 自建全量 BFF/Edge 代理全部 RPC 和照片二进制                                                | 网络统一入口                                                   | 额外运维/Edge 流量、上传带宽和服务端权限面扩大；若用 service_role 代理必须逐接口证明 actor 与最小授权                       | **不推荐**作为省钱默认       |

**媒体上传关键差异**：Taro 4 `uploadFile` 默认走 `multipart/form-data`，需要指定 `filePath` 和表单 `name`；Supabase Storage standard upload 支持文件/ArrayBuffer 和 multipart，但 `storage-js` 的具体表单字段、header、`x-upsert`、签名/认证、MIME 及微信平台 `uploadFile` 对空字段名的支持需按**项目所用 SDK 版本**核对。不能仅凭两者都叫 multipart 就宣称兼容，也不能反过来断言必然不兼容。建议 PoC 比较：A1 `Taro.request` + ArrayBuffer raw upload；A2 `Taro.uploadFile` multipart；A3 经官方 Storage JS adapter；三者均用**隔离测试对象**且需用户未来批准测试写入，当前只定义契约。

**图片下载/保存**：`createSignedUrl` 结果是短时 bearer URL，不应写入长期缓存、日志、分享参数或持久化用户档案；小程序 `downloadFile`、保存相册权限、用户拒绝、URL 过期和 CDN 缓存行为均需真机验证。Supabase 官方提醒签名 URL 的缓存响应与 token 到期可能不完全同步；对高敏照片不能把 60/300 秒视为立即强制撤销。现阶段保留服务端原有授权，不新增公开桶或不受控 CDN。

## 3. 零新增费用的可执行验证包（本轮不运行产品代码）

### Gate MP-NET-0：本地 mock / 纯 TS（0 新增外部订阅，需 Chat 另行授权创建 PoC 代码）

1. 对相同 RPC/Edge fixture，用 H5 与 mini `TransportPort` mock 验证 JSON、错误码、401/403/409、超时、abort/取消、幂等请求身份。
2. 切换 A→B→A，验证旧账号的 profile、相册 signed URL、待发记分请求、网络回调不会展示在 B；`auth_user_id` 不变但 `sessionEpoch` 变化的场景需独立覆盖。
3. `MediaPort` mock 验证选择图片、尺寸/MIME、拒绝相册授权、失败清理、原图/水印双路径；错误时不能错误 `finalize_upload`。
4. 断网后同 `operation_id` 只安全重试一次业务命令，服务端版本冲突返回 409 时进入刷新/人工确认，禁止后台无限重放。
5. 测试 `GET /identity/me` 和 Session bridge 未验证时不可调用任何需要真实登录的业务写接口；不得把 mock 登录当正式微信登录成功。

### Gate MP-NET-1：需未来明确批准的现有 TEST 环境验证（非本轮执行）

1. 使用隔离账号/隔离赛事，先真实验证 session bridge Gate 1；只有拿到**Supabase 原生可刷新会话且 RLS 通过**，才测试小程序 RPC/Edge/Storage。
2. 运行 Taro 4 编译；分别验证 `global.fetch` 自定义适配与最小 REST adapter：RPC、Edge、Session refresh、退出、后台/前台恢复、弱网、并发刷新、WS/轮询 fallback。
3. 媒体：分别用 Taro raw/multipart/SDK adapter 上传一组无隐私的原图+水印（小于当前 `event-photos` 10 MiB 单文件限制），检查 MIME、JWT、`can_upload_photo`、`finalize_upload`、失败回滚和两张图的独立性。
4. 历史 Auth alias 正反例：合法新 Auth+旧 Profile owner 上传成功；非 owner 上传拒绝；旧头像展示与删除权限按现有策略验证；所有对象引用对账无孤儿。
5. 不使用微信开发工具“关闭合法域名校验”作为发布验收。微信小程序 request/upload/download/socket 域名、TLS、网络可达性及主体资质仍需官方后台确认。

### Gate MP-NET-2：需未来另行批准真实微信 AppID/合法域名/真机

- iOS/Android 微信真机，弱网、拒绝授权、微信前后台切换、真实文件 1/5/10 MiB 边界、图片上传/水印/保存/分享、受保护照片 60/300 秒 signed URL 到期、账号切换和重复提交。
- 地图仅检查小程序 `MapPort` 独立接口与现有 H5 P3 输出的**领域 DTO**兼容；不得修改 H5 地图搜索修复或借小程序研究判定 P3 VERIFIED。

### 建议验收矩阵（最小 12 条）

| ID       | 场景                                     | PASS                                            | FAIL 必须阻断 |
| -------- | ---------------------------------------- | ----------------------------------------------- | ------------- |
| NET-01   | Supabase `fetch`/Storage/WS 在小程序构建 | 无 DOM import/未实现 API；正常鉴权              | 真实业务登录  |
| NET-02   | 刷新/退出/跨端切换                       | JWT subject、Profile、epoch 一致且不串号        | 所有写入      |
| NET-03   | Edge 记分重复/弱网                       | 原 `operation_id` 幂等，冲突不吞错              | 参赛记分上线  |
| NET-04   | 后台恢复                                 | 正确刷新 session 与赛事快照，避免重复操作       | 实时记分      |
| MEDIA-01 | 10 MiB/3 MiB 及 MIME                     | 服务器按桶规则拒绝超限/错类型                   | 媒体上线      |
| MEDIA-02 | 上传双文件/最终确认                      | 原图与水印都成功才 finalize；失败清理           | 照片上传      |
| MEDIA-03 | alias owner 与非 owner                   | 前者仅有权操作本人赛事；后者 403                | 微信迁移      |
| MEDIA-04 | 旧头像/旧 Auth 前缀                      | 可读性、删除授权符合现有策略，无越权            | 历史用户迁移  |
| MEDIA-05 | 私有 signed URL                          | 不落日志/分享；过期/撤销边界说明真实            | 私有相册      |
| MEDIA-06 | 个人导入与源删除                         | 独立副本按现有隐私生命周期保留                  | 相册改造      |
| MEDIA-07 | Storage 对账                             | 所有元数据引用有对象，未授权访问失败            | 发布          |
| COST-01  | 真实使用量监控                           | 按组织账单/桶容量计算预警，不把 Free 配额当无限 | 商业运营      |

## 4. 最低 TCO：已知官方价格、真实增长公式与支出闸门

### 4.1 真实成本起点

- 实际组织为 Supabase Free。官方 2026-10-21 页面：Free **Storage 1 GB**、数据库 500 MB、Auth 50k MAU、Edge 500k calls、**5 GB uncached + 5 GB cached egress**；Pro 起价 $25/月，Storage 100 GB 内含，超过约 $0.0213/GB/月；uncached egress 超额 $0.09/GB、cached $0.03/GB（具体适用和组织账单再核）。Free 超额不是无限免费。
- `qiudazi-test` 当前两桶合计约 **7.90 MiB**，仅为该项目这两桶的当前物理文件量；其他 Supabase 项目、账单周期平均用量、日志/数据库/图片传输均未包含。**不能从 7.90 MiB 推断“剩余 1GB”。**
- 媒体成本公式：单张来源照片大小 `O+W`（原图+水印）；被 `n` 个用户合法导入个人相册后，按现行独立副本实现，该照片相关 Storage 大约 `(1+n)×(O+W)`（忽略元数据/版本），**每次导入复制两份文件**。若扩展到小程序大量赛事相册，存储/egress 可能先于 Auth MAU 成为瓶颈。
- 成本降低顺序：先不新增小程序独立媒体后端 → 保留现有隐私规则与压缩/图片尺寸策略 → 用真实 Storage usage 与流量指标做 60%/80%/90% **内部预警阈值（建议值，不是官方阈值）** → 再评估经用户确认的存储优化；**不能为节约存储擅自合并个人相册与赛事源文件生命周期**。

### 4.2 方案逐项成本/替代

| 方案                                     | 必需新增订阅/付费                                             | 可选费用与触发                                                | 维护负担             | 零新增费用替代                                      |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| Taro React + Supabase SDK custom adapter | 框架许可证无必需采购；复用现有项目，但真实微信主体/域名仍待核 | SDK polyfill/调试工时；配额超限；微信资质/域名/备案待官方核验 | 中，依赖真机兼容性   | 离线 TS mock + 微信开发工具模拟（不能证明合法上线） |
| Taro 原生 REST adapter                   | 无必需新 SaaS，但不能免除合规资质                             | 自己维护 Auth refresh/HTTP/Storage 兼容测试                   | 中高                 | 先做仅只读赛事 REST 契约，不接入真用户              |
| 新 BFF/全媒体代理                        | 可能复用 Edge 但会增加调用、二进制流量/处理时间               | Free 配额与限流，未来超额和维护成本                           | 高；权限面扩大       | 不新增代理，优先验证直连 Supabase 受控 JWT/RLS      |
| 个人相册“仅引用不复制”                   | 看似节省 Storage                                              | 隐私/删除语义和授权体系重设计，不能默认可行                   | 高且可能破坏用户预期 | **维持独立副本**，先量化容量并压缩                  |
| 商业图片处理/短信/地图 API               | 非小程序媒体 P0 必需                                          | 供应商定价/额度 **待官方核验**                                | 增加锁定与账单       | 本地水印/既有存储/手动地图 fallback                 |

**付款闸门**：小程序认证/备案/域名、微信 API 价格、PC 扫码资质、付费图像/地图/短信、升级 Supabase/Vercel 套餐均未获用户本轮授权，绝不创建/购买/部署。微信官方主体与合法域名要求仍须后台原文核实，不能凭二手信息填 0 元。

## 5. 给主 Chat 的文档级 PATCH_PACKAGE（不含可直接执行 SQL）

- `miniprogram-implementation-prd.md`：纳入第 2 节 Port 契约、A/B/C adapter 排序、Gate MP-NET-0/1/2、12 项正反例；把 session bridge 和微信域名合规列为真机/上线硬 blocker。
- `mini-program-feasibility.md`：增加现有 React/TS/Supabase 浏览器依赖的迁移风险、Taro 4 `request`/`uploadFile`/文件系统与 Supabase 标准 upload 之间的未验证协议点；保留 Taro 优先、原生兜底。
- `cross-platform-product-scope.md`：小程序 P1 先读赛事/记分，私有照片查看可作为受控 P1/P2 边界，上传/水印/导入放在独立媒体 Gate；H5 继续承担 Platform Admin，不在小程序重建。
- `identity-architecture.md`：追加“Auth UID 路径 vs Profile ID 业务 owner”的 Storage ACL、旧头像清理风险、sessionEpoch/actor cache 约束，G/老郑仅匿名 fixture 测试。
- `official-sources.md`：补充下节官方资料及核验日期，价格的 Free/Pro 适用范围，微信资质/备案/合法域名为待官方核验。
- `handoff.md`：只登记本轮净新增，不覆盖前 3 份未消费 handoff；同一主 Chat 批量融合后按证据归档。

**消费/验证计划**：主 Chat 先重读实时 PR HEAD、现有 docs/代码与 4 份 handoff，按身份/产品/网络媒体/成本去重；仅在用户授权后批量写设计文档，另行授权才能开发或写测试库；CI/文档 diff 通过后按实际消费结果移至 `consumed`。本轮不自行归档，也不触碰 P3 地图专项。

**阻断/决策点**：`SESSION_BRIDGE_UNPROVEN`（前轮仍未实测）、`MINI_FETCH_STORAGE_RUNTIME_UNPROVEN`、`MEDIA_UPLOAD_WIRE_COMPAT_UNPROVEN`、`WECHAT_REAL_DOMAIN_AND_QUALIFICATION_UNVERIFIED`、`RLS_ALIAS_COMPATIBILITY_GATE`；`G_ADMIN_PERMISSION_ROOT_CAUSE_UNPROVEN` 是**独立故障**，不得推断为微信登录问题。主 Chat 未来需决策是否授权 Gate 0 mock 编码、Gate 1 隔离 TEST 写入与真实微信资质；本轮无需用户即时回复。

## 6. 官方来源与复核状态（2026-10-21）

1. Supabase JS v2 初始化、自定义 `global.fetch`、自定义 Auth storage（官方）：https://supabase.com/docs/reference/javascript/initializing
2. Supabase Auth 浏览器以外持久化需提供 storage（官方）：https://supabase.com/docs/reference/javascript/auth
3. Supabase Storage RLS 与 `auth.uid()` 路径示例（官方）：https://supabase.com/docs/guides/storage/security/access-control
4. Supabase 私有桶与 signed URL（官方）：https://supabase.com/docs/guides/storage/buckets/fundamentals
5. Supabase Storage standard upload（multipart/文件/ArrayBuffer；官方）：https://supabase.com/docs/guides/storage/uploads/standard-uploads
6. Supabase JS `upload` 参数（官方）：https://supabase.com/docs/reference/javascript/file-buckets-upload
7. Supabase signed URL/CDN 缓存与撤销注意（官方）：https://supabase.com/docs/guides/storage/cdn/smart-cdn
8. Supabase Storage/egress 账单与配额（官方）：https://supabase.com/docs/guides/platform/manage-your-usage/storage-size ; https://supabase.com/docs/guides/platform/manage-your-usage/egress ; https://supabase.com/pricing
9. Taro 4 `request`（官方）：https://docs.taro.zone/docs/apis/network/request/
10. Taro 4 `uploadFile`（官方）：https://docs.taro.zone/docs/apis/network/upload/uploadFile
11. Taro `FileSystemManager`/图片选择/Canvas（官方）：https://docs.taro.zone/docs/apis/files/FileSystemManager ; https://docs.taro.zone/docs/apis/media/image/chooseImage ; https://docs.taro.zone/docs/apis/canvas/canvasToTempFilePath
12. GitHub 本轮 exact HEAD 证据：`src/repositories/supabase.ts`、`src/hooks/useQuery.ts`、`src/domain/IdentitySession.ts`、`src/domain/AuthAccountGeneration.ts`、`src/components/TournamentPanels.tsx`、`src/components/ProtectedEventPhoto.tsx`、`supabase/functions/photo-management/index.ts`、`supabase/migrations/20260829143639_storage_reproducibility.sql`、`supabase/migrations/20260829165835_event_photo_privacy.sql`、`supabase/migrations/20260830020252_participant_album_independent_assets.sql`：https://github.com/rmit-s3674091-Yating-Li/-qiudazi-h5/tree/39e17febc23d5732c867bb2244a02fd2d99e36a8
13. 微信官方开发者后台认证、备案、合法域名、资费**本轮未成功从官方原文取得适用项目价格，均为待官方核验**；不能写为已证实免费。

**结束状态**：本轮研究与测试库查询均只读；`STATUS=DESIGN_EVIDENCE_CONSUMED`。无微信正式登录上线、无小程序编译或真机成功证据。只有 Library 上传成功且再次列表核实后，才能声明 `HANDOFF_STORED=true`。
