/**
 * #1365 — the record of current-HP clamps a command caused, so its undo entry puts
 * the HP back with the cause (selling or unattuning the item and the clamp undo
 * together). The character store writes a clamp here; the undo registration records
 * the clamps its command made and replays them backwards. Pure and store-free, so
 * both stores import it without a cycle.
 */

/** One clamp: the character's current HP went from `from` down to `to`. */
export interface HpClamp {
  characterId: string;
  from: number;
  to: number;
}

let recording: HpClamp[] | null = null;

/**
 * Clamps made outside a recorded command, kept until the current task ends. A
 * handler that mutates first and registers its undo after (`registerUndoableResult`,
 * a hand-registered entry) does both in one synchronous run, so the registration
 * takes them; a clamp from an earlier, finished command is gone by then.
 */
let pending: HpClamp[] = [];

/** Note a clamp: into the recorded command, else into this task's pending list. */
export function noteHpClamp(clamp: HpClamp): void {
  if (recording) {
    recording.push(clamp);
    return;
  }
  if (pending.length === 0) {
    queueMicrotask(() => {
      pending = [];
    });
  }
  pending.push(clamp);
}

/** Take this task's pending clamps (an undo entry registered after its mutation). */
export function takePendingHpClamps(): HpClamp[] {
  const taken = pending;
  pending = [];
  return taken;
}

/** Run a command and return what it returned with the clamps it caused. Nested
 *  recordings share the outer list. */
export function recordHpClamps<T>(run: () => T): { result: T; clamps: HpClamp[] } {
  if (recording) {
    const start = recording.length;
    const result = run();
    return { result, clamps: recording.slice(start) };
  }
  recording = [];
  try {
    const result = run();
    return { result, clamps: recording };
  } finally {
    recording = null;
  }
}

/**
 * Per character, the first `from` and the last `to` of a command's clamps (two
 * clamps in one command undo to the HP before the first).
 */
export function netHpClamps(clamps: readonly HpClamp[]): HpClamp[] {
  const net = new Map<string, HpClamp>();
  for (const clamp of clamps) {
    const seen = net.get(clamp.characterId);
    net.set(clamp.characterId, seen ? { ...seen, to: clamp.to } : clamp);
  }
  return [...net.values()];
}

let restorer: ((clamp: HpClamp) => void) | null = null;

/** The character store says how a clamp is put back (once, at module load). */
export function setHpClampRestorer(restore: (clamp: HpClamp) => void): void {
  restorer = restore;
}

/** Put a command's clamps back, after its cause was undone. */
export function restoreHpClamps(clamps: readonly HpClamp[]): void {
  for (const clamp of netHpClamps(clamps)) restorer?.(clamp);
}
