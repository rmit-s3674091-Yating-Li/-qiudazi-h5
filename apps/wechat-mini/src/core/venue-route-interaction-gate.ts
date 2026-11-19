/**
 * Pure, credential-free UI transaction gate for the offline two-page venue PoC.
 * A pending navigateBack is a transaction: edits and cancellation must not race it.
 * This is not a permission, authentication or persistence boundary.
 */
export type OfflineRouteInteractionPhase =
  | "editing"
  | "confirming"
  | "returned"
  | "cancelled"
  | "unloaded";

export class OfflineRouteInteractionGate {
  private phase: OfflineRouteInteractionPhase = "editing";

  snapshot(): OfflineRouteInteractionPhase {
    return this.phase;
  }

  canEdit(): boolean {
    return this.phase === "editing";
  }

  beginConfirm(): boolean {
    if (!this.canEdit()) return false;
    this.phase = "confirming";
    return true;
  }

  /** Only a blocked/failed attempt is retryable. A successful return is terminal. */
  settleConfirm(succeeded: boolean): void {
    if (this.phase !== "confirming") return;
    this.phase = succeeded ? "returned" : "editing";
  }

  cancel(): boolean {
    if (!this.canEdit()) return false;
    this.phase = "cancelled";
    return true;
  }

  unload(): void {
    this.phase = "unloaded";
  }
}
