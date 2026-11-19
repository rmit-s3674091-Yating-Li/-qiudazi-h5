/**
 * A missing cache entry is not the same as a broken storage backend.
 * This pure-TS guard does not persist credentials or grant authorization.
 */
export interface StorageReadDriver {
  listKeys(): Promise<unknown>;
  readValue(key: string): Promise<unknown>;
}

const MAX_STORAGE_KEYS = 10_000;
const validKey = (key: unknown): key is string =>
  typeof key === "string" &&
  key.length > 0 &&
  key.length <= 256 &&
  !/[\u0000-\u001f\u007f]/.test(key);

/**
 * A successful Taro key-list is an array of own string DATA entries. Copy it
 * before checking presence: inherited/overridden includes(), accessors,
 * sparse entries or a changing Proxy must not manufacture a cache miss.
 * A Proxy can still lie to reflection; this is an offline boundary guard,
 * not proof that platform storage is trustworthy.
 */
function snapshotKeyList(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) throw new Error("INVALID_KEY_LIST");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Array.prototype) throw new Error("INVALID_KEY_LIST");
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor))
    throw new Error("INVALID_KEY_LIST");
  const length: unknown = lengthDescriptor.value;
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_STORAGE_KEYS
  )
    throw new Error("INVALID_KEY_LIST");
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== length + 1 ||
    ownKeys[length] !== "length" ||
    ownKeys.some((name, i) => i < length && name !== String(i))
  )
    throw new Error("INVALID_KEY_LIST");
  const seen = new Set<string>();
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      seen.has(descriptor.value)
    )
      throw new Error("INVALID_KEY_LIST");
    seen.add(descriptor.value);
  }
  return seen;
}

/**
 * Return null only after a successful key-list operation proves absence.
 * If the key is present, any read failure (including a removal race) is an
 * error, never a cache miss. Callers must not treat STORAGE_READ_FAILED as a
 * reason to create/bind a new account or to restore a prior actor's cache.
 */
export async function readStorageStrict(
  key: string,
  driver: StorageReadDriver,
): Promise<unknown> {
  if (!validKey(key)) throw new Error("INVALID_STORAGE_KEY");
  let present: boolean;
  try {
    const keys = snapshotKeyList(await driver.listKeys());
    present = keys.has(key);
  } catch {
    // Do not propagate platform messages: they may include local paths/values.
    throw new Error("STORAGE_READ_FAILED");
  }
  if (!present) return null;
  try {
    const value = await driver.readValue(key);
    if (value === undefined) throw new Error("UNDEFINED_STORED_VALUE");
    return value;
  } catch {
    throw new Error("STORAGE_READ_FAILED");
  }
}
