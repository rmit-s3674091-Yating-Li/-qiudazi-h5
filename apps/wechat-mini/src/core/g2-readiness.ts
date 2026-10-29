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
  sessionBridge: "SESSION_VERIFIED" | "SESSION_BRIDGE_UNPROVEN";
}>;

/** Fail closed: only explicit TEST evidence can advance the gate. */
export const evaluateG2Readiness = (
  evidence: Partial<G2Evidence>,
): G2Readiness => {
  if (!evidence || typeof evidence !== "object") {
    return {
      status: "G2_BLOCKED",
      missing: G2_EVIDENCE_KEYS,
      sessionBridge: "SESSION_BRIDGE_UNPROVEN",
    };
  }
  const missing = G2_EVIDENCE_KEYS.filter((key) => evidence[key] !== true);
  return {
    status: missing.length === 0 ? "G2_READY_FOR_TEST" : "G2_BLOCKED",
    missing,
    sessionBridge:
      missing.length === 0 ? "SESSION_VERIFIED" : "SESSION_BRIDGE_UNPROVEN",
  };
};
