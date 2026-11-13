import type {
  LoginCodePort,
  LoginCodeResult,
} from "../core/wechat-login-attempt.ts";

/** Minimal injectable Taro.login surface; no Supabase session. */
export type TaroLoginApi = Readonly<{
  login(options?: { timeout?: number }): Promise<unknown>;
}>;

/** Never log or persist one-time codes. */
export function createWechatLoginPort(api: TaroLoginApi): LoginCodePort {
  return {
    async login(): Promise<LoginCodeResult> {
      if (!api || typeof api.login !== "function")
        throw new Error("WX_LOGIN_UNAVAILABLE");
      const response: unknown = await api.login({ timeout: 10000 });
      if (!response || typeof response !== "object") return {};
      const descriptor = Object.getOwnPropertyDescriptor(response, "code");
      if (!descriptor || !("value" in descriptor)) return {};
      return { code: descriptor.value };
    },
  };
}

/** Encode exactly 16 bytes supplied by a verified secure random source. */
export function hexIdentifier(randomBytes: Uint8Array): string {
  if (!(randomBytes instanceof Uint8Array) || randomBytes.length !== 16)
    throw new Error("SECURE_RANDOM_REQUIRED");
  return Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
