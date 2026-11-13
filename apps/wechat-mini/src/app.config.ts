export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/venue-poc/index",
    "pages/event-create-poc/index",
    "pages/event-route-poc/index",
    "pages/venue-route-poc/index",
    "pages/runtime-probe/index",
    "pages/runtime-probe-target/index",
  ],
  window: {
    navigationBarTitleText: "球搭子 · 离线 PoC",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTextStyle: "black",
  },
});
