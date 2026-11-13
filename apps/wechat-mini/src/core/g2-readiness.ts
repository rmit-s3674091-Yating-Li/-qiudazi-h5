import type {
  IdentityExchangePort,
  TrustedActor,
  WechatExchangeRequest,
} from "./session-contract.ts";

/**
 * TEST-only contract for the future WeChat -> Supabase session bridge.
 * Implementations must keep code2Session secrets and all provider session material server-side.
 */
export interface G2SessionBridgePort extends IdentityExchangePort {
  exchange(request: WechatExchangeRequest): Promise<{
    status:
      | "BINDING_CHALLENGE_REQUIRED"
      | "CONFLICT_LOCKED"
      | "SESSION_BRIDGE_UNPROVEN"
      | "SESSION_VERIFIED";
    correlation_id: string;
    next_action: "BIND" | "RETRY" | "NONE";
  }>;
  /** Must be backed by a server-verified Supabase identity, never decoded client claims. */
  getVerifiedActor(): Promise<TrustedActor | null>;
}

export type G2Evidence = Readonly<{
  wechatCodeSingleUse: boolean;
  supabaseUserVerified: boolean;
  refreshRotationVerified: boolean;
  signOutRevocationVerified: boolean;
  legacyProfileUnique: boolean;
  duplicateProfileRejected: boolean;
  selfRlsAllowed: boolean;
  foreignRlsDenied: boolean;
  adminSeparatedByAuthUser: boolean;
  ownMediaAllowed: boolean;
  foreignMediaDenied: boolean;
  networkOnWechatDevtools: boolean;
  actorScopedStorageOnWechatDevtools: boolean;
  shareResumeOnWechatDevtools: boolean;
  pageReturnOnWechatDevtools: boolean;
}>;

export const G2_EVIDENCE_KEYS = Object.freeze([
  "wechatCodeSingleUse",
  "supabaseUserVerified",
  "refreshRotationVerified",
  "signOutRevocationVerified",
  "legacyProfileUnique",
  "duplicateProfileRejected",
  "selfRlsAllowed",
  "foreignRlsDenied",
  "adminSeparatedByAuthUser",
  "ownMediaAllowed",
  "foreignMediaDenied",
  "networkOnWechatDevtools",
  "actorScopedStorageOnWechatDevtools",
  "shareResumeOnWechatDevtools",
  "pageReturnOnWechatDevtools",
] as const satisfies readonly (keyof G2Evidence)[]);

export type G2Readiness = Readonly<{
  status: "G2_READY_FOR_TEST" | "G2_BLOCKED";
  missing: readonly (keyof G2Evidence)[];
  sessionBridge: "SESSION_BRIDGE_UNPROVEN";
  evidenceLevel: "OFFLINE_DECLARATION_ONLY";
}>;

/**
 * This is a local checklist, NOT a TEST evidence verifier or session issuer.
 * Even all-true flags cannot prove a refreshable Supabase session. A separate
 * authorized server-side attestation is required to advance Auth to verified.
 * Reject inherited, accessor, proxy-throwing and unknown evidence fields.
 */
function readEvidenceFlags(
  input: unknown,
): Record<string, boolean | undefined> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const allowed = new Set<string>(G2_EVIDENCE_KEYS);
    const flags: Record<string, boolean | undefined> = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string" || !allowed.has(key)) return null;
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) return null;
      const value: unknown = descriptor.value;
      if (value !== undefined && typeof value !== "boolean") return null;
      flags[key] = value;
    }
    return flags;
  } catch {
    return null;
  }
}

export const evaluateG2Readiness = (evidence: unknown): G2Readiness => {
  const flags = readEvidenceFlags(evidence);
  const missing = Object.freeze(
    flags
      ? G2_EVIDENCE_KEYS.filter((key) => flags[key] !== true)
      : [...G2_EVIDENCE_KEYS],
  );
  return Object.freeze({
    status: flags && missing.length === 0 ? "G2_READY_FOR_TEST" : "G2_BLOCKED",
    missing,
    // No local boolean checklist is permitted to assert real Auth success.
    sessionBridge: "SESSION_BRIDGE_UNPROVEN",
    evidenceLevel: "OFFLINE_DECLARATION_ONLY",
  });
};
