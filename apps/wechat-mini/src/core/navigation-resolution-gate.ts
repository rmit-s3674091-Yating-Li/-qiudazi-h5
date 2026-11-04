/** Offline-only guard for asynchronous NavigationIntent resolution.
 * This is NOT authentication, server authorization or a token store.
 * Call invalidate() on logout, account switch, onHide and new user selection.
 */
export type ResolutionTicket = Readonly<{
  generation: number;
  request: number;
  account: string;
}>;

export type ResolutionResult<T> =
  | { status: "CURRENT"; value: T }
  | { status: "STALE" };

export function createNavigationResolutionGate() {
  let generation = 0;
  let request = 0;
  let account: string | null = null;

  function invalidate(): void {
    generation += 1;
    request += 1;
    account = null;
  }

  /** Must be called only after trusted auth state is established. */
  function establishAccount(trustedAuthUid: string): void {
    invalidate();
    if (
      typeof trustedAuthUid !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trustedAuthUid,
      )
    )
      throw new Error("INVALID_AUTH_UID");
    account = trustedAuthUid;
  }

  /** Each explicit selection supersedes earlier pending navigation. */
  function begin(): ResolutionTicket | null {
    if (account === null) return null;
    request += 1;
    return Object.freeze({ generation, request, account });
  }

  function current(ticket: ResolutionTicket): boolean {
    return (
      account !== null &&
      ticket.account === account &&
      ticket.generation === generation &&
      ticket.request === request
    );
  }

  async function resolve<T>(
    ticket: ResolutionTicket,
    action: () => Promise<T>,
  ): Promise<ResolutionResult<T>> {
    if (!current(ticket)) return { status: "STALE" };
    try {
      const value = await action();
      return current(ticket)
        ? { status: "CURRENT", value }
        : { status: "STALE" };
    } catch (error) {
      if (!current(ticket)) return { status: "STALE" };
      throw error;
    }
  }

  return { invalidate, establishAccount, begin, current, resolve };
}
