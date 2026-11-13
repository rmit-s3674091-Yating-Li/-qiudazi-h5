export interface PointQueueScope {
  route: string;
  generation: number;
}

/** The same match under a different signed-in account is a different queue.
 * Do not use access tokens here: routine JWT refresh must preserve the queue. */
export function pointQueueScopeKey(route: string, authUserId: string | null | undefined): string {
  return JSON.stringify([route, authUserId ?? null]);
}

/** A -> B -> A must never revive an earlier in-flight point response. */
export function advancePointQueueScope(current: PointQueueScope, route: string): PointQueueScope {
  return current.route === route ? current : { route, generation: current.generation + 1 };
}

export function samePointQueueScope(current: PointQueueScope, captured: PointQueueScope): boolean {
  return current.route === captured.route && current.generation === captured.generation;
}
