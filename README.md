# 球搭子 H5

真实可部署、多人共享赛事数据的移动端 H5 MVP。

## Frontend source

当前前端以仓库中的可读源码为准，主要位于 `src/`。开发与构建直接使用可读源码；旧的 bundle restore/pack 机制仅作为历史兼容/回滚手段，不应再作为日常前端开发方式。

## UI / UX implementation rule

**新增页面、重构页面或让 AI / Codex 生成前端 UI 前，必须先阅读：**

`docs/VISUAL_DESIGN_BASELINE.md`

它是球搭子的长期视觉设计基线。实现时还应检查现有 `src/styles.css` 和相近页面，优先复用已经验证的颜色、间距、卡片、按钮、Bottom Sheet 与移动端交互模式。

优先级：

1. 产品业务规则与真实数据模型
2. `docs/VISUAL_DESIGN_BASELINE.md`
3. 当前已验证的页面 / 共享组件 / `src/styles.css`
4. 早期视觉 Demo

不要为了视觉效果展示数据库不存在的数据，也不要把产品做成企业后台、电竞比分系统或模板化 AI App。

## Build

```bash
npm install
npm run build
```

Vercel 与 CloudBase 构建应使用仓库中的当前可读源码。
