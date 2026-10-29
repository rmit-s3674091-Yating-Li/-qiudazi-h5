import type { VenuePort } from "./ports.ts";
import {
  OfflineFixtureVenuePort,
  POC_CITIES,
  VenueSelectionPoc,
  type PocCity,
  type VenuePocSnapshot,
} from "./venue-selection-poc.ts";
import {
  prepareOfflineCourtPreview,
  validateSpecificCourt,
} from "./venue-court-draft.ts";
import {
  OfflineVenueReturnGate,
  type ReturnDecision,
} from "./venue-draft-return.ts";

/** Only a local demonstration: not an event form, router, credential or write API. */
type ReturnedVenue = Extract<
  ReturnDecision,
  { status: "draft_return_mock_only" }
>["fields"];
type IssuedTicket = Extract<
  ReturnDecision,
  { status: "issued_mock_only" }
>["ticket"];
export type EventVenueFlowSnapshot = Readonly<{
  step: "FORM" | "VENUE_PICKER";
  city: PocCity | null;
  title: string;
  revision: number;
  court: string;
  venue: ReturnedVenue | null;
  picker: VenuePocSnapshot | null;
  verification: "OFFLINE_MOCK_ONLY";
  canPersist: false;
}>;
export type EventVenueFlowDecision =
  | Readonly<{ status: "opened_mock_only" }>
  | Readonly<{
      status: "returned_mock_only";
      verification: "OFFLINE_MOCK_ONLY";
      canPersist: false;
      venue: ReturnedVenue;
    }>
  | Readonly<{
      status: "blocked";
      reason:
        | "CITY_REQUIRED"
        | "PICKER_NOT_OPEN"
        | "VENUE_NOT_SELECTED"
        | "INVALID_COURT_DETAIL"
        | "INVALID_PREVIEW"
        | "PORT_UNAVAILABLE"
        | Extract<ReturnDecision, { status: "blocked" }>["reason"];
    }>;

let nextLocalMount = 0;
const isCity = (value: unknown): value is PocCity =>
  typeof value === "string" && POC_CITIES.some((city) => city === value);
const validTitle = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 80 &&
  !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);

/**
 * In-memory two-stage PoC of event form -> venue picker -> form return.
 * The two stages deliberately stay on ONE Taro page. Actual navigateTo/
 * navigateBack, persistence, authentication and server-side authorization
 * are NOT implemented. A new instance represents a new parent screen epoch.
 */
export class OfflineEventCreateVenueFlow {
  private readonly gate = new OfflineVenueReturnGate();
  private readonly screenEpoch = `mount-${++nextLocalMount}`;
  private readonly portFactory: () => VenuePort;
  private city: PocCity | null = null;
  private title = "";
  private revision = 0;
  private venue: ReturnedVenue | null = null;
  private picker: VenueSelectionPoc | null = null;
  private ticket: IssuedTicket | null = null;
  private court = "";

  constructor(
    portFactory: () => VenuePort = () => new OfflineFixtureVenuePort(),
  ) {
    this.portFactory = portFactory;
  }

  snapshot(): EventVenueFlowSnapshot {
    return {
      step: this.picker ? "VENUE_PICKER" : "FORM",
      city: this.city,
      title: this.title,
      revision: this.revision,
      court: this.court,
      venue: this.venue ? { ...this.venue } : null,
      picker: this.picker?.snapshot() ?? null,
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }

  private context() {
    return {
      formKey: "event-create-poc",
      revision: this.revision,
      screenEpoch: this.screenEpoch,
      city: this.city,
    };
  }

  private closePicker(): void {
    this.gate.invalidate();
    this.picker = null;
    this.ticket = null;
    this.court = "";
  }

  /** Explicit city choice; never default the user's city to Beijing. */
  changeCity(city: unknown): boolean {
    if (city !== null && !isCity(city)) return false;
    if (city === this.city) return true;
    this.closePicker();
    this.city = city as PocCity | null;
    ++this.revision;
    this.venue = null;
    return true;
  }

  /** Any parent form edit invalidates a pending return ticket. */
  editTitle(value: unknown): boolean {
    if (!validTitle(value)) return false;
    if (value === this.title) return true;
    this.closePicker();
    this.title = value;
    ++this.revision;
    return true;
  }

  openPicker(nowMs: unknown): EventVenueFlowDecision {
    this.closePicker();
    if (!this.city) return { status: "blocked", reason: "CITY_REQUIRED" };
    const issued = this.gate.issue(this.context(), nowMs);
    if (issued.status !== "issued_mock_only")
      return {
        status: "blocked",
        reason: issued.status === "blocked" ? issued.reason : "INVALID_CONTEXT",
      };
    try {
      this.picker = new VenueSelectionPoc(this.portFactory(), this.city);
      this.ticket = issued.ticket;
      return { status: "opened_mock_only" };
    } catch {
      this.closePicker();
      return { status: "blocked", reason: "PORT_UNAVAILABLE" };
    }
  }

  async search(query: unknown): Promise<EventVenueFlowSnapshot> {
    const current = this.picker;
    if (!current) return this.snapshot();
    this.court = "";
    await current.search(query);
    // Old async completion must not restore a cancelled/replaced picker.
    return this.snapshot();
  }

  chooseCandidate(id: unknown): boolean {
    const ok = this.picker?.chooseCandidate(id) ?? false;
    if (ok) this.court = "";
    return ok;
  }

  useManual(name: unknown, address: unknown): boolean {
    const ok = this.picker?.useManual(name, address) ?? false;
    if (ok) this.court = "";
    return ok;
  }

  editCourt(value: unknown): boolean {
    if (!this.picker || typeof value !== "string") return false;
    this.court = value;
    return true;
  }

  cancelPicker(): void {
    this.closePicker();
  }

  confirmPicker(nowMs: unknown): EventVenueFlowDecision {
    if (!this.picker || !this.ticket)
      return { status: "blocked", reason: "PICKER_NOT_OPEN" };
    const court = validateSpecificCourt(this.court);
    if (!court.ok) return { status: "blocked", reason: "INVALID_COURT_DETAIL" };
    const selected = this.picker.confirm();
    if (!selected) return { status: "blocked", reason: "VENUE_NOT_SELECTED" };
    const preview = prepareOfflineCourtPreview(selected, court.value ?? "");
    const decision = this.gate.accept(
      this.ticket,
      this.context(),
      preview,
      nowMs,
    );
    this.closePicker();
    if (decision.status !== "draft_return_mock_only")
      return {
        status: "blocked",
        reason:
          decision.status === "blocked" ? decision.reason : "INVALID_PREVIEW",
      };
    this.venue = { ...decision.fields };
    return {
      status: "returned_mock_only",
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
      venue: { ...decision.fields },
    };
  }
}
