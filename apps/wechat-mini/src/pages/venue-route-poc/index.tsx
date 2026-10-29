import { useRef, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import Taro, { useLoad, useUnload } from "@tarojs/taro";
import {
  OfflineFixtureVenuePort,
  VenueSelectionPoc,
  type VenuePocSnapshot,
} from "../../core/venue-selection-poc.ts";
import {
  prepareOfflineCourtPreview,
  validateSpecificCourt,
} from "../../core/venue-court-draft.ts";
import { offlineVenueRouteDriver } from "../../platform/offline-venue-route-runtime.ts";
import { currentOfflineRouteContext } from "../../platform/offline-event-route-session.ts";

/** Dedicated child page: direct entry or missing handoff is rejected. */
export default function VenueRoutePoc() {
  const picker = useRef<VenueSelectionPoc | null>(null);
  const alive = useRef(true);
  const confirming = useRef(false);
  const [claimed, setClaimed] = useState(false);
  const [view, setView] = useState<VenuePocSnapshot | null>(null);
  const [query, setQuery] = useState("模拟");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [court, setCourt] = useState("");
  const [message, setMessage] = useState("等待路由校验");

  useLoad((options) => {
    alive.current = true;
    const result = offlineVenueRouteDriver.claim(options, Date.now());
    if (result.status !== "claimed_mock_only") {
      setMessage(
        `不可使用：${result.status === "blocked" ? result.reason : "INVALID_ROUTE"}`,
      );
      return;
    }
    const next = new VenueSelectionPoc(
      new OfflineFixtureVenuePort(),
      result.city,
    );
    picker.current = next;
    setView(next.snapshot());
    setClaimed(true);
    setMessage("模拟数据；不调用真实地图/定位/POI");
  });
  useUnload(() => {
    alive.current = false;
    offlineVenueRouteDriver.childUnloaded();
  });

  const update = () => setView(picker.current?.snapshot() ?? null);
  const search = async () => {
    const active = picker.current;
    if (!active || !claimed) return;
    setCourt("");
    const pending = active.search(query);
    update();
    await pending;
    if (alive.current && picker.current === active) update();
  };
  const confirm = async () => {
    const active = picker.current;
    if (!claimed || !active || confirming.current) return;
    confirming.current = true;
    try {
      const validation = validateSpecificCourt(court);
      if (!validation.ok) {
        setMessage("具体场地无效");
        return;
      }
      // Do not consume selection until navigation succeeds; early confirmation may be blocked.
      const draft = active.previewDraft();
      const preview = prepareOfflineCourtPreview(draft, validation.value ?? "");
      if (preview.status !== "ready_mock_only") {
        setMessage(`草稿已拒绝：${preview.reason}`);
        return;
      }
      const result = await offlineVenueRouteDriver.finish(
        currentOfflineRouteContext(),
        preview,
        Date.now(),
      );
      if (alive.current && result.status === "blocked") {
        setMessage(`回填失败：${result.reason}`);
      }
      // On success navigateBack already ran; parent onShow consumes the draft.
    } finally {
      confirming.current = false;
    }
  };
  const cancel = async () => {
    offlineVenueRouteDriver.childUnloaded();
    try {
      await Taro.navigateBack({ delta: 1 });
    } catch {
      if (alive.current) setMessage("返回失败，请使用微信返回键");
    }
  };

  return (
    <View className="poc">
      <View className="card">
        <View className="title">独立场馆页 · 离线 PoC</View>
        <Text>{message}</Text>
        {claimed && view && (
          <View>
            <Text>父表单选定城市：{view.city}（本页不可更改）</Text>
            <Input
              value={query}
              onInput={(event) => {
                setQuery(event.detail.value);
                picker.current?.invalidateInputDraft();
                setCourt("");
                update();
              }}
              placeholder="搜索模拟场馆"
            />
            <Button
              onClick={() => {
                void search();
              }}
            >
              搜索模拟候选
            </Button>
            <Text>状态：{view.status}</Text>
            {view.candidates.map((item) => (
              <View key={item.id}>
                <Text>
                  {item.name} / {item.address}
                </Text>
                <Button
                  size="mini"
                  onClick={() => {
                    picker.current?.chooseCandidate(item.id);
                    setCourt("");
                    update();
                  }}
                >
                  选择
                </Button>
              </View>
            ))}
            <Text>手填场馆（无结果时仍可继续）</Text>
            <Input
              value={name}
              onInput={(event) => {
                setName(event.detail.value);
                picker.current?.invalidateInputDraft();
                setCourt("");
                update();
              }}
              placeholder="场馆名称"
            />
            <Input
              value={address}
              onInput={(event) => {
                setAddress(event.detail.value);
                picker.current?.invalidateInputDraft();
                setCourt("");
                update();
              }}
              placeholder="场馆地址"
            />
            <Button
              onClick={() => {
                const ok = picker.current?.useManual(name, address) ?? false;
                if (ok) setCourt("");
                setMessage(ok ? "已选择手填场馆" : "手填内容无效");
                update();
              }}
            >
              使用手填内容
            </Button>
            <Input
              value={court}
              onInput={(event) => setCourt(event.detail.value)}
              placeholder="具体场地（可选）"
            />
            <Text>已选：{view.selected?.name ?? "未选择"}</Text>
            <Button
              disabled={view.status !== "SELECTED" && view.status !== "MANUAL"}
              onClick={() => {
                void confirm();
              }}
            >
              确认并返回父页面
            </Button>
          </View>
        )}
        <Button
          onClick={() => {
            void cancel();
          }}
        >
          取消并返回
        </Button>
        <Text>
          OFFLINE_MOCK_ONLY · canPersist=false；无真实坐标或赛事写入。
        </Text>
      </View>
    </View>
  );
}
