# V8 Discovery｜地图/场馆：从“每次找地点”转向“复用可信地点”

> 日期：2026-10-02
> 状态：DECISION_CANDIDATE
> 证据状态：OBSERVED（公开官方资料）+ HYPOTHESIS（球搭子适用性待验证）
> 边界：研究记录，不是产品 canonical、开发任务或实现授权。

## 球搭子原始问题

V7 已解决地图选点基础可用性，但下一版本更值得研究的问题不是继续强化地图搜索本身，而是：对重复打球的人，为什么还要每场重新搜索、定位、拖针、确认同一个球馆？球类活动的场馆往往高度重复，且“球馆名称”和“真正集合点/入口/球场号”并不总是同一个地点概念。

## Observed friction

地图选点如果以“搜索 → 地图移动 → 确认坐标”为核心，每次赛事创建都会重复一项低价值工作。更大的摩擦发生在搜索成功之后：一个 POI 名称未必足以让参赛者顺利到场；大型体育中心可能有多个入口、停车点、网球场分区或室内馆。若组织者为了准确而输入自由文本，参与者又难以直接导航；若只保存坐标，则人类可读性差。

## Reference products / cross-industry evidence

1. Uber：请求行程时优先提供近期目的地和 Saved Places 快捷入口；默认 pickup 来自当前 GPS，但用户仍需确认/调整实际上车点。值得借的是“常用地点优先 + 最终集合点确认”双层模型，而不是打车业务本身。
2. Apple Maps：高频地点可 Pin 到 Places；普通地点可保存并添加个人 note；Dropped Pin 也可以重命名并用于路线/分享。值得借的是 POI 与用户自己的可复用语义可以共存，而不是让坐标承担名称职责。
3. Google Maps：You/Places 聚合 saved 与 recently saved/visited 地点。值得借的是“最近/常用”比每次从零搜索更适合重复行为。
4. Airbnb：Trip 内可搜索附近 POI、把地点保存到该次行程的 map/itinerary，并显示相对住宿地点的时间距离。值得借的是地点不仅是全局 POI，也可以进入某个具体活动上下文。
5. Airbnb 的 location privacy 是重要旁证：公开搜索可展示 approximate location，确认关系后才暴露精确地址。对未来公开赛事大厅而言，“发现地点”和“到场地点”未必必须具有同一精度。

## Function pattern

建议验证：

**Search once → Confirm human-readable venue → Optional meeting-point detail → Reuse from Recent/Frequent → Navigate at event time**

把地点拆成至少两个用户心智层，而不是一个坐标字段：

- Venue：奥森网球中心这类稳定、可识别、可复用的场馆对象/显示名称；
- Meeting detail：本次活动的具体入口、场地号、集合说明，必要时才出现。

下一次创建赛事时优先让组织者从“最近使用 / 常用场馆”选择，而不是默认重新进入地图搜索。地图继续承担纠错和精确定位，不承担所有创建入口。

## UI/UX pattern

创建赛事的地点字段可优先呈现 2–4 个近期场馆 chips/list rows，附简短区域信息；`选择其他地点` 再进入搜索/地图。选中场馆后先回填人类可读名称，地图坐标作为底层事实，不应成为主要展示文本。

场馆确认页适合 bottom sheet：顶部是场馆名/地址，地图用于视觉确认，下方可渐进展开 `集合点/场地号（可选）`。不要一开始要求用户同时处理城市、地点名称、经纬度和备注。

参赛者详情页则应把 `导航` 作为到场阶段的明确动作；若存在 meeting detail，应在导航 CTA 附近显示，而不是藏在赛事描述中。

对于公开赛事，可进一步验证“大厅卡片只显示区域/场馆名，报名或确认参与后显示更精确集合信息”是否能在发现效率和隐私之间取得平衡，但这不是默认实现结论。

## Why it matters

这不是地图功能优化，而是减少高频组织者的重复劳动。若用户每周在少数固定球馆活动，地点选择可以从几十秒的搜索任务退化为一次点击，同时减少错误 POI、坐标与文字名称不一致、参赛者找错入口等问题。它也与 Club/固定小组研究相连：长期关系容器若成立，“默认/常用场馆”可能自然属于群体习惯，而不是每个赛事重新输入。

## Hypothesis

**高价值 / 外部证据高 / 球搭子自身证据中 / 复杂度低到中（若先只做 recent reuse 概念验证）。**

对重复组织者，“最近/常用场馆 + 可选集合细节”比继续增强地图自由搜索更能降低创建成本和到场歧义。

## Counterexample / Risk

- 不应把“最近地点”误做成自动默认：组织者可能跨城或临时换场，错误默认比重新搜索更危险。
- 不应急着建设完整 Venue 数据库、点评、营业时间、价格、订场系统；这些会把产品推向本地生活平台。
- 不应把个人最近场馆自动共享给 Club；地点历史可能包含隐私信息。
- Uber 的 pickup pin 很适合即时、单次会合，但球赛是预定活动；照搬实时蓝点/持续定位会明显过度。
- Airbnb 的 approximate-location 模式只适合确有公开发现/隐私冲突的场景；熟人私局没必要故意模糊地点。

## Applicability

直接可借：最近/常用地点优先、人类可读名称优先、精确位置作为确认层、集合说明渐进披露。

只能借原则：公开发现阶段的 approximate location、实时 pickup-style location confirmation。

## Smallest validation

不开发。找 5 位过去一个月组织过至少 2 次球局的人，用他们真实最近 3 场活动做回放：记录场馆是否重复、他们现在如何告诉别人“具体去哪儿”、是否发生过找错门/球场的问题。

随后给三个低保真创建页：
A. 每次搜索地图；
B. 最近 3 个场馆 + 选择其他地点；
C. 最近场馆 + `集合点/场地号` 可选字段。

任务设为“把上周同一个场馆再约一次”和“这周临时换一个新场馆”，比较首次点击、完成时间、是否误选旧场馆，以及参与者能否仅凭最终地点卡准确描述自己该去哪里。

## What not to do yet

暂不做完整场馆数据库、评分点评、场馆认领、订场支付、实时位置共享、自动地理围栏签到、复杂地图筛选或 Club 默认场馆 schema。先证明“地点复用”本身是否显著降低组织成本。

## 未决问题

1. Recent Venue 应来自个人创建历史、参加历史，还是两者分开？
2. 场馆名、地址、地图 POI 与用户自定义显示名冲突时谁是展示真源？
3. `集合点/场地号` 应属于 Event 还是 Venue 的个人/Club note？
4. 公开赛事是否需要报名后才显示精确集合信息，取决于未来大厅的隐私模型。
5. 若 Club 成立，是否真的存在稳定“主场”，必须用组织者访谈证明，不能预设。

## Sources

- Uber Help — How to request a ride：recent destinations / Saved Places / pickup confirmation。
- Apple Support — Places, pinned places, notes and dropped pins in Maps。
- Google Maps Help — You tab / saved and recently visited places。
- Airbnb Help — places of interest in Trips、map/itinerary save，以及 precise vs approximate listing location。
