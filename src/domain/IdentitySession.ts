export const PROFILE_CACHE_KEY = "qiudazi_profile_cache_v2";
export const GUEST_CREDENTIALS_KEY = "qiudazi_guest_credentials_v3";
export const LOGIN_REQUIRED_KEY = "qiudazi_login_required_v1";
const PRIVATE_PREFIXES = ["qiudazi_identity_", "qiudazi_pending_", "qiudazi_session_"];

type StorageLike = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

export function clearIdentityClientStorage(storage: StorageLike) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    if (key === PROFILE_CACHE_KEY || key === GUEST_CREDENTIALS_KEY || PRIVATE_PREFIXES.some((prefix) => key.startsWith(prefix))) storage.removeItem(key);
  }
}

export function markLoginRequired(storage: StorageLike) { storage.setItem(LOGIN_REQUIRED_KEY, "1"); }
export function clearLoginRequired(storage: StorageLike) { storage.removeItem(LOGIN_REQUIRED_KEY); }
export function isLoginRequired(storage: StorageLike) { return storage.getItem(LOGIN_REQUIRED_KEY) === "1"; }
