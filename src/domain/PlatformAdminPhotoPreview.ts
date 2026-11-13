/** Strict browser contract for the short-lived, watermarked admin preview. */
export type AdminPhotoPreview = { url: string; expiresIn: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validAdminPhotoId(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

export function parseAdminPhotoPreview(value: unknown, supabaseUrl: string): AdminPhotoPreview | null {
  if (!record(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, "url") || !Object.hasOwn(value, "expires_in") ||
      typeof value.url !== "string" || value.url.length > 4096 || value.url.includes("%") ||
      typeof value.expires_in !== "number" || !Number.isSafeInteger(value.expires_in) ||
      value.expires_in < 1 || value.expires_in > 60) return null;
  try {
    const backend = new URL(supabaseUrl);
    const signed = new URL(value.url);
    const pathPrefix = "/storage/v1/object/sign/event-photos/";
    if (backend.protocol !== "https:" || signed.protocol !== "https:" ||
        signed.origin !== backend.origin || signed.username || signed.password || signed.hash ||
        !signed.pathname.startsWith(pathPrefix) || signed.pathname.length <= pathPrefix.length ||
        signed.pathname.includes("//") || signed.pathname.includes("%") ||
        [...signed.searchParams.keys()].some((key) => key !== "token") ||
        signed.searchParams.getAll("token").length !== 1 ||
        !signed.searchParams.get("token")) return null;
    return { url: value.url, expiresIn: value.expires_in };
  } catch {
    return null;
  }
}
