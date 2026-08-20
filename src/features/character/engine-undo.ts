/**
 * The engine-commit UNDO AFFORDANCE (golden rule 6 — one home): every
 * successful engine dispatch (cast, feature action, weapon attack, conjured
 * consume) registers here so the player gets the SAME "X used + Undo" toast
 * grammar the legacy commit loop owns, backed by the EXACT journal reverse.
 *
 * The reverse is `undoCharacterAction` over the live persisted world — the
 * canonical generation reverse whose mirror restores every world-owned legacy
 * field (slots, pools, HP, concentration, engine conditions) in one motion —
 * composed with the flow's own legacy-chrome mirror revert (the combat-store
 * economy claims the journal does not own). Redo rides the reducer's native
 * `redo` transition (`redoCharacterAction`) and re-applies the same mirror.
 *
 * Scoping honors the established stack semantics: economy commits register
 * `turnScoped: true`, so a solo End Turn compacts them into the single
 * End-Turn entry and dismisses their toasts (the boundary is ONE-WAY — after
 * it, a re-instated entry's journal reverse fails the reducer's branch CAS
 * and the undo is a safe silent no-op, never a partial rewind). An entry is
 * only ever registered for an action the journal can reverse — the seam
 * itself answers at undo time, fail-closed.
 */

import {
  characterTrackerSeeds,
  characterWorldState,
  persistedWorldUid,
  redoCharacterAction,
  undoCharacterAction,
} from "@/lib/mechanics-world-store";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore, wireUndoToast, type UndoLabel } from "@/stores/undoStore";

/**
 * The legacy-chrome legs a flow wrote around the journal commit (combat-store
 * economy claims, cure-chip strips, swap story beats): `apply` re-runs them on
 * redo and returns their exact revert; the revert captured at commit (or the
 * one the latest `apply` returned) runs after a successful journal undo.
 */
export interface EngineCommitMirror {
  readonly apply: () => () => void;
  /** The revert of the commit-time application (already applied). */
  readonly revert: () => void;
}

/** Drive one journal transition against the LIVE doc; mirror the session back. */
function reverseEngineAction(actionId: string, transition: "undo" | "redo"): boolean {
  const store = useCharacterStore.getState();
  const doc = store.character;
  if (!doc || store.readonly || doc.session.world === undefined) return false;
  const uid = persistedWorldUid(doc.session.world);
  if (uid === null) return false;
  const world = characterWorldState(
    doc,
    uid,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) return false;
  const next =
    transition === "undo"
      ? undoCharacterAction(doc, uid, world, actionId)
      : redoCharacterAction(doc, uid, world, actionId);
  if (!next) return false;
  store.updateSession(next.session);
  return true;
}

/**
 * Register one committed engine action on the session undo stack and fire its
 * standard 5 s undo toast. `undo` = journal reverse first (the CAS gate — a
 * rejected reverse returns `false` and touches nothing), then the mirror
 * revert; `redo` = journal redo + mirror re-apply, re-registering the fresh
 * entry (every redo is itself undoable, the stack contract).
 */
export function registerEngineCommitUndo(
  actionId: string,
  label: UndoLabel,
  opts: { readonly mirror?: EngineCommitMirror; readonly turnScoped: boolean }
): void {
  let revertMirror = opts.mirror?.revert;
  const undo = (): boolean | undefined => {
    if (!reverseEngineAction(actionId, "undo")) return false;
    revertMirror?.();
    return undefined;
  };
  const register = (): string =>
    useUndoStore.getState().register({
      label,
      turnScoped: opts.turnScoped,
      undo,
      redo: () => {
        if (!reverseEngineAction(actionId, "redo")) return null;
        revertMirror = opts.mirror?.apply();
        register();
        return undo;
      },
    });
  wireUndoToast(register(), label);
}
