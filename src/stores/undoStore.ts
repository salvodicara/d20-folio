/**
 * Undo Store — the session undo/redo stack (⌘Z / ⌘⇧Z + the topbar control).
 *
 * Every undoable act in the app already produces a hand-written reverse-applier
 * closure (the cost-engine's op inverse, `commitAction`'s return, the HP snapshot
 * restore, the store's condition/concentration `onUndo`s). Historically each
 * closure's ONLY home was a 5-second toast, after which the capability was thrown
 * away. This store gives every reverse-applier a durable, per-character, in-memory
 * LIFO home with standard redo semantics — one source of truth (golden rule 6):
 * toasts, the topbar control, and the keyboard all *reference*
 * the same `UndoEntry`, never a private copy.
 *
 * ─── SCOPE (own-sheet-only — DECIDED) ─────────────────────────────────────────
 * The stack covers ONLY the signed-in owner's open character document
 * (`/users/{uid}/characters/{charId}` + its `combat/state` subdoc) — the
 * single-writer surface. **No `registerUndoable` / `useUndoStore` import may
 * appear under `src/features/campaigns/`** (checked at review): shared documents
 * (encounter combatant HP the DM edits, Treasury, SharedNotes, Chronicle, DM-tools
 * mutations) are OUT — a point-in-time snapshot leg replayed against a doc a peer
 * has since written would silently clobber that peer with no CAS to catch it, and
 * "whose ⌘Z" is ambiguous on a shared doc. The viewer-side glass case is already
 * double-locked (`sheetReadonly()` no-ops + hidden affordance).
 *
 * ─── THE NEVER LIST (category rule) ───────────────────────────────────────────
 * Never enters the stack: navigation/routing; edit-mode field typing and inline
 * override edits (native browser ⌘Z owns those); theme/locale/UI-preference
 * toggles; palette actions; campaign membership/roster/invite ops; ALL shared-doc
 * writes (above); level-up / build / import / snapshot mutations (they fence the
 * stack, below); anything from a `readonly` sheet. No dice, ever (golden rule 21)
 * — undo/redo re-applies deterministic state transitions only; `redo` re-runs the
 * SAME resolved `execute` (the same chosen slot level / pool amount), never
 * re-opening a picker and never re-randomizing anything, because nothing is random.
 *
 * Session-memory only (page reload clears it): the reverse-appliers are closures
 * over live state (log ids, snapshots, React refs), non-serializable by nature.
 */

import { create } from "zustand";
import { useToastStore } from "@/stores/toastStore";
import type { ToastIntent } from "@/types/toast";

/**
 * The stack depth cap. A full frantic combat turn (Action Surge + Extra Attack +
 * bonus + reaction + riders) is < 10 entries; 20 covers two turns of mis-taps plus
 * HP edits. Deeper history is increasingly likely to be fenced anyway and holds
 * stale closures over dead state. `future` is bounded by the same cap.
 */
export const MAX_UNDO_DEPTH = 20;

/**
 * Label model — mirrors the toast contract exactly (toasts-as-data): UI-layer
 * registrants pass a pre-localized `message`; store-layer registrants pass a
 * structured `intent` localized at render by the SAME `toastMessage` path. It is
 * structurally a `Pick<UndoToast, "message" | "intent">`, so the one toast
 * localizer resolves an entry's label for its tooltip / confirmation beat.
 */
export type UndoLabel = { message: string } | { intent: ToastIntent };

export interface UndoEntry {
  /** Monotonic "undo-N". */
  id: string;
  label: UndoLabel;
  /**
   * The live toast currently advertising this entry, so a keyboard/control undo
   * dismisses it (replaces the old `slotToastRef`).
   */
  toastId?: string;
  /**
   * Purged at encounter turn-start / encounter-end and captured by solo
   * Undo-End-Turn. TRUE for economy commits (action/cast/swing/reaction/End Turn);
   * FALSE for character-state entries (HP, conditions, out-of-combat tracker
   * spends, concentration, defenses) whose reverse-appliers don't touch the
   * per-turn economy.
   */
  turnScoped: boolean;
  /** The reverse-applier (exactly today's closures). */
  undo: () => void;
  /**
   * Re-run the original execute. Returns the NEW reverse-applier, or `null` when
   * the re-execution legally bailed (budget full, no uses left) — then nothing is
   * pushed and the redo is a quiet no-op.
   */
  redo: () => (() => void) | null;
}

interface UndoState {
  /** The character the stack belongs to. */
  characterId: string | null;
  /** LIFO, bounded (`MAX_UNDO_DEPTH`). */
  past: UndoEntry[];
  /** Redo stack (LIFO), same bound. */
  future: UndoEntry[];
  /** Push; CLEARS `future` unless a redo replay is in flight. */
  register: (e: Omit<UndoEntry, "id">) => string;
  /** Undo the top (no id) or a CONTEXTUAL entry (id = toast button / tap). */
  undo: (id?: string) => boolean;
  /** Redo the top of `future`; returns false on an empty stack OR a legal bail. */
  redo: () => boolean;
  setToastId: (entryId: string, toastId: string) => void;
  /** Encounter turn-start / encounter-end fence. */
  purgeTurnScoped: () => void;
  /** Hard fence (rest, character switch, build edit, import, remote change…). */
  clear: (characterId?: string | null) => void;
}

let nextId = 0;

/**
 * Set around a redo replay so `register` (re-invoked by the re-execution) does NOT
 * truncate the remaining `future`. Module-level: every mutation here is synchronous
 * within one `redo()` call, so there is no interleaving.
 */
let replaying = false;

/** Dismiss an entry's live toast, if any (mechanical — the announcement, not the capability). */
function dismissEntryToast(entry: UndoEntry): void {
  if (entry.toastId) useToastStore.getState().dismissToast(entry.toastId);
}

/** Evict the oldest entries beyond the depth cap (silent). */
function capped(list: UndoEntry[]): UndoEntry[] {
  return list.length > MAX_UNDO_DEPTH ? list.slice(list.length - MAX_UNDO_DEPTH) : list;
}

export const useUndoStore = create<UndoState>()((set, get) => ({
  characterId: null,
  past: [],
  future: [],

  register: (e) => {
    const id = `undo-${++nextId}`;
    const entry: UndoEntry = { ...e, id };
    set((s) => ({
      past: capped([...s.past, entry]),
      // A fresh action after an undo truncates the redo branch (the standard
      // model); a redo replay keeps it (the `replaying` guard).
      future: replaying ? s.future : [],
    }));
    return id;
  },

  undo: (id) => {
    const { past } = get();
    const index = id == null ? past.length - 1 : past.findIndex((e) => e.id === id);
    const entry = index >= 0 ? past[index] : undefined;
    // A miss (evicted / fenced) is a silent no-op — a stale toast whose entry is
    // gone can never fire a dangling closure.
    if (!entry) return false;
    entry.undo();
    dismissEntryToast(entry);
    set((s) => ({
      past: s.past.filter((e) => e.id !== entry.id),
      future: capped([...s.future, entry]),
    }));
    return true;
  },

  redo: () => {
    const { future } = get();
    const entry = future[future.length - 1];
    if (!entry) return false;
    // Pop from `future` first so the re-registration can't see it.
    set((s) => ({ future: s.future.slice(0, -1) }));
    replaying = true;
    try {
      // Re-run the original execute (single source of the mutation, golden rule 6).
      // The re-registration inside pushes the fresh entry onto `past`; a legal bail
      // returns null and nothing is pushed (the entry is simply dropped).
      return entry.redo() !== null;
    } finally {
      replaying = false;
    }
  },

  setToastId: (entryId, toastId) =>
    set((s) => ({
      // The one-snackbar rule reuses the live toast's id for the NEW act's
      // announcement — so claiming a toast id STRIPS it from any other entry
      // (whose announcement was superseded): a later contextual dismiss of the
      // old entry must never kill the new act's live snackbar.
      past: s.past.map((e) =>
        e.id === entryId
          ? { ...e, toastId }
          : e.toastId === toastId
            ? { ...e, toastId: undefined }
            : e
      ),
    })),

  purgeTurnScoped: () => {
    const { past, future } = get();
    [...past, ...future].forEach((e) => {
      if (e.turnScoped) dismissEntryToast(e);
    });
    set({
      past: past.filter((e) => !e.turnScoped),
      future: future.filter((e) => !e.turnScoped),
    });
  },

  clear: (characterId) => {
    const { past, future } = get();
    [...past, ...future].forEach(dismissEntryToast);
    set((s) => ({
      past: [],
      future: [],
      characterId: characterId === undefined ? s.characterId : characterId,
    }));
  },
}));

/**
 * Run `execute`, and if it committed, register it as an undoable + redoable entry.
 * Returns the new entry id, or `null` when the execute legally bailed (no resource
 * spent). The contract: **redo = re-run the SAME `execute` closure and re-register**
 * — no duplicated mutation code anywhere, and every redo is itself undoable.
 */
export function registerUndoable(
  label: UndoLabel,
  execute: () => (() => void) | null,
  opts: { turnScoped: boolean }
): string | null {
  const undo = execute();
  if (!undo) return null;
  return useUndoStore.getState().register({
    label,
    ...opts,
    undo,
    redo: () => {
      const id = registerUndoable(label, execute, opts);
      return id
        ? (useUndoStore.getState().past.find((e) => e.id === id)?.undo ?? null)
        : null;
    },
  });
}

/**
 * Advertise an ALREADY-registered entry with the standard 5 s undo toast, wiring
 * the toast's Undo button back to the SAME entry (`setToastId`). The one home of the
 * toast tail — `showToast` + `onUndo → undo(entryId)` + `setToastId` — so every call
 * site (and the manual `register` sites whose toast message depends on the result)
 * shares it (golden rule 6). The toast label IS the entry label (one semantic unit).
 */
export function wireUndoToast(
  entryId: string,
  label: UndoLabel,
  opts: { duration?: number } = {}
): void {
  const toastId = useToastStore.getState().showToast({
    ...label,
    duration: opts.duration ?? 5000,
    onUndo: () => useUndoStore.getState().undo(entryId),
  });
  useUndoStore.getState().setToastId(entryId, toastId);
}

/**
 * The common case: `registerUndoable` + `wireUndoToast` in one call. Registers the
 * act and, when it committed, fires its undo toast; returns the entry id (or `null`
 * on a legal bail, when NO toast is shown — the caller may surface its own "nothing
 * to do" notice). Collapses the register → showToast → setToastId tail every 5 s-undo
 * call site used to repeat by hand.
 */
export function registerUndoableToast(
  label: UndoLabel,
  execute: () => (() => void) | null,
  opts: { turnScoped: boolean; duration?: number }
): string | null {
  const entryId = registerUndoable(label, execute, { turnScoped: opts.turnScoped });
  if (entryId === null) return null;
  wireUndoToast(entryId, label, {
    ...(opts.duration ? { duration: opts.duration } : {}),
  });
  return entryId;
}

/**
 * Pattern B — the mutation already RAN and the label reads its RESULT (a clamped
 * heal, a Death-Ward line, the advanced round): register the hand-written
 * reverse-applier + a SELF-REPLAYING redo (re-run the original handler — which
 * re-validates its guards, re-registers, and re-toasts — then hand back the
 * fresh entry's reverse), and fire the standard undo snackbar. The one home of
 * the register → self-redo → wireUndoToast tail every result-labelled site used
 * to repeat by hand (golden rule 6).
 */
export function registerUndoableResult(
  label: UndoLabel,
  undo: () => void,
  replay: () => void,
  opts: { turnScoped: boolean } = { turnScoped: false }
): void {
  const entryId = useUndoStore.getState().register({
    label,
    turnScoped: opts.turnScoped,
    undo,
    redo: () => {
      replay();
      return useUndoStore.getState().past.at(-1)?.undo ?? null;
    },
  });
  wireUndoToast(entryId, label);
}
