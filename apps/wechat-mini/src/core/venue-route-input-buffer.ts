/**
 * Immediate input values for the credential-free venue-route PoC.
 * React state can lag behind an onInput callback within the same event turn.
 * This buffer is NOT a trusted venue source or a persistence boundary.
 */
export type OfflineVenueIdentityField = "query" | "name" | "address";

export class OfflineVenueRouteInputBuffer {
  private values: Record<OfflineVenueIdentityField, string> = {
    query: "模拟",
    name: "",
    address: "",
  };

  update(field: OfflineVenueIdentityField, value: unknown): boolean {
    if (
      (field !== "query" && field !== "name" && field !== "address") ||
      typeof value !== "string"
    )
      return false;
    this.values[field] = value;
    return true;
  }

  searchQuery(): string {
    return this.values.query;
  }

  manualValues(): Readonly<{ name: string; address: string }> {
    return { name: this.values.name, address: this.values.address };
  }
}
