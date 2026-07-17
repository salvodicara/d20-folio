/**
 * undoStore — the pure LIFO undo/redo stack (UNDO_SPEC §5.4 cases 1–5 + the
 * eviction / truncation math), driven with mock closures over a tiny in-memory
 * "resource" so a round-trip is asserted on real state, not just call counts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  useUndoStore,
  registerUndoable,
  registerUndoableToast,
  wireUndoToast,
  MAX_UNDO_DEPTH,
  type UndoLabel,
} from "@/stores/undoStore";
import { useToastStore } from "@/stores/toastStore";

const u = () => useUndoStore.getState();

beforeEach(() => {
  useUndoStore.setState({ characterId: null, past: [], future: [] });
  useToastStore.getState().clearAll();
});

/**
 * A mock "resource" whose `spend` returns its own inverse — the exact shape the
 * real call sites hand `registerUndoable` (execute returns the reverse-applier).
 */
function makeResource(start = 3) {
  const state = { value: start };
  const spend = (n = 1) => {
    state.value -= n;
    return () => {
      state.value += n;
    };
  };
  return { state, spend };
}

const label = (message: string): UndoLabel => ({ message });

/** Narrow a `register` result to a definite id (every mock here commits). */
function id(result: string | null): string {
  if (result === null) throw new Error("expected a registered entry id");
  return result;
}

describe("undoStore — register / undo / redo round-trips (case 1)", () => {
  it("undo → redo → undo leaves the resource identical", () => {
    const r = makeResource(3);
    registerUndoable(label("spend 1"), () => r.spend(1), { turnScoped: true });
    expect(r.state.value).toBe(2);

    // Undo: resource restored, entry moved to future.
    expect(u().undo()).toBe(true);
    expect(r.state.value).toBe(3);
    expect(u().past).toHaveLength(0);
    expect(u().future).toHaveLength(1);

    // Redo: re-runs the SAME execute, resource spent again, fresh entry on past.
    expect(u().redo()).toBe(true);
    expect(r.state.value).toBe(2);
    expect(u().past).toHaveLength(1);
    expect(u().future).toHaveLength(0);

    // Undo again: back to identical.
    expect(u().undo()).toBe(true);
    expect(r.state.value).toBe(3);
  });

  it("register clears the redo branch, keeping LIFO order across two resources", () => {
    const a = makeResource(2);
    const b = makeResource(2);
    registerUndoable(label("A"), () => a.spend(1), { turnScoped: false });
    registerUndoable(label("B"), () => b.spend(1), { turnScoped: false });
    expect(a.state.value).toBe(1);
    expect(b.state.value).toBe(1);
    // Undo top (B) then A.
    u().undo();
    expect(b.state.value).toBe(2);
    u().undo();
    expect(a.state.value).toBe(2);
  });
});

describe("undoStore — redo-branch truncation (case 2)", () => {
  it("A, B, undo B, commit C ⇒ future empty; redo no-ops", () => {
    const r = makeResource(5);
    registerUndoable(label("A"), () => r.spend(1), { turnScoped: false });
    registerUndoable(label("B"), () => r.spend(1), { turnScoped: false });
    u().undo(); // undo B → future = [B]
    expect(u().future).toHaveLength(1);
    registerUndoable(label("C"), () => r.spend(1), { turnScoped: false }); // truncates
    expect(u().future).toHaveLength(0);
    expect(u().redo()).toBe(false); // empty future → no-op
  });
});

describe("undoStore — replay does not truncate remaining future (case 3)", () => {
  it("redo keeps the deeper future entries intact", () => {
    const r = makeResource(5);
    registerUndoable(label("A"), () => r.spend(1), { turnScoped: false });
    registerUndoable(label("B"), () => r.spend(1), { turnScoped: false });
    u().undo(); // future = [B]
    u().undo(); // future = [B, A] (A on top)
    expect(u().future).toHaveLength(2);
    // Redo A: replaying flag must keep B in future.
    expect(u().redo()).toBe(true);
    expect(u().future).toHaveLength(1);
    expect(u().past).toHaveLength(1);
  });
});

describe("undoStore — redo bail on a changed resource (case 4)", () => {
  it("a null-returning re-execute drops the entry and mutates nothing", () => {
    const r = makeResource(1);
    // Execute bails (returns null) once the resource is exhausted.
    const execute = () => {
      if (r.state.value <= 0) return null;
      return r.spend(1);
    };
    registerUndoable(label("spend"), execute, { turnScoped: true });
    expect(r.state.value).toBe(0);
    u().undo();
    expect(r.state.value).toBe(1);
    // Exhaust by hand before redo.
    r.state.value = 0;
    const before = r.state.value;
    expect(u().redo()).toBe(false); // legal bail
    expect(r.state.value).toBe(before); // no mutation
    expect(u().past).toHaveLength(0); // entry dropped
    expect(u().future).toHaveLength(0);
  });
});

describe("undoStore — depth eviction (case 5)", () => {
  it("evicts the oldest past MAX_UNDO_DEPTH; a stale undo(id) no-ops", () => {
    const r = makeResource(100);
    const firstId = id(
      registerUndoable(label("first"), () => r.spend(1), { turnScoped: false })
    );
    for (let i = 0; i < MAX_UNDO_DEPTH; i++) {
      registerUndoable(label(`e${i}`), () => r.spend(1), { turnScoped: false });
    }
    expect(u().past).toHaveLength(MAX_UNDO_DEPTH);
    // The very first entry was evicted; undoing its stale id is a no-op.
    expect(u().past.some((e) => e.id === firstId)).toBe(false);
    expect(u().undo(firstId)).toBe(false);
  });
});

describe("undoStore — contextual mid-stack splice (case 6)", () => {
  it("undo(id) of an independent entry leaves the top undoable", () => {
    const a = makeResource(2);
    const b = makeResource(2);
    const idA = id(registerUndoable(label("A"), () => a.spend(1), { turnScoped: false }));
    registerUndoable(label("B"), () => b.spend(1), { turnScoped: false });
    // Contextually undo A (mid-stack) — B stays on top.
    expect(u().undo(idA)).toBe(true);
    expect(a.state.value).toBe(2);
    expect(u().past).toHaveLength(1);
    expect(u().past[0]?.label).toEqual(label("B"));
    // The remaining top (B) still undoes cleanly.
    expect(u().undo()).toBe(true);
    expect(b.state.value).toBe(2);
  });
});

describe("undoStore — purge selectivity (case 8)", () => {
  it("purgeTurnScoped drops turn-scoped entries, keeps character-state ones", () => {
    const econ = makeResource(3);
    const hp = makeResource(3);
    registerUndoable(label("attack"), () => econ.spend(1), { turnScoped: true });
    registerUndoable(label("hp"), () => hp.spend(1), { turnScoped: false });
    u().purgeTurnScoped();
    expect(u().past).toHaveLength(1);
    expect(u().past[0]?.turnScoped).toBe(false);
    // The surviving HP entry still undoes.
    expect(u().undo()).toBe(true);
    expect(hp.state.value).toBe(3);
  });

  it("purge also clears matching future entries", () => {
    const econ = makeResource(3);
    registerUndoable(label("attack"), () => econ.spend(1), { turnScoped: true });
    u().undo(); // move to future
    expect(u().future).toHaveLength(1);
    u().purgeTurnScoped();
    expect(u().future).toHaveLength(0);
  });
});

describe("undoStore — fences (case 9)", () => {
  it("clear empties both stacks; register on character B can't run A's closure", () => {
    const a = makeResource(3);
    registerUndoable(label("A-action"), () => a.spend(1), { turnScoped: false });
    // Switch to character B (clear + rebind).
    u().clear("charB");
    expect(u().characterId).toBe("charB");
    expect(u().past).toHaveLength(0);
    expect(u().future).toHaveLength(0);
    // Undo now finds nothing — A's closure is unreachable.
    expect(u().undo()).toBe(false);
    expect(a.state.value).toBe(2); // A's spend was NOT reversed by a stray undo
  });

  it("clear() with no arg keeps the current characterId", () => {
    u().clear("charA");
    const r = makeResource(2);
    registerUndoable(label("x"), () => r.spend(1), { turnScoped: false });
    u().clear();
    expect(u().characterId).toBe("charA");
    expect(u().past).toHaveLength(0);
  });
});

describe("undoStore — setToastId", () => {
  it("setToastId links an entry to its live toast", () => {
    const r = makeResource(2);
    const entryId = id(
      registerUndoable(label("keyed"), () => r.spend(1), { turnScoped: true })
    );
    u().setToastId(entryId, "toast-9");
    expect(u().past.find((e) => e.id === entryId)?.toastId).toBe("toast-9");
  });
});

const toasts = () => useToastStore.getState().toasts;

describe("undoStore — registerUndoableToast / wireUndoToast seam", () => {
  it("registerUndoableToast registers the act AND shows a linked undo toast", () => {
    const r = makeResource(3);
    const entryId = id(
      registerUndoableToast(label("spend 1"), () => r.spend(1), { turnScoped: false })
    );
    // The act committed and landed on the stack.
    expect(r.state.value).toBe(2);
    expect(u().past).toHaveLength(1);
    expect(u().past[0]?.id).toBe(entryId);
    // Exactly one toast, linked back to the entry via setToastId.
    expect(toasts()).toHaveLength(1);
    const toast = toasts()[0];
    expect(u().past[0]?.toastId).toBe(toast?.id);
    // The toast's Undo button reverses the SAME entry.
    toast?.onUndo?.();
    expect(r.state.value).toBe(3);
    expect(u().past).toHaveLength(0);
  });

  it("registerUndoableToast returns null and shows NO toast on a legal bail", () => {
    const result = registerUndoableToast(label("no-op"), () => null, {
      turnScoped: false,
    });
    expect(result).toBeNull();
    expect(u().past).toHaveLength(0);
    expect(toasts()).toHaveLength(0);
  });

  it("wireUndoToast links a toast to an already-registered entry", () => {
    const r = makeResource(2);
    const entryId = id(
      registerUndoable(label("keyed"), () => r.spend(1), { turnScoped: false })
    );
    expect(toasts()).toHaveLength(0);
    wireUndoToast(entryId, label("keyed"));
    expect(toasts()).toHaveLength(1);
    const toast = toasts()[0];
    expect(u().past[0]?.toastId).toBe(toast?.id);
    toast?.onUndo?.();
    expect(r.state.value).toBe(2);
    expect(u().past).toHaveLength(0);
  });
});
