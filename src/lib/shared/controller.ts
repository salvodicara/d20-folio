export type OperationStatus =
  | "pending"
  | "unknown"
  | "acknowledged"
  | "conflict"
  | "rejected"
  | "invalidated";
export interface OperationState<E, R> {
  envelope: E;
  status: OperationStatus;
  receipt?: R;
  reason?: string;
}
export interface OperationTransport<E, R> {
  commit: (envelope: E, check: () => void) => Promise<R>;
  reconcile: (envelope: E) => Promise<R | null>;
}
/** One explicit intent. Retries never mint identity; timeout makes the outcome unknown. */
export class OperationController<E, R> {
  state: OperationState<E, R>;
  private listeners = new Set<() => void>();
  private attempt = 0;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private transport: OperationTransport<E, R>;
  private options: { timeoutMs?: number };
  constructor(
    envelope: E,
    transport: OperationTransport<E, R>,
    options: { timeoutMs?: number } = {}
  ) {
    this.transport = transport;
    this.options = options;
    this.state = { envelope: structuredClone(envelope), status: "pending" };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: OperationState<E, R>) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  invalidate = () => {
    this.attempt++;
    this.running = false;
    clearTimeout(this.timer);
    this.publish({ ...this.state, status: "invalidated" });
  };
  private async execute(reconcile: boolean) {
    if (
      this.running ||
      ["acknowledged", "invalidated", "conflict", "rejected"].includes(this.state.status)
    )
      return;
    const attempt = ++this.attempt;
    const check = () => {
      if (attempt !== this.attempt || this.state.status === "invalidated")
        throw new Error("stale-session");
    };
    this.running = true;
    this.publish({ ...this.state, status: "pending", reason: undefined });
    this.timer = setTimeout(() => {
      if (attempt === this.attempt) {
        this.running = false;
        this.publish({ ...this.state, status: "unknown", reason: "timeout" });
      }
    }, this.options.timeoutMs ?? 8000);
    try {
      await Promise.resolve();
      check();
      const existing = reconcile
        ? await this.transport.reconcile(this.state.envelope)
        : null;
      check();
      const receipt =
        existing ?? (await this.transport.commit(this.state.envelope, check));
      check();
      this.publish({ ...this.state, status: "acknowledged", receipt, reason: undefined });
    } catch (error) {
      if (attempt !== this.attempt) return;
      const reason =
        error instanceof Error
          ? ((error as Error & { code?: string }).code ?? error.message)
          : "unknown";
      const status: OperationStatus =
        reason === "stale-session"
          ? "invalidated"
          : reason === "stale-base" || reason === "stale-authority"
            ? "conflict"
            : reason === "permission-denied" ||
                reason === "intent-mismatch" ||
                reason === "invalid-operation"
              ? "rejected"
              : "unknown";
      this.publish({ ...this.state, status, reason });
    } finally {
      if (attempt === this.attempt) {
        clearTimeout(this.timer);
        this.running = false;
      }
    }
  }
  submit = () => this.execute(false);
  retry = () => this.execute(true);
}
