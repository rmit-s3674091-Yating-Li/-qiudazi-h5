/** Six semantic intents; an invitation or share URL is never authorization. */
export type NavigationIntent =
  | { kind: "event_view"; eventId: string }
  | { kind: "private_preview"; eventId: string }
  | { kind: "connection_invite"; inviteRef: string }
  | { kind: "player_claim"; inviteRef: string }
  | {
      kind: "event_invite";
      inviteKind: "standard" | "doubles";
      inviteRef: string;
    }
  | { kind: "score_match"; eventId: string; matchId: string };

const idPattern = /^[a-zA-Z0-9_-]{3,80}$/;
const refPattern = /^[a-zA-Z0-9_-]{8,128}$/;
const routes = new Set([
  "event_view",
  "private_preview",
  "connection_invite",
  "player_claim",
  "event_invite",
  "score_match",
]);
function valid(value: string | undefined, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
function query(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}
export function encodeMiniPath(intent: NavigationIntent): string {
  switch (intent.kind) {
    case "event_view":
    case "private_preview":
      if (!valid(intent.eventId, idPattern))
        throw new Error("INVALID_EVENT_ID");
      return `/pages/index/index?${query({ kind: intent.kind, eventId: intent.eventId })}`;
    case "connection_invite":
    case "player_claim":
      if (!valid(intent.inviteRef, refPattern))
        throw new Error("INVALID_INVITE_REF");
      return `/pages/index/index?${query({ kind: intent.kind, ref: intent.inviteRef })}`;
    case "event_invite":
      if (intent.inviteKind !== "standard" && intent.inviteKind !== "doubles")
        throw new Error("INVALID_INVITE_KIND");
      if (!valid(intent.inviteRef, refPattern))
        throw new Error("INVALID_INVITE_REF");
      return `/pages/index/index?${query({ kind: intent.kind, inviteKind: intent.inviteKind, ref: intent.inviteRef })}`;
    case "score_match":
      if (
        !valid(intent.eventId, idPattern) ||
        !valid(intent.matchId, idPattern)
      )
        throw new Error("INVALID_MATCH");
      return `/pages/index/index?${query({ kind: intent.kind, eventId: intent.eventId, matchId: intent.matchId })}`;
    default:
      throw new Error("INVALID_INTENT_KIND");
  }
}
/** Syntax-only parser; server must revalidate permission, expiry and invite recipient. */
export function decodeMiniPath(path: string): NavigationIntent | null {
  if (
    !path.startsWith("/pages/index/index?") ||
    path.length > 512 ||
    path.split("?").length !== 2 ||
    path.includes("#") ||
    path.includes("\\")
  )
    return null;
  const params = new Map<string, string>();
  try {
    for (const segment of path.split("?")[1].split("&")) {
      const [key, value, extra] = segment.split("=");
      if (extra !== undefined || !key || value === undefined || params.has(key))
        return null;
      params.set(key, decodeURIComponent(value));
    }
  } catch {
    return null;
  }
  const kind = params.get("kind") ?? "";
  if (!routes.has(kind)) return null;
  const allowed =
    kind === "event_view" || kind === "private_preview"
      ? ["kind", "eventId"]
      : kind === "connection_invite" || kind === "player_claim"
        ? ["kind", "ref"]
        : kind === "event_invite"
          ? ["kind", "inviteKind", "ref"]
          : ["kind", "eventId", "matchId"];
  if ([...params.keys()].some((key) => !allowed.includes(key))) return null;
  if (kind === "event_view" || kind === "private_preview") {
    const eventId = params.get("eventId") ?? "";
    return valid(eventId, idPattern) ? { kind, eventId } : null;
  }
  if (kind === "connection_invite" || kind === "player_claim") {
    const inviteRef = params.get("ref") ?? "";
    return valid(inviteRef, refPattern) ? { kind, inviteRef } : null;
  }
  if (kind === "event_invite") {
    const inviteKind = params.get("inviteKind");
    const inviteRef = params.get("ref") ?? "";
    return (inviteKind === "standard" || inviteKind === "doubles") &&
      valid(inviteRef, refPattern)
      ? { kind, inviteKind, inviteRef }
      : null;
  }
  if (kind === "score_match") {
    const eventId = params.get("eventId") ?? "",
      matchId = params.get("matchId") ?? "";
    return valid(eventId, idPattern) && valid(matchId, idPattern)
      ? { kind, eventId, matchId }
      : null;
  }
  return null;
}
