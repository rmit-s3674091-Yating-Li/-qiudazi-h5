import { useRef, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import { useDidShow, useLoad, useUnload } from "@tarojs/taro";
import { OfflineEventRouteForm } from "../../core/event-route-form.ts";
import { offlineVenueRouteDriver } from "../../platform/offline-venue-route-runtime.ts";
import {
  bindOfflineRouteParent,
  unbindOfflineRouteParent,
} from "../../platform/offline-event-route-session.ts";

/** Actual Taro page-stack wiring; ALL data are fictional, no backend writes. */
export default function EventRoutePoc() {
  const formRef = useRef<OfflineEventRouteForm | null>(null);
  if (!formRef.current)
    formRef.current = new OfflineEventRouteForm(offlineVenueRouteDriver);
  const form = formRef.current;
  const alive = useRef(true);
  const [view, setView] = useState(() => form.snapshot());
  const [message, setMessage] = useState("OFFLINE_MOCK_ONLY · 不会创建赛事");
  const update = () => setView(form.snapshot());

  useLoad(() => {
    alive.current = true;
    bindOfflineRouteParent(form);
  });
  useDidShow(() => {
    void form.receive().then((result) => {
      if (!alive.current || formRef.current !== form) return;
      if (result.status === "returned_mock_only") {
        setMessage("已从独立场馆页一次性回填离线草稿");
        update();
      } else if (
        result.status === "blocked" &&
        result.reason !== "NO_RETURNED_DRAFT"
      ) {
        setMessage(`回填已拒绝：${result.reason}`);
      }
    });
  });
  useUnload(() => {
    alive.current = false;
    unbindOfflineRouteParent(form);
    form.unload();
  });

  const open = async () => {
    const result = await form.open(Date.now());
    if (!alive.current || formRef.current !== form) return;
    if (result.status === "blocked") setMessage(`跳转已拒绝：${result.reason}`);
    else setMessage("已打开独立场馆选择页（仅模拟）");
  };

  return (
    <View className="poc">
      <View className="card">
        <View className="title">创建赛事 · 跨页面离线 PoC</View>
        <Text>本页只验证 Taro navigateTo / navigateBack 与父表单回填。</Text>
        <Text>{message}</Text>
        <View>
          <Button
            size="mini"
            onClick={() => {
              form.changeCity(null);
              update();
            }}
          >
            不选城市
          </Button>
          {(["北京", "上海", "成都"] as const).map((city) => (
            <Button
              key={city}
              size="mini"
              onClick={() => {
                form.changeCity(city);
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
            form.editTitle(event.detail.value);
            update();
          }}
          placeholder="模拟赛事名称"
        />
        <Button
          disabled={!view.city}
          onClick={() => {
            void open();
          }}
        >
          打开独立场馆选择页
        </Button>
        {view.venue && (
          <View className="note">
            <Text>
              {view.venue.city} / {view.venue.venueName}
            </Text>
            <Text>地址：{view.venue.venueAddress}</Text>
            <Text>具体场地：{view.venue.specificCourt ?? "未填写"}</Text>
            <Text>OFFLINE_MOCK_ONLY / canPersist=false</Text>
          </View>
        )}
        <Text>没有赛事保存、真实地图、登录、上传或网络请求。</Text>
      </View>
    </View>
  );
}
