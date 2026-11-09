/**
 * The 0-HP family, for the new Play screen (headless: direction renders it). What the
 * classic DyingBanner, death-save pips and HP popover show and do, from the same seams:
 *
 * - `downView(doc)`: the state (up, dying, stable, dead) and, once dead, why (three
 *   failed death saves, Exhaustion 6, disintegrated, or the roster lifecycle). An
 *   Exhaustion death happens at full HP, so a dead character always gets a view (the
 *   older `playDownView` returned null for every death). Also the death saves against
 *   the table's limits, the d20 to enter (one or two faces, the Advantage and
 *   Disadvantage sources, the rerolls such as Halfling Luck), the zero-HP savers on
 *   offer, and what the fall brings while they are undecided (Disintegrate: dust).
 * - The commits, through `hp-commits` (shared with the classic controls): a death
 *   save entered, a saver used, a hit taken (at 0 HP a Critical Hit is two failures),
 *   and stabilising (three successes: Spare the Dying, a Medicine check).
 */
import type { TFunction } from "i18next";

import {
  commitDamage,
  commitDeathSaveEntry,
  commitZeroHpSaver,
} from "@/features/character/molecules/hp-commits";
import {
  deathSaveD20Context,
  enteredD20FaceCount,
  type PostRollUse,
} from "@/lib/character-d20-tests";
import {
  deathSaveLimits,
  diedInPlay,
  diedOfExhaustion,
  isCharacterDead,
  stabilisedInPlay,
} from "@/lib/character-status";
import { vitalDeathSaves, vitalHp } from "@/lib/character-vitals";
import type { Locale } from "@/lib/locale";
import { stableMinutes } from "@/lib/play/time";
import {
  zeroHpSavers,
  type ZeroHpSaver,
  type ZeroHpSaveResult,
} from "@/lib/play/zero-hp-savers";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc, SessionState } from "@/types/character";

export type DownState = "up" | "dying" | "stable" | "dead";
export type DeadReason = "death-saves" | "exhaustion" | "disintegrated" | "lifecycle";

export interface DownView {
  state: DownState;
  /** Why the character is dead; null while alive. */
  deadReason: DeadReason | null;
  deathSaves: {
    successes: number;
    failures: number;
    /** Three each by RAW, or the campaign's table rules. */
    limit: { successes: number; failures: number };
  };
  /** The death save's d20 to enter: one face, or two with Advantage/Disadvantage. */
  d20: {
    faceCount: 1 | 2;
    mode: "advantage" | "disadvantage" | null;
    advantageSourceIds: readonly string[];
    disadvantageSourceIds: readonly string[];
    /** Rerolls that apply (Halfling Luck), by source. */
    rerollSourceIds: readonly string[];
  };
  /** At 0 HP and not dead: the savers on offer, in the order the player picks. */
  zeroHpSavers: ZeroHpSaver[];
  /** What the fall brings while the savers are undecided (Disintegrate: dust). */
  fallConsequence: NonNullable<SessionState["zeroHpDrop"]>["consequence"] | null;
  /** Stable: the game minutes since, when the sheet knows. */
  stableMinutes: number | null;
}

function deadReason(doc: CharacterDoc): DeadReason | null {
  const { session } = doc;
  if (!isCharacterDead(doc.status, session)) return null;
  if (session.death?.disintegrated) return "disintegrated";
  if (diedOfExhaustion(session)) return "exhaustion";
  if (diedInPlay(session)) return "death-saves";
  return "lifecycle";
}

export function downView(doc: CharacterDoc): DownView {
  const { session } = doc;
  const atZero = vitalHp(session).current <= 0;
  const reason = deadReason(doc);
  const state: DownState = reason
    ? "dead"
    : !atZero
      ? "up"
      : stabilisedInPlay(session)
        ? "stable"
        : "dying";
  const saves = vitalDeathSaves(session);
  const context = deathSaveD20Context(doc);
  const advantage = context.advantageSourceIds.length > 0;
  const disadvantage = context.disadvantageSourceIds.length > 0;
  const savers = atZero && !reason ? zeroHpSavers(doc) : [];
  const consequence = session.zeroHpDrop?.consequence;
  return {
    state,
    deadReason: reason,
    deathSaves: {
      successes: saves.successes,
      failures: saves.failures,
      limit: deathSaveLimits(session),
    },
    d20: {
      faceCount: enteredD20FaceCount(context),
      mode:
        advantage && !disadvantage
          ? "advantage"
          : disadvantage && !advantage
            ? "disadvantage"
            : null,
      advantageSourceIds: context.advantageSourceIds,
      disadvantageSourceIds: context.disadvantageSourceIds,
      rerollSourceIds: context.rerolls.map((reroll) => reroll.sourceId),
    },
    zeroHpSavers: savers,
    fallConsequence: consequence && savers.length > 0 ? consequence : null,
    stableMinutes: state === "stable" ? (stableMinutes(session) ?? null) : null,
  };
}

/** The open sheet, when it may be changed. */
function editable(): CharacterDoc | null {
  const store = useCharacterStore.getState();
  return store.readonly ? null : store.character;
}

/** Enter the death save's d20 (one face, or both with Advantage/Disadvantage). */
export function recordDeathSave(
  faces: ReadonlyArray<number>,
  t: TFunction,
  /** What the player added after the roll and its payment (`usePostRollEntry`). */
  use?: PostRollUse,
  spend?: { trackerId: string; amount: number }
): void {
  if (editable()) commitDeathSaveEntry(faces, t, use, spend);
}

/** Use a zero-HP saver on offer; a save-gated one takes the rolled result. */
export function applyZeroHpSaver(
  sourceId: string,
  result: ZeroHpSaveResult | undefined,
  t: TFunction,
  locale: Locale
): void {
  const doc = editable();
  const saver = doc
    ? downView(doc).zeroHpSavers.find((s) => s.sourceId === sourceId)
    : null;
  if (saver) commitZeroHpSaver(saver, result, t, locale);
}

/** A hit taken, through the character's own defenses; at 0 HP a Critical Hit is two
 *  death-save failures (the HP popover's Critical-hit toggle). */
export function takeDamage(amount: number, opts: { crit: boolean }, t: TFunction): void {
  if (editable() && amount > 0) commitDamage([{ amount }], { crit: opts.crit }, t);
}

/** Stabilise at 0 HP (Spare the Dying, a Medicine check): the success track fills;
 *  the failures stay. Undoable. */
export function stabilise(t: TFunction): void {
  const doc = editable();
  if (!doc || downView(doc).state !== "dying") return;
  const { successes, failures } = vitalDeathSaves(doc.session);
  const limit = deathSaveLimits(doc.session).successes;
  registerUndoableToast(
    { message: t("character.stableLabel") },
    () => {
      useCharacterStore.getState().setDeathSaves(limit, failures);
      return () => useCharacterStore.getState().setDeathSaves(successes, failures);
    },
    { turnScoped: false }
  );
}
