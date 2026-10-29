import { useState } from "react";
import { useRouter } from "@tarojs/taro";
import { View, Text, Button, Map } from "@tarojs/components";
import { initialScore } from "../../shared-domain/ScoringEngine.ts";
import type { Rules } from "../../shared-domain/types.ts";
import { isValidQuickGroupConfig } from "../../shared-domain/QuickGroupConfig.ts";
import {
  encodeMiniPath,
  type NavigationIntent,
} from "../../core/navigation.ts";
import { OfflineShareFlow } from "../../core/share-flow-mock.ts";
import { decodeMiniLaunchIntent } from "../../core/launch-intent.ts";

import { advanceMockScore } from "../../core/mock-score.ts";

const mockRules: Rules = {
  best_of: 1,
  scoring_type: "points_11",
  custom_games_target: null,
  tiebreak_trigger: null,
  game_scoring: "advantage",
};

const demoIntents: NavigationIntent[] = [
  { kind: "event_view", eventId: "demo-event" },
  { kind: "private_preview", eventId: "demo-event" },
  { kind: "connection_invite", inviteRef: "demo-connection-123" },
  { kind: "player_claim", inviteRef: "demo-player-123" },
  { kind: "event_invite", inviteKind: "doubles", inviteRef: "demo-invite-123" },
  { kind: "score_match", eventId: "demo-event", matchId: "demo-match" },
];

export default function Index() {
  const router = useRouter();
  const receivedIntent = decodeMiniLaunchIntent(router.path, router.params);
  const [score, setScore] = useState(initialScore);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [shareFlow] = useState(() => new OfflineShareFlow());
  const [demoIndex, setDemoIndex] = useState(0);
  const [shareStatus, setShareStatus] = useState("NOT_STARTED");
  const [navigationHint, setNavigationHint] = useState<NavigationIntent | null>(
    null,
  );
  const selectedIntent = receivedIntent ?? demoIntents[demoIndex];
  const resumeShare = (confirmed: boolean) => {
    const result = shareFlow.resumeNavigation(confirmed);
    setShareStatus(result.status);
    setNavigationHint(result.status === "NAVIGATE_ONLY" ? result.intent : null);
  };
  const add = (side: "A" | "B") => {
    setScore((previous) => advanceMockScore(mockRules, previous, side));
  };
  return (
    <View className="poc">
      <View className="card">
        <View className="title">球搭子 · 小程序离线 PoC</View>
        <View className="note">
          模拟数据；没有真实微信登录、赛事写入或 Supabase Session。
        </View>
        <Text>
          11 分制记分：{score.points[0]} : {score.points[1]}
        </Text>
        <View>
          <Button onClick={() => add("A")}>A 得分</Button>
          <Button onClick={() => add("B")}>B 得分</Button>
        </View>
        <Text>胜方：{score.winner ?? "未结束"}</Text>
      </View>
      <View className="card">
        <Text>
          Quick 循环+淘汰示例（8 人 / 2 组 / 每组出线 2 人）：
          {isValidQuickGroupConfig(8, 2, 2) ? "有效" : "无效"}
        </Text>
        <View className="note">
          分享路径示例：
          {encodeMiniPath({ kind: "event_view", eventId: "demo-event" })}
        </View>
        <View className="note">
          收到的模拟分享类型：{receivedIntent?.kind ?? "无有效分享参数"}
        </View>
        <View className="note">
          仅解析导航；不会自动登录、报名、接受邀请或认领历史账号。
        </View>
      </View>
      <View className="card">
        <View className="title">分享 → 模拟身份 → 导航提示</View>
        <View className="note">
          {receivedIntent ? "当前分享链接" : "本地六类样例"}：
          {selectedIntent.kind}
          。本演示不调用 wx.login，不产生 Supabase Session，也不执行邀请或记分。
        </View>
        {!receivedIntent && (
          <Button
            onClick={() => {
              shareFlow.reset();
              setNavigationHint(null);
              setShareStatus("NOT_STARTED");
              setDemoIndex((index) => (index + 1) % demoIntents.length);
            }}
          >
            切换下一类分享样例
          </Button>
        )}
        <Button
          onClick={() => {
            setShareStatus(shareFlow.capture(selectedIntent));
            setNavigationHint(null);
          }}
        >
          暂存导航意图（仅内存）
        </Button>
        <Button
          onClick={() => setShareStatus(shareFlow.simulateLocalActor("A"))}
        >
          模拟本地身份 A（非微信登录）
        </Button>
        <Button onClick={() => resumeShare(false)}>尝试恢复导航</Button>
        {shareStatus === "CONFIRM_REQUIRED" && (
          <Button onClick={() => resumeShare(true)}>
            明确确认导航（不会接受邀请）
          </Button>
        )}
        <Button
          onClick={() => {
            setShareStatus(shareFlow.switchLocalActor("B"));
            setNavigationHint(null);
          }}
        >
          模拟切换到身份 B（旧意图失效）
        </Button>
        <Button
          onClick={() => {
            shareFlow.reset();
            setShareStatus("CLEARED");
            setNavigationHint(null);
          }}
        >
          清除本地模拟状态
        </Button>
        <Text>模拟状态：{shareStatus}</Text>
        {navigationHint && (
          <View className="note">
            仅产生导航提示：{navigationHint.kind}
            ；真实服务端权限、有效期及接收人均未验证。
          </View>
        )}
      </View>
      <View className="card">
        <Text>地图仅展示固定模拟位置；未启用定位、POI 搜索、网络请求。</Text>
        <Map
          onError={() => setMapUnavailable(true)}
          className="mock-map"
          latitude={39.9}
          longitude={116.4}
          scale={11}
        />
        {mapUnavailable && <Text>模拟地图暂时无法显示。</Text>}
        <Text>真实场馆选择：需另行真机与城市边界验收。</Text>
      </View>
    </View>
  );
}
