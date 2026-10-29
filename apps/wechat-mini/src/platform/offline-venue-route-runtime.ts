import { OfflineVenueRouteDriver } from "../core/venue-route-driver.ts";
import { taroOfflineVenueNavigator } from "./taro-venue-navigation.ts";

/**
 * Import this exact module from BOTH Taro pages. Do not instantiate separate
 * page-local drivers, persist the bridge, or use it as a login/session object.
 * The parent must cancel on edit/unload/account change, not on ordinary onHide.
 */
export const offlineVenueRouteDriver = new OfflineVenueRouteDriver(
  taroOfflineVenueNavigator,
);
