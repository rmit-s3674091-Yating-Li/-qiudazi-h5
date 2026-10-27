import type { VenuePort } from "./ports.ts";
import {
  classifyVenueSearch,
  type VenueCandidate,
  type VenueSearchOutcome,
} from "./venue-search.ts";

/** Fictional data: no real POI provider, geocoding or location permission. */
export const POC_CITIES = ["北京", "上海", "成都"] as const;
export type PocCity = (typeof POC_CITIES)[number];

type Fixture = VenueCandidate & { city: PocCity };
const fixtures: readonly Fixture[] = [
  {
    city: "北京",
    id: "fixture-bj-001",
    name: "北京模拟网球场 A",
    address: "北京市·模拟地址 A（非真实场馆）",
  },
  {
    city: "北京",
    id: "fixture-bj-002",
    name: "北京模拟网球场 B",
    address: "北京市·模拟地址 B（非真实场馆）",
  },
  {
    city: "上海",
    id: "fixture-sh-001",
    name: "上海模拟球馆 A",
    address: "上海市·模拟地址 A（非真实场馆）",
  },
  {
    city: "成都",
    id: "fixture-cd-001",
    name: "成都模拟网球场 A",
    address: "成都市·模拟地址 A（非真实场馆）",
  },
];
const isCity = (value: unknown): value is PocCity =>
  typeof value === "string" && POC_CITIES.some((city) => city === value);
const safeText = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);

/** Deliberately synthetic search. No network, no coordinates and no automatic first-result choice. */
export class OfflineFixtureVenuePort implements VenuePort {
  search(city: string, query: string): Promise<VenueSearchOutcome> {
    return classifyVenueSearch(city, query, async () => {
      if (!isCity(city)) throw new Error("OFFLINE_CITY_NOT_SUPPORTED");
      const term = query.trim().toLocaleLowerCase();
      return fixtures
        .filter(
          (item) =>
            item.city === city &&
            `${item.name} ${item.address}`.toLocaleLowerCase().includes(term),
        )
        .map(({ id, name, address }) => ({ id, name, address }));
    });
  }
}

export type VenueDraft = Readonly<{
  city: PocCity;
  name: string;
  address: string;
  source: "mock_poi" | "manual";
  status: "DRAFT_ONLY";
}>;
export type VenuePocStatus =
  | "IDLE"
  | "SEARCHING"
  | "RESULTS"
  | "NO_RESULTS"
  | "UNAVAILABLE"
  | "SERVICE_ERROR"
  | "SELECTED"
  | "MANUAL"
  | "CONFIRMED";
export type VenuePocSnapshot = Readonly<{
  city: PocCity;
  status: VenuePocStatus;
  candidates: readonly VenueCandidate[];
  selected: VenueCandidate | null;
  draft: VenueDraft | null;
  reason: string | null;
}>;

/**
 * A UI-only state machine. It cannot create events or claim that a map/POI is real.
 * Request revision prevents stale results from crossing a city/manual change.
 */
export class VenueSelectionPoc {
  private revision = 0;
  private readonly port: VenuePort;
  private city: PocCity;
  private status: VenuePocStatus = "IDLE";
  private candidates: VenueCandidate[] = [];
  private selected: VenueCandidate | null = null;
  private draft: VenueDraft | null = null;
  private reason: string | null = null;
  constructor(port: VenuePort, city: PocCity = "北京") {
    if (!isCity(city)) throw new Error("INVALID_CITY");
    this.port = port;
    this.city = city;
  }

  snapshot(): VenuePocSnapshot {
    return {
      city: this.city,
      status: this.status,
      candidates: this.candidates.map((candidate) => ({ ...candidate })),
      selected: this.selected ? { ...this.selected } : null,
      draft: this.draft ? { ...this.draft } : null,
      reason: this.reason,
    };
  }

  setCity(city: unknown): boolean {
    if (!isCity(city)) return false;
    ++this.revision;
    this.city = city;
    this.reset();
    return true;
  }

  private reset(): void {
    this.status = "IDLE";
    this.candidates = [];
    this.selected = null;
    this.draft = null;
    this.reason = null;
  }

  async search(query: unknown): Promise<VenuePocSnapshot> {
    const revision = ++this.revision;
    this.reset();
    if (!safeText(query, 80)) {
      this.status = "SERVICE_ERROR";
      this.reason = "INVALID_INPUT";
      return this.snapshot();
    }
    this.status = "SEARCHING";
    const city = this.city;
    let outcome: VenueSearchOutcome;
    try {
      outcome = await this.port.search(city, query.trim());
    } catch {
      outcome = {
        status: "SERVICE_ERROR",
        reason: "UPSTREAM_FAILURE",
        candidates: [],
      };
    }
    if (revision !== this.revision || city !== this.city)
      return this.snapshot();
    // Runtime payload is untrusted even if the port's TypeScript type says otherwise.
    try {
      if (
        !outcome ||
        !["RESULTS", "NO_RESULTS", "UNAVAILABLE", "SERVICE_ERROR"].includes(
          outcome.status,
        )
      )
        throw new Error("INVALID_OUTCOME");
      if (!Array.isArray(outcome.candidates) || outcome.candidates.length > 50)
        throw new Error("INVALID_OUTCOME");
      if (outcome.status === "RESULTS") {
        if (outcome.candidates.length === 0) throw new Error("INVALID_OUTCOME");
        const ids = new Set<string>();
        const candidates: VenueCandidate[] = [];
        for (const item of outcome.candidates) {
          if (
            !item ||
            !safeText(item.id, 160) ||
            !safeText(item.name, 160) ||
            typeof item.address !== "string" ||
            item.address.length > 400 ||
            ids.has(item.id)
          )
            throw new Error("INVALID_OUTCOME");
          ids.add(item.id);
          candidates.push({
            id: item.id,
            name: item.name,
            address: item.address,
          });
        }
        this.candidates = candidates;
      } else if (outcome.candidates.length !== 0) {
        throw new Error("INVALID_OUTCOME");
      }
      if (
        outcome.status === "UNAVAILABLE" &&
        outcome.reason !== "OFFLINE_POC" &&
        outcome.reason !== "NOT_CONFIGURED"
      )
        throw new Error("INVALID_OUTCOME");
      if (
        outcome.status === "SERVICE_ERROR" &&
        outcome.reason !== "UPSTREAM_FAILURE" &&
        outcome.reason !== "INVALID_RESPONSE" &&
        outcome.reason !== "INVALID_INPUT"
      )
        throw new Error("INVALID_OUTCOME");
      this.status = outcome.status;
      this.reason =
        outcome.status === "SERVICE_ERROR" || outcome.status === "UNAVAILABLE"
          ? outcome.reason
          : null;
    } catch {
      this.reset();
      this.status = "SERVICE_ERROR";
      this.reason = "INVALID_RESPONSE";
    }
    return this.snapshot();
  }

  chooseCandidate(id: unknown): boolean {
    if (this.status !== "RESULTS" || typeof id !== "string") return false;
    const candidate = this.candidates.find((item) => item.id === id);
    if (!candidate) return false;
    ++this.revision;
    this.selected = { ...candidate };
    this.draft = null;
    this.status = "SELECTED";
    return true;
  }

  useManual(name: unknown, address: unknown): boolean {
    if (!safeText(name, 80) || !safeText(address, 160)) return false;
    ++this.revision;
    this.selected = {
      id: "manual-only",
      name: name.trim(),
      address: address.trim(),
    };
    this.candidates = [];
    this.draft = null;
    this.reason = null;
    this.status = "MANUAL";
    return true;
  }

  confirm(): VenueDraft | null {
    if (
      (this.status !== "SELECTED" && this.status !== "MANUAL") ||
      !this.selected
    )
      return null;
    this.draft = {
      city: this.city,
      name: this.selected.name,
      address: this.selected.address,
      source: this.status === "MANUAL" ? "manual" : "mock_poi",
      status: "DRAFT_ONLY",
    };
    this.status = "CONFIRMED";
    return { ...this.draft };
  }
}
