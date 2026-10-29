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
  let keys: unknown;
  try {
    keys = await driver.listKeys();
    if (!Array.isArray(keys) || keys.length > MAX_STORAGE_KEYS)
      throw new Error("INVALID_KEY_LIST");
    for (const item of keys) {
      if (typeof item !== "string") throw new Error("INVALID_KEY_LIST");
    }
  } catch {
    // Do not propagate platform messages: they may include local paths/values.
    throw new Error("STORAGE_READ_FAILED");
  }
  let present: boolean;
  try {
    present = (keys as string[]).includes(key);
  } catch {
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
