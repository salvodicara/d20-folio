export interface IdentityScope {
  uid: string | null;
  campaignId: string | null;
  activeCharacterId: string | null;
}
/** One epoch covers auth, selection, subscriptions, private bytes and unsent writes. */
export class SessionController {
  private generation = 0;
  private current: IdentityScope = {
    uid: null,
    campaignId: null,
    activeCharacterId: null,
  };
  private cleanups = new Set<() => void>();
  scope(): Readonly<IdentityScope> {
    return { ...this.current };
  }
  transition(scope: IdentityScope): void {
    this.invalidate();
    this.current = { ...scope };
  }
  revoke(): void {
    this.invalidate();
    this.current = { uid: null, campaignId: null, activeCharacterId: null };
  }
  private invalidate(): void {
    this.generation++;
    const cleanups = [...this.cleanups];
    this.cleanups.clear();
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        /* A consumer must not prevent other private resources from being released. */
      }
    }
  }
  ticket(): () => void {
    const epoch = this.generation;
    return () => {
      if (epoch !== this.generation) throw new Error("stale-session");
    };
  }
  guard<T extends unknown[]>(callback: (...args: T) => void): (...args: T) => void {
    const epoch = this.generation;
    return (...args) => {
      if (epoch === this.generation) callback(...args);
    };
  }
  track(cleanup: () => void): () => void {
    this.cleanups.add(cleanup);
    return () => {
      this.cleanups.delete(cleanup);
      cleanup();
    };
  }
  async runWrite<T>(action: () => Promise<T>): Promise<T> {
    const check = this.ticket();
    if (!this.current.uid) throw new Error("unauthenticated");
    await Promise.resolve();
    check();
    try {
      const result = await action();
      check();
      return result;
    } catch (error) {
      check();
      throw error;
    }
  }
}
