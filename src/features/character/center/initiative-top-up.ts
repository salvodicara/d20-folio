/**
 * A fight's first initiative roll regains the trackers that top up on it (Bard
 * Superior Inspiration, Persistent Rage), with the standard undo snackbar. Shared
 * by every place the player rolls: the cockpit turn band and the topbar pip.
 */
import type { TFunction } from "i18next";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore, wireUndoToast } from "@/stores/undoStore";
import type { Locale } from "@/lib/locale";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import {
  resolveActions,
  resolveTrackers,
  type RawResolvedAction,
} from "@/lib/smart-tracker";
import { useToastStore } from "@/stores/toastStore";
import type { CharacterDoc } from "@/types/character";
import { useActionRequestStore } from "./action-request-store";

/** The feature a Monk may use when rolling Initiative (SRD 5.2.1 Monk 2). */
const UNCANNY_METABOLISM = "monk-uncanny-metabolism";

/** Uncanny Metabolism's action when taking it now gives something back: its use is
 *  left, and Focus is spent or Hit Points are missing. Null otherwise. */
export function uncannyMetabolismOffer(doc: CharacterDoc): RawResolvedAction | null {
  const tracker = resolveTrackers(doc).find((tr) => tr.id === UNCANNY_METABOLISM);
  if (!tracker || tracker.used >= tracker.total) return null;
  const focus = resolveTrackers(doc).find((tr) => tr.id === "monk-focus");
  const hurt = doc.session.hp.current < effectiveMaxHp(doc.character, doc.session);
  if (!hurt && !(focus && focus.used > 0)) return null;
  return (
    resolveActions(doc, "spellbook").find((a) => a.costTracker === UNCANNY_METABOLISM) ??
    null
  );
}

/** Offer Uncanny Metabolism with one tap, after the first initiative roll. */
function offerUncannyMetabolism(t: TFunction, locale: Locale): void {
  const doc = useCharacterStore.getState().character;
  const action = doc ? uncannyMetabolismOffer(doc) : null;
  if (!action) return;
  const name = grantSourceLabel(UNCANNY_METABOLISM, locale);
  useToastStore.getState().showToast({
    message: t("combat.initiativeOffer", { name }),
    duration: 15000,
    action: { label: name, run: () => useActionRequestStore.getState().ask(action.id) },
  });
}

export function applyFirstRollTopUps(t: TFunction, locale: Locale): void {
  offerUncannyMetabolism(t, locale);
  const { sourceIds, restore } = useCharacterStore
    .getState()
    .applyInitiativeTrackerTopUps();
  if (sourceIds.length === 0) return;
  // Pattern B (the reversal contract): the top-up already ran and the message
  // names its source — register on the session undo stack so ⌘Z / the standing
  // control reach it too, then wire the standard 5s snackbar. Character-state
  // entry (a tracker restore, not per-turn economy) → turnScoped false.
  const message = t("combat.initiativeTopUp", {
    source: grantSourceLabel(sourceIds[0] ?? "", locale),
  });
  const entryId = useUndoStore.getState().register({
    label: { message },
    turnScoped: false,
    undo: restore,
    redo: () => {
      const again = useCharacterStore.getState().applyInitiativeTrackerTopUps();
      return again.sourceIds.length > 0 ? again.restore : null;
    },
  });
  wireUndoToast(entryId, { message });
}
