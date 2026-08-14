/**
 * The engine-driven cast flow: mounts one replay-driven `useMechanicsCast`
 * protocol for the chosen spell and walks it through `MechanicsCastModal`.
 *
 * This is the deterministic-runtime side of the spells-tab dual dispatch —
 * engine-executable spells resolve here (slot debit, targets, physical rolls,
 * one canonical journal commit with exact undo); everything else still rides
 * the legacy transaction until its own cutover wave deletes it.
 */

import { useMemo, useState } from "react";

import { MechanicsCastModal } from "@/components/sheet/MechanicsCastModal";
import { turnEconomyKey } from "@/features/character/center/combat-hydration";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useCombatStore } from "@/stores/combatStore";
import { abilityModifier } from "@/lib/compute";
import { totalLevel } from "@/lib/classes";
import { characterMaterialRef } from "@/lib/mechanics-world-store";
import { useMechanicsCast } from "@/features/character/useMechanicsCast";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { CastSummaryVM, SlotSummaryVM } from "@/lib/views/spells-view";
import type { EconomyActionCategory } from "@/lib/combat-economy";
import type { LocText } from "@/lib/loc-text";

export interface EngineCastFlowProps {
  /** Legacy turn-economy identity mirrored on a successful engine commit. */
  readonly economy: {
    readonly actionId: string;
    /** Rules category mirrored onto the economy entry (restricted-slot truth). */
    readonly economyCategory: EconomyActionCategory | null;
    /** Stable persisted name, so a hydrated turn re-localizes the entry. */
    readonly nameLoc?: LocText;
    readonly slot: "action" | "bonus" | "reaction" | "free";
    readonly spellLevel: number;
    /** The cast counts as an "attack" turn event (Rage-style maintenance). */
    readonly triggersAttack: boolean;
  } | null;
  /** The spell requires a target armor class before its attack can review. */
  readonly hasAttack: boolean;
  readonly onClose: () => void;
  readonly slots: readonly SlotSummaryVM[];
  readonly spellId: string;
  readonly spellName: string;
  readonly summary: CastSummaryVM | null;
}

export function EngineCastFlow({
  economy,
  hasAttack,
  onClose,
  slots,
  spellId,
  spellName,
  summary,
}: EngineCastFlowProps) {
  const doc = useCharacterStore((state) => state.character);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [targetArmorClass, setTargetArmorClass] = useState<number | null>(null);

  const derived = useMemo(() => {
    const character = doc?.character;
    const ability = summary?.ability ?? "INT";
    const castingModifier = character
      ? abilityModifier(character.abilityScores[ability])
      : 0;
    return {
      attackBonus: summary?.attackBonus ?? 0,
      castingModifier,
      characterLevel: character ? totalLevel(character) : 1,
      maxHp: character?.hp.max ?? 1,
      saveDc: summary?.saveDC ?? 8,
      ...(targetArmorClass !== null ? { targetArmorClass } : {}),
    };
  }, [doc, summary, targetArmorClass]);

  const engineCast = useMechanicsCast(spellId, derived);
  // The rollout bridge mirrors a successful engine commit onto the legacy turn
  // economy: the slot-per-turn claim and the occupied economy slot — or, for a
  // reaction cast, the round's Reaction marker (the exact CAS the legacy
  // reaction commit performs) — so legacy limiters and the turn strip keep
  // one truth while both runtimes coexist.
  const cast = useMemo(
    () => ({
      ...engineCast,
      commit: (): boolean => {
        const committed = engineCast.commit();
        if (committed && economy !== null && doc) {
          const combat = useCombatStore.getState();
          const key = turnEconomyKey(
            useCombatStatusStore.getState().status,
            doc.id,
            combat.round
          );
          if (economy.spellLevel > 0) combat.commitSpellSlotCast(key);
          if (economy.slot === "reaction") {
            combat.useReaction(economy.actionId);
          } else {
            combat.selectAction({
              id: economy.actionId,
              name: spellName,
              ...(economy.nameLoc ? { nameLoc: economy.nameLoc } : {}),
              slot: economy.slot,
              ...(economy.economyCategory
                ? { economyCategory: economy.economyCategory }
                : {}),
              ...(economy.triggersAttack ? { triggerEvents: ["attack"] as const } : {}),
            });
          }
        }
        return committed;
      },
    }),
    [doc, economy, engineCast, spellName]
  );

  const slotRemaining = useMemo(
    () =>
      Object.fromEntries(
        slots
          .filter((slot) => !slot.pactMagic)
          .map((slot) => [slot.level, slot.remaining])
      ),
    [slots]
  );

  if (!doc || uid === null) return null;
  return (
    <MechanicsCastModal
      cast={cast}
      material={characterMaterialRef(doc, uid)}
      onArmorClass={setTargetArmorClass}
      onClose={onClose}
      requiresArmorClass={hasAttack && targetArmorClass === null}
      slotRemaining={slotRemaining}
      spellName={spellName}
    />
  );
}
