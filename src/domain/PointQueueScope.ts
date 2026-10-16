export interface PointQueueScope {
  route: string;
  generation: number;
}

/** A -> B -> A must never revive an earlier in-flight point response. */
export function advancePointQueueScope(current: PointQueueScope, route: string): PointQueueScope {
  return current.route === route ? current : { route, generation: current.generation + 1 };
}

export function samePointQueueScope(current: PointQueueScope, captured: PointQueueScope): boolean {
  return current.route === captured.route && current.generation === captured.generation;
}
