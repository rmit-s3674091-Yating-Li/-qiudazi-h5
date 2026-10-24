/**
 * Offline PoC network guard. Exact HTTPS origins only: never send Supabase JWT
 * to a user-supplied URL, map/POI host or a lookalike subdomain.
 * This does not prove WeChat's redirect behavior or legal-domain configuration.
 */
export type TrustedEndpointConfig = Readonly<{
  credentialOrigins: readonly string[]
  anonymousOrigins?: readonly string[]
}>

export interface TrustedEndpointPolicy {
  assert(url: string, carriesCredential: boolean): void
}

const originPattern = /^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::443)?$/i
const absolutePattern = /^(https:\/\/[a-z0-9.-]+(?::443)?)(\/[^#\\\s]*)$/i
const forbiddenQueryKeys = new Set([
  'access_token', 'refresh_token', 'token_hash', 'session_key', 'sessionkey',
  'login_code', 'id_token', 'authorization', 'client_secret', 'app_secret', 'appsecret',
])

/**
 * Query keys are decoded ONCE before inspection. A raw regex misses keys such
 * as %61ccess_token, which the server may interpret as access_token. Fail
 * closed on malformed/ambiguous names; never parse or log query values here.
 */
function hasUnsafeQueryKey(url: string): boolean {
  const index = url.indexOf('?')
  if (index < 0) return false
  const query = url.slice(index + 1)
  if (!query) return true
  for (const pair of query.split('&')) {
    const [rawKey] = pair.split('=', 1)
    let key: string
    try { key = decodeURIComponent(rawKey.replace(/\+/g, ' ')) }
    catch { return true }
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(key) ||
        forbiddenQueryKeys.has(key.toLowerCase())) return true
  }
  return false
}

function normalizeOrigin(value: string): string {
  if (typeof value !== 'string' || !originPattern.test(value)) throw new Error('INVALID_TRUSTED_ORIGIN')
  const host = originPattern.exec(value)![1].toLowerCase()
  if (host.includes('..') || host.startsWith('.') || host.endsWith('.') ||
      host.split('.').some(label => label.startsWith('-') || label.endsWith('-'))) {
    throw new Error('INVALID_TRUSTED_ORIGIN')
  }
  return `https://${host}`
}

/** Hostnames are compared exactly; wildcard domains and http:// are forbidden. */
export function createTrustedEndpointPolicy(config: TrustedEndpointConfig): TrustedEndpointPolicy {
  if (!config || !Array.isArray(config.credentialOrigins) || config.credentialOrigins.length === 0 ||
      (config.anonymousOrigins !== undefined && !Array.isArray(config.anonymousOrigins))) {
    throw new Error('MISSING_TRUSTED_ORIGINS')
  }
  const credentials = new Set(config.credentialOrigins.map(normalizeOrigin))
  const anonymous = new Set([...credentials, ...(config.anonymousOrigins ?? []).map(normalizeOrigin)])
  return {
    assert(url: string, carriesCredential: boolean): void {
      if (typeof url !== 'string' || url.length > 2048 || /[\u0000-\u001f\u007f]/.test(url) ||
          hasUnsafeQueryKey(url)) throw new Error('UNTRUSTED_ENDPOINT')
      const match = absolutePattern.exec(url)
      if (!match) throw new Error('UNTRUSTED_ENDPOINT')
      const origin = normalizeOrigin(match[1])
      const path = match[2].split('?')[0]
      if (path.startsWith('//') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path) ||
          /%(?:2e|2f|5c)/i.test(path)) throw new Error('UNTRUSTED_ENDPOINT')
      if (!(carriesCredential ? credentials : anonymous).has(origin)) throw new Error('UNTRUSTED_ENDPOINT')
    },
  }
}

/** Tests can inject a spy in place of Taro; guard runs before any network call. */
export async function guardedNetworkCall<T>(
  policy: TrustedEndpointPolicy,
  url: string,
  jwt: string | undefined,
  invoke: () => Promise<T>,
  requireCredential = false,
): Promise<T> {
  if (requireCredential && jwt === undefined) throw new Error('AUTH_REQUIRED')
  if (jwt !== undefined && (typeof jwt !== 'string' || !jwt.trim() || /[\r\n]/.test(jwt))) {
    throw new Error('INVALID_JWT')
  }
  policy.assert(url, jwt !== undefined)
  return invoke()
}
