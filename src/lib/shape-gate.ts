/**
 * The shape gate (#1320): once this client reads a document written in a newer shape
 * (a migration ran), it must stop writing — the rules would refuse its old shape, and
 * a write that slipped through would overwrite migrated data. Every writer checks
 * {@link writesFenced}; the reload screen watches {@link subscribeShapeGate}.
 * Dependency-free: the eager persistence layer imports it.
 *
 * Closed until the page reloads. The FIRST close wins: it is the one that knows
 * whether unsaved edits were kept as a rescue copy, and a later close (another
 * document, no edits) must not hide that.
 */

/** What happened to this tab's unsaved edits when the gate closed. */
export type RescueOutcome = "kept" | "failed" | "none";
export type ShapeGateState = { closed: false } | { closed: true; rescue: RescueOutcome };

let state: ShapeGateState = { closed: false };
const listeners = new Set<() => void>();

export function writesFenced(): boolean {
  return state.closed;
}

export function shapeGateState(): ShapeGateState {
  return state;
}

export function closeShapeGate(outcome: { rescue: RescueOutcome }): void {
  if (state.closed) return;
  state = { closed: true, rescue: outcome.rescue };
  for (const listener of listeners) listener();
}

export function subscribeShapeGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetShapeGateForTests(): void {
  state = { closed: false };
  listeners.clear();
}
