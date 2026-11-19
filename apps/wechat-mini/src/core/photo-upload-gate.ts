import type { ActorScope, SessionPort, UploadPort } from "./ports.ts";
import {
  guardedNetworkCall,
  type TrustedEndpointPolicy,
} from "./trusted-endpoint.ts";

/**
 * G1-only preflight for an explicitly selected photo. This is NOT a production
 * media service, Supabase Storage client, or authorization mechanism.
 * The inspector is a platform-owned adapter, not metadata supplied by a share.
 */
export type PhotoPurpose = "event_source" | "personal_copy";
export type PhotoSelection = Readonly<{
  localPath: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytes: number;
}>;
export type PhotoUploadInput = Readonly<{
  operationId: string;
  purpose: PhotoPurpose;
  url: string;
  localPath: string;
  expectedActor: ActorScope;
  userConfirmed: boolean;
}>;
export type PhotoUploadOutcome = Readonly<{
  status:
    | "TRANSPORT_ACCEPTED"
    | "CONSENT_REQUIRED"
    | "INVALID_INPUT"
    | "INVALID_SELECTION"
    | "UNVERIFIED"
    | "STALE_ACTOR"
    | "BUSY"
    | "REPLAY_REJECTED"
    | "REPLAY_GUARD_EXHAUSTED"
    | "UPLOAD_FAILED";
}>;

const operationPattern = /^[A-Za-z0-9_-]{8,128}$/;
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;
const maxAttempts = 256;

/**
 * Untrusted runtime objects must supply exactly the declared own data fields.
 * Never read a getter or an inherited consent/identity/media attribute.
 */
function ownDataSnapshot(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key))
    )
      return null;
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      snapshot[field] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function snapshotActor(input: unknown): ActorScope | null {
  const actor = ownDataSnapshot(input, ["authUserId", "profileId", "epoch"]);
  if (
    !actor ||
    ![actor.authUserId, actor.profileId, actor.epoch].every(
      (value) =>
        typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value),
    )
  )
    return null;
  return Object.freeze({
    authUserId: actor.authUserId as string,
    profileId: actor.profileId as string,
    epoch: actor.epoch as string,
  });
}
function sameActor(a: ActorScope, b: ActorScope): boolean {
  return (
    a.authUserId === b.authUserId &&
    a.profileId === b.profileId &&
    a.epoch === b.epoch
  );
}
function validPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 1024 &&
    !/[\u0000-\u001f\u007f\\]/.test(path) &&
    !path.split("/").some((segment) => segment === "." || segment === "..")
  );
}
function snapshotSelection(
  value: unknown,
  path: string,
): PhotoSelection | null {
  const candidate = ownDataSnapshot(value, ["localPath", "mimeType", "bytes"]);
  if (
    !candidate ||
    candidate.localPath !== path ||
    !mimeTypes.has(candidate.mimeType as string) ||
    !Number.isSafeInteger(candidate.bytes) ||
    (candidate.bytes as number) <= 0 ||
    (candidate.bytes as number) > maxBytes
  )
    return null;
  return Object.freeze({
    localPath: candidate.localPath as string,
    mimeType: candidate.mimeType as PhotoSelection["mimeType"],
    bytes: candidate.bytes as number,
  });
}
function parseInput(input: unknown): PhotoUploadInput | null {
  const v = ownDataSnapshot(input, [
    "operationId",
    "purpose",
    "url",
    "localPath",
    "expectedActor",
    "userConfirmed",
  ]);
  if (
    !v ||
    typeof v.operationId !== "string" ||
    !operationPattern.test(v.operationId) ||
    (v.purpose !== "event_source" && v.purpose !== "personal_copy") ||
    typeof v.url !== "string" ||
    !validPath(v.localPath)
  )
    return null;
  const actor = snapshotActor(v.expectedActor);
  if (!actor) return null;
  return Object.freeze({
    operationId: v.operationId,
    purpose: v.purpose,
    url: v.url,
    localPath: v.localPath,
    expectedActor: actor,
    userConfirmed: v.userConfirmed === true,
  });
}

/**
 * One controller instance is one ephemeral upload UI lifetime. The in-memory
 * replay guard is NOT durable and cannot replace server-side idempotency.
 * In particular, a stale actor AFTER upload cannot undo a remote side effect.
 */
export class PhotoUploadGate {
  private busy = false;
  private readonly attempted = new Set<string>();
  private readonly session: SessionPort;
  private readonly upload: UploadPort;
  private readonly endpoints: TrustedEndpointPolicy;
  private readonly inspect: (localPath: string) => Promise<unknown>;
  private readonly getJwt: (actor: ActorScope) => Promise<string | null>;
  private readonly expectedPurpose: PhotoPurpose;
  constructor(
    session: SessionPort,
    upload: UploadPort,
    endpoints: TrustedEndpointPolicy,
    inspect: (localPath: string) => Promise<unknown>,
    getJwt: (actor: ActorScope) => Promise<string | null>,
    expectedPurpose: PhotoPurpose,
  ) {
    if (
      expectedPurpose !== "event_source" &&
      expectedPurpose !== "personal_copy"
    )
      throw new Error("INVALID_PHOTO_PURPOSE");
    this.session = session;
    this.upload = upload;
    this.endpoints = endpoints;
    this.inspect = inspect;
    this.getJwt = getJwt;
    this.expectedPurpose = expectedPurpose;
  }

  private async actor(): Promise<ActorScope | null> {
    try {
      const actor = await this.session.getVerifiedActor();
      return snapshotActor(actor);
    } catch {
      return null;
    }
  }

  async submit(untrusted: unknown): Promise<PhotoUploadOutcome> {
    if (this.busy) return { status: "BUSY" };
    this.busy = true;
    try {
      const input = parseInput(untrusted);
      if (!input || input.purpose !== this.expectedPurpose)
        return { status: "INVALID_INPUT" };
      if (!input.userConfirmed) return { status: "CONSENT_REQUIRED" };
      if (this.attempted.has(input.operationId))
        return { status: "REPLAY_REJECTED" };
      if (this.attempted.size >= maxAttempts)
        return { status: "REPLAY_GUARD_EXHAUSTED" };
      try {
        this.endpoints.assert(input.url, true);
      } catch {
        return { status: "INVALID_INPUT" };
      }
      const before = await this.actor();
      if (!before) return { status: "UNVERIFIED" };
      if (!sameActor(before, input.expectedActor))
        return { status: "STALE_ACTOR" };
      let inspected: unknown;
      try {
        inspected = await this.inspect(input.localPath);
      } catch {
        return { status: "INVALID_SELECTION" };
      }
      const selection = snapshotSelection(inspected, input.localPath);
      if (!selection) return { status: "INVALID_SELECTION" };
      const afterInspect = await this.actor();
      if (!afterInspect || !sameActor(before, afterInspect))
        return { status: "STALE_ACTOR" };
      let jwt: string | null;
      try {
        jwt = await this.getJwt(before);
      } catch {
        return { status: "UNVERIFIED" };
      }
      // Only a G2 verified SessionPort/token source may ever reach this point.
      // The JWT is never copied to a URL, result, log, or error message here.
      if (typeof jwt !== "string" || !/^[A-Za-z0-9._-]+$/.test(jwt))
        return { status: "UNVERIFIED" };
      const beforeUpload = await this.actor();
      if (!beforeUpload || !sameActor(before, beforeUpload))
        return { status: "STALE_ACTOR" };
      // An ambiguous transport failure must not silently retry the same action.
      this.attempted.add(input.operationId);
      let status: number;
      try {
        const result = await guardedNetworkCall(
          this.endpoints,
          input.url,
          jwt,
          () =>
            this.upload.upload({
              url: input.url,
              localPath: input.localPath,
              fieldName: "file",
              jwt,
              contentType: selection.mimeType,
            }),
          true,
        );
        status = result.status;
      } catch {
        return { status: "UPLOAD_FAILED" };
      }
      const afterUpload = await this.actor();
      if (!afterUpload || !sameActor(before, afterUpload))
        return { status: "STALE_ACTOR" };
      if (!Number.isSafeInteger(status) || status < 200 || status >= 300)
        return { status: "UPLOAD_FAILED" };
      // 2xx is transport-only; server Storage/RLS and object identity unproven.
      return { status: "TRANSPORT_ACCEPTED" };
    } catch {
      return { status: "INVALID_INPUT" };
    } finally {
      this.busy = false;
    }
  }
}
