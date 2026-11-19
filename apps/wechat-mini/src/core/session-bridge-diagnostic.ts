/** Safe, offline-only session-bridge diagnostic. Never serialize provider payloads. */
export type BridgePhase =
  | "WX_LOGIN"
  | "CODE_EXCHANGE"
  | "SUPABASE_SESSION"
  | "REFRESH"
  | "LEGACY_BIND";
export type BridgeFailure =
  | "UNCONFIGURED"
  | "NETWORK"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "SESSION_UNPROVEN"
  | "CONFLICT"
  | "DENIED";
export type SafeBridgeDiagnostic = Readonly<{
  schema: 1;
  phase: BridgePhase;
  reason: BridgeFailure;
  authReady: false;
  retryable: boolean;
}>;
const phases: readonly string[] = [
  "WX_LOGIN",
  "CODE_EXCHANGE",
  "SUPABASE_SESSION",
  "REFRESH",
  "LEGACY_BIND",
];
const reasons: readonly string[] = [
  "UNCONFIGURED",
  "NETWORK",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "SESSION_UNPROVEN",
  "CONFLICT",
  "DENIED",
];
/** Unknown values fail closed; no Error.message, stack, code, openid, tokens, or raw response. */
export function safeBridgeDiagnostic(
  phase: unknown,
  reason: unknown,
): SafeBridgeDiagnostic {
  const p: BridgePhase =
    typeof phase === "string" && phases.includes(phase)
      ? (phase as BridgePhase)
      : "CODE_EXCHANGE";
  const r: BridgeFailure =
    typeof reason === "string" && reasons.includes(reason)
      ? (reason as BridgeFailure)
      : "INVALID_RESPONSE";
  return Object.freeze({
    schema: 1,
    phase: p,
    reason: r,
    authReady: false,
    retryable: r === "NETWORK" || r === "TIMEOUT",
  });
}
