# V8 Discovery

V8 discovery 的权威研究真源是内部 Supabase research store：

- project: `qiudazi-test`
- project id: `rtmjzmgrhifjzxaliltm`
- schema/table: `research_ops.v8_notes`
- `main` / Production 仍是已发布 V7 基线，不承载 V8 discovery

## 当前研究结构

数据库中保留两层研究事实：

1. 原始研究记录：包括 historical `MIGRATED_ARCHIVE` 与后续 V8 research notes，用于追溯来源、证据与完整正文。
2. 阶段性整合：当前整合版本为 fingerprint `synthesis-v8-discovery-20261003-v1`，标题 `V8 Discovery Integrated Synthesis v1`，用于后续 V8 framing / scope / PRD / Workboard 讨论。

GitHub `docs/discovery/` 不再保存重复专题研究快照；旧总账、旧 runs 目录和专题 research docs 均已在数据库确认归档/整合后退役删除。

注意：scheduled automation 当前只负责研究并输出完整 `V8_RESEARCH_NOTE`，不承担可靠写入；正常对话环境负责把需要保留的研究写入 `research_ops.v8_notes`。未经用户明确确认，`DECISION_CANDIDATE` 不等于开发任务或版本授权。
