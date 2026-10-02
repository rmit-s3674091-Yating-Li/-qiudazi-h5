# V8 Discovery

V8 discovery 的权威研究真源已迁移到内部 Supabase research store：

- project: `qiudazi-test`
- schema/table: `research_ops.v8_notes`
- recurring automation 只读产品基线，并将实质研究结论写入该表
- `main` / Production 仍是已发布 V7 基线，不承载 V8 discovery

本目录仅保留阶段性、专题型可读研究快照。专题文件不是实时真源，不要求每小时同步；V8 framing / 立项时再从 research store 汇总成正式 scope / PRD / Workboard。

已退役并完成数据库归档的旧结构包括：
- `NEXT_VERSION_RESEARCH.md`
- `PRODUCT_EXPERIENCE_RESEARCH.md`
- `docs/discovery/runs/**`

迁移前的 28 个研究文件均已以完整 Markdown + 原路径 + blob SHA 归档到 `research_ops.v8_notes`，状态为 `MIGRATED_ARCHIVE`。
