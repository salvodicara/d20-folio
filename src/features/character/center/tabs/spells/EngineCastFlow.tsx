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
import { abilityModifier } from "@/lib/compute";
import { totalLevel } from "@/lib/classes";
import { characterMaterialRef } from "@/lib/mechanics-world-store";
import { useMechanicsCast } from "@/features/character/useMechanicsCast";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { CastSummaryVM, SlotSummaryVM } from "@/lib/views/spells-view";

export interface EngineCastFlowProps {
  /** The spell requires a target armor class before its attack can review. */
  readonly hasAttack: boolean;
  readonly onClose: () => void;
  readonly slots: readonly SlotSummaryVM[];
  readonly spellId: string;
  readonly spellName: string;
  readonly summary: CastSummaryVM | null;
}

export function EngineCastFlow({
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

  const cast = useMechanicsCast(spellId, derived);

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
