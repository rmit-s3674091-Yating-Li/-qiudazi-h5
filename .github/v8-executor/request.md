参赛者记分（已确认 V8 scope）。

目标：允许参赛者对自己实际参与的对局提交/记录比分，同时保留 Organizer 对异常结果的纠正能力；高风险最终结果修改必须有明确权限边界。必须兼容现有比分流程、operation/version/idempotency 语义，并处理并发或重复提交冲突。

本轮先完成一个最小、可独立验证的 participant-scoring vertical slice。优先复用已有 scoring command / repository / RPC 语义，不复制第二套业务逻辑。若需要数据库改动，只新增正式 migration + tests，不 apply live Supabase。

验收至少覆盖：
- 非参赛者不能给该对局记分；
- 参赛者只能操作自己参与的对局；
- Organizer 既有纠正能力不回归；
- 重复/并发提交不会静默覆盖更新；
- 既有记分流程和当前 V7 已验证行为保持兼容；
- targeted tests + changed-file format check + unit + integration + build 全部通过后才能提交。

不得 merge main、不得 Production deploy、不得移动 release-candidate、不得开发任何研究候选功能。

EXECUTOR_RETRY=2