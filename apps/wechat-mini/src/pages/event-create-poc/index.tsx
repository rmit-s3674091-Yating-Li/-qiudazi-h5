import { useRef, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import {
  OfflineEventCreateVenueFlow,
  type EventVenueFlowDecision,
} from "../../core/event-create-venue-flow.ts";
import { POC_CITIES } from "../../core/venue-selection-poc.ts";

/** Two-stage same-page offline demonstration, NOT a real event creation route. */
export default function EventCreatePoc() {
  const flowRef = useRef<OfflineEventCreateVenueFlow | null>(null);
  if (!flowRef.current) flowRef.current = new OfflineEventCreateVenueFlow();
  const flow = flowRef.current;
  const [view, setView] = useState(() => flow.snapshot());
  const [query, setQuery] = useState("模拟");
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [message, setMessage] = useState("");
  const update = () => setView(flow.snapshot());
  const report = (decision: EventVenueFlowDecision) => {
    setMessage(
      decision.status === "blocked"
        ? `已拒绝：${decision.reason}`
        : decision.status,
    );
    update();
  };
  const search = async () => {
    const pending = flow.search(query);
    update();
    await pending;
    if (flowRef.current === flow) update();
  };

  return (
    <View className="poc">
      <View className="card">
        <View className="title">创建赛事 · 离线回填演示</View>
        <Text>
          OFFLINE_MOCK_ONLY。这里仅模拟父表单与场馆选择两个阶段，
          不调用微信登录、地图、网络或 Supabase，不会创建赛事。
        </Text>
        <Text>当前阶段：{view.step}</Text>
        {message && <View className="note">{message}</View>}
      </View>
      {view.step === "FORM" ? (
        <View className="card">
          <Text>先明确选择赛事城市（不默认北京）</Text>
          <View>
            <Button
              size="mini"
              onClick={() => {
                flow.changeCity(null);
                update();
              }}
            >
              未选城市
            </Button>
            {POC_CITIES.map((city) => (
              <Button
                key={city}
                size="mini"
                onClick={() => {
                  flow.changeCity(city);
                  update();
                }}
              >
                {view.city === city ? `已选 ${city}` : city}
              </Button>
            ))}
          </View>
          <Input
            value={view.title}
            onInput={(event) => {
              flow.editTitle(event.detail.value);
              update();
            }}
            placeholder="模拟赛事名称（不会保存）"
          />
          <Button onClick={() => report(flow.openPicker(Date.now()))}>
            选择比赛场馆
          </Button>
          {view.venue && (
            <View className="note">
              <Text>
                已回填离线草稿：{view.venue.city} / {view.venue.venueName}
              </Text>
              <Text>地址：{view.venue.venueAddress}</Text>
              <Text>具体场地：{view.venue.specificCourt ?? "未填写"}</Text>
              <Text>DRAFT_ONLY · 禁止持久化</Text>
            </View>
          )}
          <Text>
            没有“创建赛事”操作；真实回填、页面跳转和保存均待独立验收。
          </Text>
        </View>
      ) : (
        <View className="card">
          <Text>场馆选择 · {view.city}（模拟候选，不是真实 POI）</Text>
          <Input
            value={query}
            onInput={(event) => setQuery(event.detail.value)}
            placeholder="输入模拟"
          />
          <Button
            onClick={() => {
              void search();
            }}
          >
            搜索模拟场馆
          </Button>
          <Text>检索状态：{view.picker?.status ?? "IDLE"}</Text>
          {view.picker?.candidates.map((item) => (
            <View key={item.id}>
              <Text>
                {item.name} / {item.address}
              </Text>
              <Button
                size="mini"
                onClick={() => {
                  flow.chooseCandidate(item.id);
                  update();
                }}
              >
                选择此候选
              </Button>
            </View>
          ))}
          <Text>手填场馆（无搜索结果或服务失败时也可使用）</Text>
          <Input
            value={manualName}
            onInput={(event) => setManualName(event.detail.value)}
            placeholder="场馆名称"
          />
          <Input
            value={manualAddress}
            onInput={(event) => setManualAddress(event.detail.value)}
            placeholder="场馆地址"
          />
          <Button
            onClick={() => {
              const ok = flow.useManual(manualName, manualAddress);
              setMessage(ok ? "已选手填场馆" : "手填内容无效");
              update();
            }}
          >
            使用手填内容
          </Button>
          <Input
            value={view.court}
            onInput={(event) => {
              flow.editCourt(event.detail.value);
              update();
            }}
            placeholder="具体场地（可选，例如3号场）"
          />
          <Text>已选：{view.picker?.selected?.name ?? "尚未选择"}</Text>
          <Button onClick={() => report(flow.confirmPicker(Date.now()))}>
            确认并模拟回填父表单
          </Button>
          <Button
            onClick={() => {
              flow.cancelPicker();
              setMessage("已取消，旧回填票据失效");
              update();
            }}
          >
            取消选择
          </Button>
        </View>
      )}
    </View>
  );
}
