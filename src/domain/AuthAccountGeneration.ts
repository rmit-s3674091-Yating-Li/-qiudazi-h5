/** Account-scoped UI/cache invalidation token; JWT refresh for the same actor is stable. */
export class AuthAccountGeneration {
  private currentUserId: string | null = null;
  private currentGeneration = 0;

  get userId(): string | null { return this.currentUserId; }
  get version(): number { return this.currentGeneration; }

  observe(userId: string | null): { changed: boolean; generation: number } {
    const changed = this.currentUserId !== userId;
    if (changed) {
      this.currentUserId = userId;
      this.currentGeneration += 1;
    }
    return { changed, generation: this.currentGeneration };
  }

  isCurrent(userId: string | null, generation: number): boolean {
    return this.currentUserId === userId && this.currentGeneration === generation;
  }
}
