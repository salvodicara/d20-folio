/**
 * The shape gate (#1320): once this client reads a document written in a newer shape
 * (a migration ran), it must stop writing — the rules would refuse its old shape, and
 * a write that slipped through would overwrite migrated data. Every writer checks
 * {@link writesFenced}; the reload screen watches {@link subscribeShapeGate}.
 * Dependency-free: the eager persistence layer imports it.
 *
 * Closed until the page reloads. A later close never hides what an earlier one knew
 * about the unsaved edits: only a close that knew of none ("none", e.g. a reader with
 * no handler of its own) gives way to one that has edits to keep.
 */

/** What happened to this tab's unsaved edits when the gate closed. */
export type RescueOutcome = "saving" | "kept" | "failed" | "none";
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
  if (state.closed && (state.rescue !== "none" || outcome.rescue === "none")) return;
  state = { closed: true, rescue: outcome.rescue };
  for (const listener of listeners) listener();
}

/** The rescue copy finished writing (only a gate still "saving" moves). */
export function settleShapeGateRescue(outcome: "kept" | "failed"): void {
  if (!state.closed || state.rescue !== "saving") return;
  state = { closed: true, rescue: outcome };
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
