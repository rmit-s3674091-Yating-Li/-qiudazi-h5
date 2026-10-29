/** Wire contract proposal only. No production endpoint or session issuer exists. */
export type WechatExchangeRequest = Readonly<{
  login_code: string;
  request_id: string;
  client_nonce: string;
}>;
export type ExchangeStatus =
  | "WECHAT_VERIFIED_UNBOUND"
  | "BINDING_CHALLENGE_REQUIRED"
  | "CONFLICT_LOCKED"
  | "SESSION_BRIDGE_UNPROVEN"
  | "SESSION_VERIFIED";
export type ExchangeResponse = Readonly<{
  status: ExchangeStatus;
  correlation_id: string;
  next_action: "BIND" | "RETRY" | "NONE";
}>;
export type TrustedActor = Readonly<{
  auth_user_id: string;
  profile_id: string;
  session_epoch: string;
}>;
export interface IdentityExchangePort {
  exchange(request: WechatExchangeRequest): Promise<ExchangeResponse>;
  /** Only server-verified Supabase JWT/refresh session may advance to ACTIVE. */
  getVerifiedActor(): Promise<TrustedActor | null>;
}
export const SESSION_BRIDGE_UNPROVEN = "SESSION_BRIDGE_UNPROVEN" as const;
