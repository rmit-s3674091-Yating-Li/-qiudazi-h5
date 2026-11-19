import Taro, { useRouter } from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";

const RESULT_KEY = "__qd_m1_nav_result_v2";

export default function RuntimeProbeTarget() {
  const { params } = useRouter();
  const challenge = params?.challenge;

  const returnToProbe = async () => {
    if (
      typeof challenge !== "string" ||
      !/^[0-9]{10,16}-[a-z0-9]{1,20}$/.test(challenge)
    ) {
      return;
    }
    try {
      await Taro.setStorage({ key: RESULT_KEY, data: challenge });
      await Taro.navigateBack({ delta: 1 });
    } catch {
      // Remain on this page; never claim a successful return.
    }
  };

  return (
    <View>
      <Text>已进入导航目标页；点击返回完成验证。</Text>
      <Button onClick={returnToProbe}>确认并返回验证页</Button>
    </View>
  );
}
