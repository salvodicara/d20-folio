/**
 * Standing up from Prone (SRD 5.2.1: it costs half your Speed), with no React: the
 * classic turn band (ThisTurnTracker) and the new Play screen's turn model both read
 * and commit it here, so the rule lives once.
 */
import type { TFunction } from "i18next";

import { getEquipment } from "@/data/equipment";
import { liveConditionEncounter } from "@/features/character/condition-encounter";
import { effectiveConditions } from "@/lib/aggregate-character";
import { isCharacterAlive } from "@/lib/character-status";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { conditionFactsFor } from "@/lib/condition-sources";
import type { Locale } from "@/lib/locale";
import { turnMovementBudgetFt } from "@/lib/play/self-move";
import { shownWalkingSpeedFt } from "@/lib/smart-tracker";
import { localeDistance } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { registerUndoableResult } from "@/stores/undoStore";

/** Standing up for the open character now: its cost, and whether it can be paid.
 *  Null when the character is not Prone. */
export function standUpOption(
  round: number
): { costFt: number; possible: boolean } | null {
  const live = useCharacterStore.getState().character;
  if (!live) return null;
  const conditions = effectiveConditions(live);
  if (!conditions.includes("prone")) return null;
  const effects = resolveConditionEffects(
    conditions,
    conditionFactsFor(live, liveConditionEncounter(live.id))
  );
  const combat = useCombatStore.getState();
  const speedFt = shownWalkingSpeedFt(live, getEquipment, round);
  const costFt = Math.floor(speedFt / 2);
  const budgetFt = turnMovementBudgetFt(speedFt, combat);
  return {
    costFt,
    possible:
      isCharacterAlive(live.status, live.session) &&
      speedFt > 0 &&
      !effects.speedZero &&
      !combat.movementLocked &&
      budgetFt - combat.movementUsedFt >= costFt,
  };
}

/**
 * Stand up: Prone ends and half the Speed is spent, as ONE undo entry. Every
 * prerequisite is re-read at commit (the character or the turn may have changed).
 */
export function standUp(t: TFunction, locale: Locale, round: number): void {
  const option = standUpOption(round);
  if (!option?.possible) return;
  const cs = useCharacterStore.getState();
  // Drop Prone SILENTLY (returns its exact reverse) so the condition clear and the
  // movement debit ride one undo entry, not two separate toasts.
  const dropProne = cs.removeConditionSilent("prone");
  if (!dropProne) return;
  const combat = useCombatStore.getState();
  // DELTA debit: a delta refund on undo stays exact across a later turn's movement.
  combat.setMovementUsed(combat.movementUsedFt + option.costFt);
  registerUndoableResult(
    {
      message: t("combat.stoodUpToast", { cost: localeDistance(option.costFt, locale) }),
    },
    () => {
      dropProne(); // re-adds Prone + strips the condition-loss log line
      const c = useCombatStore.getState();
      c.setMovementUsed(Math.max(0, c.movementUsedFt - option.costFt));
    },
    () => standUp(t, locale, round)
  );
}
