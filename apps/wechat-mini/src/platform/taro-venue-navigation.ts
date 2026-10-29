import Taro from "@tarojs/taro";
import type { OfflineVenueNavigator } from "../core/venue-route-driver.ts";

/** Platform-only adapter; importing it does not navigate or access a backend. */
export const taroOfflineVenueNavigator: OfflineVenueNavigator = {
  async navigateTo(url: string): Promise<void> {
    await Taro.navigateTo({ url });
  },
  async navigateBack(): Promise<void> {
    await Taro.navigateBack({ delta: 1 });
  },
};
