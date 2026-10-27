import { useRef, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import { OfflineVenuePort } from "../../core/ports.ts";
import {
  OfflineFixtureVenuePort,
  POC_CITIES,
  VenueSelectionPoc,
  type PocCity,
} from "../../core/venue-selection-poc.ts";

/** Standalone offline screen. Open pages/venue-poc/index in the dev tools. */
export default function VenuePoc() {
  const controller = useRef<VenueSelectionPoc | null>(null);
  if (controller.current === null)
    controller.current = new VenueSelectionPoc(new OfflineFixtureVenuePort());
  const poc = controller.current;
  const [view, setView] = useState(() => poc.snapshot());
  const [query, setQuery] = useState("模拟");
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  const [manualError, setManualError] = useState(false);

  const selectCity = (city: PocCity) => {
    poc.setCity(city);
    setView(poc.snapshot());
    setManualError(false);
    setManualName("");
    setManualAddress("");
  };
  const search = async () => {
    const pending = poc.search(query);
    setView(poc.snapshot());
    await pending;
    if (controller.current === poc) setView(poc.snapshot());
  };
  const choose = (id: string) => {
    poc.chooseCandidate(id);
    setView(poc.snapshot());
  };
  const useManual = () => {
    const ok = poc.useManual(manualName, manualAddress);
    setManualError(!ok);
    setView(poc.snapshot());
  };
  const confirm = () => {
    poc.confirm();
    setView(poc.snapshot());
  };
  const toggleService = () => {
    const next = !offlineMode;
    setOfflineMode(next);
    // Replacing the controller also invalidates every previous in-flight result.
    controller.current = new VenueSelectionPoc(
      next ? new OfflineVenuePort() : new OfflineFixtureVenuePort(),
      view.city,
    );
    setView(controller.current.snapshot());
  };

  return (
    <View className="poc">
      <View className="card">
        <View className="title">场馆选择 · 离线演示</View>
        <View className="note">
          全部场馆、地址与地图中心均为模拟；不调用微信定位、百度、Supabase
          或任何真实 POI。
        </View>
        <View>
          {POC_CITIES.map((city) => (
            <Button key={city} size="mini" onClick={() => selectCity(city)}>
              {view.city === city ? `已选 ${city}` : city}
            </Button>
          ))}
        </View>
        <Input
          value={query}
          onInput={(event) => setQuery(event.detail.value)}
          placeholder="输入“模拟”查看虚构候选"
        />
        <Button
          onClick={() => {
            void search();
          }}
        >
          搜索模拟场馆
        </Button>
        <Button size="mini" onClick={toggleService}>
          {offlineMode ? "恢复模拟数据" : "模拟服务不可用"}
        </Button>
        <Text>
          检索状态：{view.status}
          {view.reason ? ` / ${view.reason}` : ""}
        </Text>
        {view.status === "RESULTS" &&
          view.candidates.map((item) => (
            <View key={item.id} className="card">
              <Text>
                {item.name} — {item.address}
              </Text>
              <Button size="mini" onClick={() => choose(item.id)}>
                选择此候选
              </Button>
            </View>
          ))}
        <View className="note">
          不会自动选择第一个结果；无结果或服务不可用时仍可手填。
        </View>
      </View>
      <View className="card">
        <Text>手填场馆（独立于 POI 搜索）</Text>
        <Input
          value={manualName}
          onInput={(event) => setManualName(event.detail.value)}
          placeholder="场馆名称"
        />
        <Input
          value={manualAddress}
          onInput={(event) => setManualAddress(event.detail.value)}
          placeholder="地址"
        />
        <Button onClick={useManual}>使用手填内容</Button>
        {manualError && <Text>请输入有效场馆名称和地址。</Text>}
        {view.selected && (
          <Text>
            待确认：{view.selected.name} / {view.selected.address}
          </Text>
        )}
        <Button
          disabled={view.status !== "SELECTED" && view.status !== "MANUAL"}
          onClick={confirm}
        >
          确认离线草稿
        </Button>
        {view.draft && (
          <View className="note">
            DRAFT_ONLY：{view.draft.city} / {view.draft.name} /{" "}
            {view.draft.source}。不会创建或修改赛事。
          </View>
        )}
      </View>
      <View className="card">
        <Text>地图与定位未启用。本页不会加载地图瓦片或请求真实 POI。</Text>
        <View className="note">
          可在无地图、无网络时完成手填草稿；真实拖图/定位/城市约束仍需独立真机验收。
        </View>
      </View>
    </View>
  );
}
