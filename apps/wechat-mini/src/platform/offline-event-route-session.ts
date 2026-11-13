import type { OfflineEventRouteForm } from "../core/event-route-form.ts";
import { offlineVenueRouteDriver } from "./offline-venue-route-runtime.ts";

/** Memory-only parent identity; never placed in URL or persisted. */
let activeParent: OfflineEventRouteForm | null = null;

export function bindOfflineRouteParent(form: OfflineEventRouteForm): void {
  if (activeParent && activeParent !== form) offlineVenueRouteDriver.cancel();
  activeParent = form;
}

export function unbindOfflineRouteParent(form: OfflineEventRouteForm): void {
  if (activeParent === form) {
    activeParent = null;
    offlineVenueRouteDriver.parentUnloaded();
  }
}

export function currentOfflineRouteContext(): ReturnType<
  OfflineEventRouteForm["context"]
> {
  return activeParent?.context() ?? null;
}
