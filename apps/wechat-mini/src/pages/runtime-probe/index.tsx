import { useRef, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";

const RESULT_KEY = "__qd_m1_nav_result_v2";
const TEST_KEY = "__qd_m1_storage_v2";

export default function RuntimeProbe() {
  const [results, setResults] = useState<string[]>([]);
  const expected = useRef<string | null>(null);
  const record = (name: string, passed: boolean) =>
    setResults((previous) => [
      ...previous,
      `${name}: ${passed ? "PASS" : "FAIL"}`,
    ]);

  useDidShow(() => {
    const challenge = expected.current;
    if (!challenge) return;
    expected.current = null;
    void (async () => {
      let ok = false;
      try {
        const found = await Taro.getStorage({ key: RESULT_KEY });
        ok = found.data === challenge;
      } catch {
        ok = false;
      }
      record("navigation return", ok);
      try {
        await Taro.removeStorage({ key: RESULT_KEY });
      } catch {
        record("navigation result cleanup", false);
      }
    })();
  });

  const checkRuntime = () => {
    try {
      const info = Taro.getSystemInfoSync();
      record("runtime API", Boolean(info.platform && info.SDKVersion));
    } catch {
      record("runtime API", false);
    }
  };

  const checkStorage = async () => {
    let wrote = false;
    try {
      await Taro.setStorage({ key: TEST_KEY, data: "probe-v2" });
      wrote = true;
    } catch {
      // Explicit FAIL is recorded below.
    }
    record("storage write", wrote);

    let read = false;
    try {
      read = (await Taro.getStorage({ key: TEST_KEY })).data === "probe-v2";
    } catch {
      // Explicit FAIL is recorded below.
    }
    record("storage read", read);

    let removed = false;
    try {
      await Taro.removeStorage({ key: TEST_KEY });
      removed = true;
    } catch {
      // Explicit FAIL is recorded below.
    }
    record("storage delete", removed);
  };

  const checkNavigation = async () => {
    const challenge = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    expected.current = challenge;
    try {
      await Taro.removeStorage({ key: RESULT_KEY }).catch(() => undefined);
      await Taro.navigateTo({
        url: `/pages/runtime-probe-target/index?challenge=${encodeURIComponent(challenge)}`,
      });
      record("navigateTo accepted", true);
    } catch {
      expected.current = null;
      record("navigateTo accepted", false);
    }
  };

  return (
    <View>
      <Text>仅本地微信运行时诊断；不登录、不联网、不上传。</Text>
      <Button onClick={checkRuntime}>检查运行时</Button>
      <Button onClick={checkStorage}>检查 Storage</Button>
      <Button onClick={checkNavigation}>验证跳转和返回</Button>
      {results.map((result, index) => (
        <View key={index}>
          <Text>{result}</Text>
        </View>
      ))}
      <Text>SESSION_BRIDGE_UNPROVEN · REAL_DEVICE_NOT_VERIFIED</Text>
    </View>
  );
}
