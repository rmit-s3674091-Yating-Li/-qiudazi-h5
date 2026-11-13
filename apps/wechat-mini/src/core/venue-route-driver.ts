import {
  OfflineVenueNavigationBridge,
  type VenueNavigationDecision,
} from "./venue-navigation-bridge.ts";

/**
 * A minimal Taro-compatible navigation port. Implementations MUST reject on
 * navigation failure. This port never performs a server request or auth action.
 */
export interface OfflineVenueNavigator {
  navigateTo(url: string): Promise<unknown>;
  navigateBack(): Promise<unknown>;
}

type BridgeBlock = Extract<VenueNavigationDecision, { status: "blocked" }>;
type ReturnedFields = Extract<
  VenueNavigationDecision,
  { status: "draft_return_mock_only" }
>["fields"];

type DriverBlockReason =
  | BridgeBlock["reason"]
  | "NAVIGATION_BUSY"
  | "NAVIGATION_NOT_READY"
  | "NAVIGATE_TO_FAILED"
  | "NAVIGATE_BACK_FAILED"
  | "NAVIGATION_CANCELLED"
  | "NOT_CLAIMED"
  | "NO_RETURNED_DRAFT";

export type OfflineVenueRouteResult =
  | Readonly<{
      status: "opened_mock_only";
      url: string;
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
    }>
  | Readonly<{
      status: "claimed_mock_only";
      city: "北京" | "上海" | "成都";
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
    }>
  | Readonly<{
      status: "returned_mock_only";
      fields: ReturnedFields;
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
    }>
  | Readonly<{ status: "blocked"; reason: DriverBlockReason }>;

type Phase = "idle" | "opening" | "claimed_waiting_nav" | "open" | "returning";
type ContextStamp = Readonly<{
  formKey: string;
  revision: number;
  screenEpoch: string;
  city: "北京" | "上海" | "成都";
}>;
const citySet = new Set(["北京", "上海", "成都"]);
const token = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

/** Capture only four immutable, own DATA fields; never retain the caller object. */
function contextStamp(value: unknown): ContextStamp | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const own = (key: string): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("ACCESSOR");
      return descriptor.value;
    };
    const formKey = own("formKey");
    const revision = own("revision");
    const screenEpoch = own("screenEpoch");
    const city = own("city");
    if (
      !token(formKey) ||
      !token(screenEpoch) ||
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      !citySet.has(city as string)
    )
      return null;
    return Object.freeze({
      formKey,
      revision,
      screenEpoch,
      city: city as ContextStamp["city"],
    });
  } catch {
    return null;
  }
}
const sameContext = (a: ContextStamp, b: ContextStamp): boolean =>
  a.formKey === b.formKey &&
  a.revision === b.revision &&
  a.screenEpoch === b.screenEpoch &&
  a.city === b.city;
const blocked = (reason: DriverBlockReason): OfflineVenueRouteResult => ({
  status: "blocked",
  reason,
});

/**
 * One in-memory parent/child route transaction. Both pages must use this SAME
 * instance, never separate page-local instances or persisted Storage state.
 *
 * Parent onHide is NOT cancellation (navigateTo hides the parent); parent
 * onUnload, parent edits, account changes and child abandonment ARE.
 * A successful finish returns a draft only AFTER navigateBack resolves.
 */
export class OfflineVenueRouteDriver {
  private readonly bridge = new OfflineVenueNavigationBridge();
  private phase: Phase = "idle";
  private generation = 0;
  private handle: unknown = null;
  private readonly navigator: OfflineVenueNavigator;
  private issuedContext: ContextStamp | null = null;
  private returned: { fields: ReturnedFields; context: ContextStamp } | null =
    null;
  private returningPromise: Promise<OfflineVenueRouteResult> | null = null;

  constructor(navigator: OfflineVenueNavigator) {
    this.navigator = navigator;
  }

  cancel(): void {
    ++this.generation;
    this.bridge.cancel();
    this.handle = null;
    this.phase = "idle";
    this.issuedContext = null;
    this.returned = null;
  }

  parentUnloaded(): void {
    this.cancel();
  }

  parentChanged(): void {
    this.cancel();
  }

  childUnloaded(): void {
    // WeChat may invoke onUnload before OR after navigateBack resolves.
    // Preserve a successful one-shot return until the parent consumes it.
    if (this.phase === "returning" || this.phase === "idle") return;
    this.cancel();
  }

  async open(
    context: unknown,
    nowMs: unknown,
  ): Promise<OfflineVenueRouteResult> {
    if (this.phase !== "idle") return blocked("NAVIGATION_BUSY");
    this.returned = null;
    const stamp = contextStamp(context);
    if (!stamp) return blocked("INVALID_CONTEXT");
    let issued: VenueNavigationDecision;
    try {
      issued = this.bridge.issue(stamp, nowMs);
    } catch {
      this.cancel();
      return blocked("NAVIGATE_TO_FAILED");
    }
    if (issued.status !== "route_mock_only") {
      return issued.status === "blocked"
        ? blocked(issued.reason)
        : blocked("NAVIGATE_TO_FAILED");
    }
    this.issuedContext = stamp;
    const generation = ++this.generation;
    this.phase = "opening";
    try {
      const pending = this.navigator.navigateTo(issued.url);
      if (!pending || typeof pending.then !== "function")
        throw new Error("NAVIGATION_PORT_NOT_PROMISE");
      await pending;
    } catch {
      if (generation !== this.generation)
        return blocked("NAVIGATION_CANCELLED");
      this.cancel();
      return blocked("NAVIGATE_TO_FAILED");
    }
    if (generation !== this.generation) return blocked("NAVIGATION_CANCELLED");
    if (this.phase !== "opening" && this.phase !== "claimed_waiting_nav") {
      this.cancel();
      return blocked("NAVIGATION_CANCELLED");
    }
    this.phase = "open";
    return {
      status: "opened_mock_only",
      url: issued.url,
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }

  /** Child Taro onLoad(options). May fire before navigateTo promise resolves. */
  claim(options: unknown, nowMs: unknown): OfflineVenueRouteResult {
    if (this.phase !== "opening" && this.phase !== "open")
      return blocked("NAVIGATION_NOT_READY");
    let decision: VenueNavigationDecision;
    try {
      decision = this.bridge.claim(options, nowMs);
    } catch {
      this.cancel();
      return blocked("INVALID_ROUTE_OPTIONS");
    }
    if (decision.status !== "claimed_mock_only") {
      if (decision.status === "blocked") {
        if (
          decision.reason === "INVALID_CLOCK" ||
          decision.reason === "EXPIRED"
        )
          this.cancel();
        return blocked(decision.reason);
      }
      return blocked("INVALID_CLAIM");
    }
    this.handle = decision.handle;
    if (this.phase === "opening") this.phase = "claimed_waiting_nav";
    return {
      status: "claimed_mock_only",
      city: decision.city,
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }

  /**
   * Child confirmation. The child must NOT write the parent form from this
   * promise: the parent calls receive() onShow, which rechecks its own context.
   */
  finish(
    currentContext: unknown,
    preview: unknown,
    nowMs: unknown,
  ): Promise<OfflineVenueRouteResult> {
    if (this.phase === "claimed_waiting_nav")
      return Promise.resolve(blocked("NAVIGATION_NOT_READY"));
    if (this.phase !== "open" || this.handle === null)
      return Promise.resolve(blocked("NOT_CLAIMED"));
    const pending = this.finishInternal(currentContext, preview, nowMs);
    this.returningPromise = pending;
    return pending.finally(() => {
      if (this.returningPromise === pending) this.returningPromise = null;
    });
  }

  private async finishInternal(
    currentContext: unknown,
    preview: unknown,
    nowMs: unknown,
  ): Promise<OfflineVenueRouteResult> {
    this.phase = "returning";
    const generation = ++this.generation;
    let result: VenueNavigationDecision;
    try {
      result = this.bridge.finish(this.handle, currentContext, preview, nowMs);
    } catch {
      this.cancel();
      return blocked("INVALID_CLAIM");
    }
    if (result.status !== "draft_return_mock_only") {
      this.cancel();
      return result.status === "blocked"
        ? blocked(result.reason)
        : blocked("INVALID_CLAIM");
    }
    try {
      const pending = this.navigator.navigateBack();
      if (!pending || typeof pending.then !== "function")
        throw new Error("NAVIGATION_PORT_NOT_PROMISE");
      await pending;
    } catch {
      if (generation !== this.generation)
        return blocked("NAVIGATION_CANCELLED");
      this.cancel();
      return blocked("NAVIGATE_BACK_FAILED");
    }
    if (generation !== this.generation) return blocked("NAVIGATION_CANCELLED");
    const stamp = this.issuedContext;
    if (!stamp) {
      this.cancel();
      return blocked("NAVIGATION_CANCELLED");
    }
    this.bridge.cancel();
    ++this.generation;
    this.phase = "idle";
    this.handle = null;
    this.issuedContext = null;
    this.returned = { context: stamp, fields: { ...result.fields } };
    return {
      status: "returned_mock_only",
      fields: { ...result.fields },
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }

  /**
   * Parent onShow. Waits for a back-navigation promise if still pending, then
   * consumes the result once. A changed parent revision/epoch/city discards it.
   */
  async receive(currentContext: unknown): Promise<OfflineVenueRouteResult> {
    const inFlight = this.returningPromise;
    if (inFlight) await inFlight;
    const pending = this.returned;
    this.returned = null;
    if (!pending) return blocked("NO_RETURNED_DRAFT");
    const stamp = contextStamp(currentContext);
    if (!stamp || !sameContext(pending.context, stamp))
      return blocked("FORM_CHANGED");
    return {
      status: "returned_mock_only",
      fields: { ...pending.fields },
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }
}
