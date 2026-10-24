import { decodeMiniPath, type NavigationIntent } from './navigation.ts'

/**
 * Taro useRouter() exposes a page path and an already-parsed query object.
 * Do not treat its query as an authorization token or reconstruct a URL with
 * string concatenation: percent encoding and prototype properties matter.
 * The return value is only a navigation hint for a later server-side check.
 */
export function decodeMiniLaunchIntent(path: unknown, params: unknown): NavigationIntent | null {
  if (typeof path !== 'string' || !/^\/?pages\/index\/index$/.test(path)) return null
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null
  const proto = Object.getPrototypeOf(params)
  if (proto !== Object.prototype && proto !== null) return null
  if (Reflect.ownKeys(params).some(key => typeof key !== 'string')) return null

  const descriptors = Object.getOwnPropertyDescriptors(params)
  const entries = Object.entries(descriptors)
  if (entries.length < 2 || entries.length > 4) return null
  const pairs: string[] = []
  for (const [key, descriptor] of entries) {
    if (!descriptor.enumerable || !('value' in descriptor) ||
        !/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) ||
        typeof descriptor.value !== 'string') return null
    pairs.push(`${key}=${encodeURIComponent(descriptor.value)}`)
  }
  const candidate = `/pages/index/index?${pairs.join('&')}`
  if (candidate.length > 512) return null
  return decodeMiniPath(candidate)
}
