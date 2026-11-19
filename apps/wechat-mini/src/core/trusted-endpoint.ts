/**
 * Offline PoC network guard. Exact HTTPS origins only: never send Supabase JWT
 * to a user-supplied URL, map/POI host or a lookalike subdomain.
 * This does not prove WeChat's redirect behavior or legal-domain configuration.
 */
export type TrustedEndpointConfig = Readonly<{
  credentialOrigins: readonly string[];
  anonymousOrigins?: readonly string[];
}>;

export interface TrustedEndpointPolicy {
  assert(url: string, carriesCredential: boolean): void;
}

const originPattern =
  /^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::443)?$/i;
const absolutePattern = /^(https:\/\/[a-z0-9.-]+(?::443)?)(\/[^#\\\s]*)$/i;
const forbiddenQueryKeys = new Set([
  "access_token",
  "refresh_token",
  "token_hash",
  "session_key",
  "sessionkey",
  "login_code",
  "id_token",
  "authorization",
  "client_secret",
  "app_secret",
  "appsecret",
]);

/**
 * Query keys are decoded ONCE before inspection. A raw regex misses keys such
 * as %61ccess_token, which the server may interpret as access_token. Fail
 * closed on malformed/ambiguous names; never parse or log query values here.
 */
function hasUnsafeQueryKey(url: string): boolean {
  const index = url.indexOf("?");
  if (index < 0) return false;
  const query = url.slice(index + 1);
  if (!query) return true;
  for (const pair of query.split("&")) {
    const [rawKey] = pair.split("=", 1);
    let key: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " "));
    } catch {
      return true;
    }
    if (
      !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(key) ||
      forbiddenQueryKeys.has(key.toLowerCase())
    )
      return true;
  }
  return false;
}

function normalizeOrigin(value: string): string {
  if (typeof value !== "string" || !originPattern.test(value))
    throw new Error("INVALID_TRUSTED_ORIGIN");
  const host = originPattern.exec(value)![1].toLowerCase();
  if (
    host.includes("..") ||
    host.startsWith(".") ||
    host.endsWith(".") ||
    host
      .split(".")
      .some((label) => label.startsWith("-") || label.endsWith("-"))
  ) {
    throw new Error("INVALID_TRUSTED_ORIGIN");
  }
  return `https://${host}`;
}

/**
 * Treat origin configuration as untrusted runtime data. A mutable array can
 * override .map(), hide holes, or supply accessor elements. Snapshot only own
 * data descriptors before granting a host permission to receive a bearer.
 */
function snapshotOrigins(value: unknown, required: boolean): string[] {
  if (!Array.isArray(value))
    throw new Error(
      required ? "MISSING_TRUSTED_ORIGINS" : "INVALID_TRUSTED_ORIGIN",
    );
  if (Object.getPrototypeOf(value) !== Array.prototype)
    throw new Error("INVALID_TRUSTED_ORIGIN");
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (!length || !("value" in length) || !Number.isSafeInteger(length.value))
    throw new Error("INVALID_TRUSTED_ORIGIN");
  const count: number = length.value;
  if (required && count === 0) throw new Error("MISSING_TRUSTED_ORIGINS");
  if (Reflect.ownKeys(value).length !== count + 1)
    throw new Error("INVALID_TRUSTED_ORIGIN");
  const origins: string[] = [];
  for (let i = 0; i < count; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor))
      throw new Error("INVALID_TRUSTED_ORIGIN");
    origins.push(normalizeOrigin(descriptor.value));
  }
  return origins;
}

function snapshotTrustedConfig(config: TrustedEndpointConfig): {
  credentials: string[];
  anonymous: string[];
} {
  if (!config || typeof config !== "object")
    throw new Error("MISSING_TRUSTED_ORIGINS");
  try {
    const proto = Object.getPrototypeOf(config);
    if (proto !== Object.prototype && proto !== null)
      throw new Error("INVALID_TRUSTED_ORIGIN");
    const descriptors = Object.getOwnPropertyDescriptors(config);
    const keys = Reflect.ownKeys(config);
    if (
      keys.some(
        (key) => key !== "credentialOrigins" && key !== "anonymousOrigins",
      ) ||
      !descriptors.credentialOrigins ||
      !("value" in descriptors.credentialOrigins) ||
      (descriptors.anonymousOrigins &&
        !("value" in descriptors.anonymousOrigins))
    )
      throw new Error("INVALID_TRUSTED_ORIGIN");
    return {
      credentials: snapshotOrigins(descriptors.credentialOrigins.value, true),
      anonymous:
        descriptors.anonymousOrigins?.value === undefined
          ? []
          : snapshotOrigins(descriptors.anonymousOrigins.value, false),
    };
  } catch (error) {
    // Revoked proxies and hostile reflection traps fail closed, without logging
    // their contents or leaking a supplied origin/credential into an error.
    if (
      error instanceof Error &&
      (error.message === "MISSING_TRUSTED_ORIGINS" ||
        error.message === "INVALID_TRUSTED_ORIGIN")
    )
      throw error;
    throw new Error("INVALID_TRUSTED_ORIGIN");
  }
}

/** Hostnames are compared exactly; wildcard domains and http:// are forbidden. */
export function createTrustedEndpointPolicy(
  config: TrustedEndpointConfig,
): TrustedEndpointPolicy {
  const snapshot = snapshotTrustedConfig(config);
  const credentials = new Set(snapshot.credentials);
  const anonymous = new Set([...credentials, ...snapshot.anonymous]);
  return {
    assert(url: string, carriesCredential: boolean): void {
      if (
        typeof url !== "string" ||
        url.length > 2048 ||
        /[\u0000-\u001f\u007f]/.test(url) ||
        hasUnsafeQueryKey(url)
      )
        throw new Error("UNTRUSTED_ENDPOINT");
      const match = absolutePattern.exec(url);
      if (!match) throw new Error("UNTRUSTED_ENDPOINT");
      const origin = normalizeOrigin(match[1]);
      const path = match[2].split("?")[0];
      if (
        path.startsWith("//") ||
        /(?:^|\/)\.{1,2}(?:\/|$)/.test(path) ||
        /%(?:2e|2f|5c)/i.test(path)
      )
        throw new Error("UNTRUSTED_ENDPOINT");
      if (!(carriesCredential ? credentials : anonymous).has(origin))
        throw new Error("UNTRUSTED_ENDPOINT");
    },
  };
}

/**
 * A bearer token must never be copied into a URL path or query value, even
 * when the query key itself looks harmless. Inspect a bounded number of URL
 * decoding layers without recording the token or the URL in errors. This is
 * defense in depth; it does not establish redirect or platform URL behavior.
 */
function assertCredentialNotInUrl(url: string, credential: string): void {
  const match = absolutePattern.exec(url);
  if (!match) throw new Error("UNTRUSTED_ENDPOINT");
  let pathAndQuery = match[2];
  for (let depth = 0; depth < 8; depth++) {
    if (pathAndQuery.includes(credential)) throw new Error("CREDENTIAL_IN_URL");
    if (!pathAndQuery.includes("%")) return;
    try {
      pathAndQuery = decodeURIComponent(pathAndQuery);
    } catch {
      // Ambiguous URL encodings are not suitable for bearer requests.
      throw new Error("UNTRUSTED_ENDPOINT");
    }
  }
  if (pathAndQuery.includes(credential)) throw new Error("CREDENTIAL_IN_URL");
  if (pathAndQuery.includes("%")) throw new Error("UNTRUSTED_ENDPOINT");
}

/** Tests can inject a spy in place of Taro; guard runs before any network call. */
export async function guardedNetworkCall<T>(
  policy: TrustedEndpointPolicy,
  url: string,
  jwt: string | undefined,
  invoke: () => Promise<T>,
  requireCredential = false,
): Promise<T> {
  if (requireCredential && jwt === undefined) throw new Error("AUTH_REQUIRED");
  if (
    jwt !== undefined &&
    (typeof jwt !== "string" || !/^[A-Za-z0-9._-]+$/.test(jwt))
  ) {
    throw new Error("INVALID_JWT");
  }
  policy.assert(url, jwt !== undefined);
  if (jwt !== undefined) assertCredentialNotInUrl(url, jwt);
  return invoke();
}
