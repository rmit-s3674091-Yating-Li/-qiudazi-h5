export type ActorScope = Readonly<{
  authUserId: string;
  profileId: string;
  epoch: string;
}>;
export type HttpMethod = "GET" | "POST";
export interface TransportPort {
  request<T>(input: {
    url: string;
    method: HttpMethod;
    jwt?: string;
    data?: unknown;
  }): Promise<{ status: number; data: T }>;
}
export interface KeyValuePort {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface UploadPort {
  upload(input: {
    url: string;
    localPath: string;
    fieldName: string;
    jwt: string;
    contentType: string;
  }): Promise<{ status: number; rawBody: string }>;
}
export interface VenuePort {
  search(
    city: string,
    query: string,
  ): Promise<ReadonlyArray<{ id: string; name: string; address: string }>>;
}
export interface SessionPort {
  getVerifiedActor(): Promise<ActorScope | null>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}
/** Not a real session. All protected actions must remain disabled in Gate 0. */
export class UnprovenSessionPort implements SessionPort {
  async getVerifiedActor(): Promise<null> {
    return null;
  }
  async refresh(): Promise<void> {
    throw new Error("SESSION_BRIDGE_UNPROVEN");
  }
  async signOut(): Promise<void> {
    /* no session to revoke */
  }
}
export class OfflineVenuePort implements VenuePort {
  async search(): Promise<[]> {
    return [];
  }
}
