import {
  type OfflineVenueRouteResult,
  type OfflineVenueRouteDriver,
} from "./venue-route-driver.ts";
import { prepareOfflineCourtPreview } from "./venue-court-draft.ts";

const CITIES = ["北京", "上海", "成都"] as const;
type City = (typeof CITIES)[number];
type Returned = Extract<
  OfflineVenueRouteResult,
  { status: "returned_mock_only" }
>["fields"];
let nextScreen = 0;

export type OfflineRouteFormSnapshot = Readonly<{
  city: City | null;
  title: string;
  revision: number;
  venue: Returned | null;
  verification: "OFFLINE_MOCK_ONLY";
  canPersist: false;
}>;
export type FormRouteDecision =
  | OfflineVenueRouteResult
  | Readonly<{
      status: "blocked";
      reason:
        | "CITY_REQUIRED"
        | "INVALID_RETURN"
        | "FORM_CHANGED"
        | "PARENT_UNLOADED";
    }>;

const isCity = (value: unknown): value is City =>
  typeof value === "string" && CITIES.some((city) => city === value);
const isTitle = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 80 &&
  !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);

/** A separate parent for real two-page navigation, without event writes. */
export class OfflineEventRouteForm {
  private readonly screenEpoch = `route-screen-${++nextScreen}`;
  private readonly driver: OfflineVenueRouteDriver;
  private city: City | null = null;
  private title = "";
  private revision = 0;
  private venue: Returned | null = null;
  private disposed = false;

  constructor(driver: OfflineVenueRouteDriver) {
    this.driver = driver;
  }

  context(): Readonly<{
    formKey: string;
    revision: number;
    screenEpoch: string;
    city: City;
  }> | null {
    if (this.disposed || !this.city) return null;
    return {
      formKey: "event-route-poc",
      revision: this.revision,
      screenEpoch: this.screenEpoch,
      city: this.city,
    };
  }

  snapshot(): OfflineRouteFormSnapshot {
    return {
      city: this.city,
      title: this.title,
      revision: this.revision,
      venue: this.venue ? { ...this.venue } : null,
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }

  changeCity(value: unknown): boolean {
    if (this.disposed) return false;
    if (value !== null && !isCity(value)) return false;
    if (value === this.city) return true;
    this.driver.parentChanged();
    this.city = value as City | null;
    this.venue = null;
    ++this.revision;
    return true;
  }

  editTitle(value: unknown): boolean {
    if (this.disposed) return false;
    if (!isTitle(value)) return false;
    if (value === this.title) return true;
    this.driver.parentChanged();
    this.title = value;
    this.venue = null;
    ++this.revision;
    return true;
  }

  open(nowMs: unknown): Promise<FormRouteDecision> {
    if (this.disposed)
      return Promise.resolve({ status: "blocked", reason: "PARENT_UNLOADED" });
    const context = this.context();
    if (!context)
      return Promise.resolve({ status: "blocked", reason: "CITY_REQUIRED" });
    return this.driver.open(context, nowMs);
  }

  async receive(): Promise<FormRouteDecision> {
    if (this.disposed) return { status: "blocked", reason: "PARENT_UNLOADED" };
    const expected = this.context();
    const result = await this.driver.receive(expected);
    if (result.status !== "returned_mock_only") return result;
    // The driver checks the context it was passed, but an edit/unload can
    // happen AFTER that check and BEFORE this awaited continuation resumes.
    // Recheck the current parent epoch and revision before applying the draft.
    const current = this.context();
    if (
      !expected ||
      !current ||
      current.formKey !== expected.formKey ||
      current.screenEpoch !== expected.screenEpoch ||
      current.revision !== expected.revision ||
      current.city !== expected.city
    )
      return { status: "blocked", reason: "FORM_CHANGED" };
    const fields = result.fields;
    // A return is a draft, not a permission to create an event. Revalidate
    // the six allowlisted fields even after the in-memory bridge checked them.
    const keys = Object.keys(fields).sort();
    const allowed = [
      "city",
      "specificCourt",
      "status",
      "venueAddress",
      "venueName",
      "venueSource",
    ];
    const preview = prepareOfflineCourtPreview(
      {
        city: fields.city,
        name: fields.venueName,
        address: fields.venueAddress,
        source: fields.venueSource,
        status: fields.status,
      },
      fields.specificCourt ?? "",
    );
    if (
      keys.length !== allowed.length ||
      keys.some((key, i) => key !== allowed[i]) ||
      preview.status !== "ready_mock_only" ||
      !this.city ||
      preview.preview.city !== this.city
    )
      return { status: "blocked", reason: "INVALID_RETURN" };
    this.venue = { ...preview.preview };
    return {
      status: "returned_mock_only",
      fields: { ...this.venue },
      verification: "OFFLINE_MOCK_ONLY",
      canPersist: false,
    };
  }

  unload(): void {
    this.disposed = true;
    this.driver.parentUnloaded();
    this.venue = null;
  }
}
