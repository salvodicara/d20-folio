/**
 * The engine-driven cast flow: mounts one replay-driven `useMechanicsCast`
 * protocol for the chosen spell and walks it through `MechanicsCastModal`.
 *
 * This is the deterministic-runtime side of the spells-tab dual dispatch —
 * engine-executable spells resolve here (slot debit, targets, physical rolls,
 * one canonical journal commit with exact undo); everything else still rides
 * the legacy transaction until its own cutover wave deletes it. Every commit
 * registers the product's native reversal affordance (`registerEngineCommitUndo`
 * — the same "X used + Undo" grammar the legacy loop owns): its undo drives
 * the exact journal reverse and rolls back the legacy economy mirror in the
 * same motion.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MechanicsCastModal } from "@/components/sheet/MechanicsCastModal";
import { spellIndex } from "@/data/spells";
import { turnEconomyKey } from "@/features/character/center/combat-hydration";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useCombatStore } from "@/stores/combatStore";
import { abilityModifier } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import { totalLevel } from "@/lib/classes";
import { characterMaterialRef } from "@/lib/mechanics-world-store";
import { registerEngineCommitUndo } from "@/features/character/engine-undo";
import { useMechanicsCast } from "@/features/character/useMechanicsCast";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { CastSummaryVM, SlotSummaryVM } from "@/lib/views/spells-view";
import type { EconomyActionCategory } from "@/lib/combat-economy";
import type { LocText } from "@/lib/loc-text";

export interface EngineCastFlowProps {
  /**
   * Non-null when this cast REPLACES a held ENGINE concentration on the named
   * spell: the dispatcher has already asked through the shared swap confirm,
   * and the kernel's `concentration-replacement` coordination then commits the
   * whole swap as ONE bounded causal action (the held occurrence, its root and
   * every sourced standing end mid-cast; the new cast is held whole) — one
   * journal entry whose exact reverse restores the OLD spell. This flow only
   * mirrors the swap onto the legacy chrome (story beats, stale save queue)
   * and labels the undo toast as the replacement.
   */
  readonly concentrationSwap?: { readonly heldSpellId: string } | null;
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

/**
 * Mirror a committed ONE-ACTION engine concentration swap onto the legacy
 * chrome: the end + start story beats the kernel replacement performs
 * world-side (events-as-data), and the stale pending-save queue clear the
 * legacy swap teardown owns (a queued save about the dropped spell is moot —
 * and its failure path must never be able to tear down the NEW spell).
 * Returns the exact revert, run after a successful journal undo restores the
 * old spell. The `session.concentration` field itself needs no mirroring —
 * the commit's own transition mirror restamps it both ways.
 */
function mirrorConcentrationSwap(heldSpellId: string, nextSpellId: string): () => void {
  const store = useCharacterStore.getState();
  const priorSaves = store.combatPendingConcentrationSaves;
  if (priorSaves.length > 0) {
    useCharacterStore.setState({ combatPendingConcentrationSaves: [] });
    store.persistPlayState();
  }
  const endLogId = store.logEvent({
    kind: "concentration-end",
    spell: concentrationValue(heldSpellId),
  });
  const startLogId = store.logEvent({
    kind: "concentration-start",
    spell: concentrationValue(nextSpellId),
  });
  return () => {
    const live = useCharacterStore.getState();
    live.removeLogEntry(startLogId);
    live.removeLogEntry(endLogId);
    if (priorSaves.length > 0) {
      useCharacterStore.setState({ combatPendingConcentrationSaves: priorSaves });
      live.persistPlayState();
    }
  };
}

export function EngineCastFlow({
  concentrationSwap = null,
  economy,
  hasAttack,
  onClose,
  slots,
  spellId,
  spellName,
  summary,
}: EngineCastFlowProps) {
  const { t } = useTranslation();
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
  // one truth while both runtimes coexist. The mirror is a re-runnable closure
  // returning its exact revert, so the registered undo/redo drive the SAME
  // legs the commit wrote (golden rule 6).
  const cast = useMemo(
    () => ({
      ...engineCast,
      commit: (): string | null => {
        const committedId = engineCast.commit();
        if (committedId === null) return null;
        const applyMirror = (): (() => void) => {
          const reverts: (() => void)[] = [];
          if (concentrationSwap !== null) {
            reverts.push(mirrorConcentrationSwap(concentrationSwap.heldSpellId, spellId));
          }
          if (economy !== null && doc) {
            const combat = useCombatStore.getState();
            const key = turnEconomyKey(
              useCombatStatusStore.getState().status,
              doc.id,
              combat.round
            );
            if (economy.spellLevel > 0) {
              const restoreSlotCast = combat.commitSpellSlotCast(key);
              if (restoreSlotCast) reverts.push(() => void restoreSlotCast());
            }
            if (economy.slot === "reaction") {
              combat.useReaction(economy.actionId);
              reverts.push(() => {
                const live = useCombatStore.getState();
                if (live.reactionUsedId === economy.actionId) live.resetReaction();
              });
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
              reverts.push(() =>
                useCombatStore.getState().deselectAction(economy.actionId)
              );
            }
          }
          // Occupant-checked legs unwind in reverse commit order.
          return () => [...reverts].reverse().forEach((revert) => revert());
        };
        const revert = applyMirror();
        registerEngineCommitUndo(
          committedId,
          concentrationSwap !== null
            ? {
                intent: {
                  kind: "concentration-replaced",
                  next: concentrationValue(spellId),
                  previous: concentrationValue(concentrationSwap.heldSpellId),
                },
              }
            : { message: t("combat.actionUsedToast", { name: spellName }) },
          { mirror: { apply: applyMirror, revert }, turnScoped: economy !== null }
        );
        return committedId;
      },
    }),
    [concentrationSwap, doc, economy, engineCast, spellId, spellName, t]
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
  // The pact pool, when the character has one with casts left — the modal
  // offers it beside the standard levels (the kernel's `spell-slot` selector
  // admits both pools) with its level shown, and enforces the level floor.
  const pactSlot = useMemo(() => {
    const pact = slots.find((slot) => slot.pactMagic && slot.remaining > 0);
    return pact ? { level: pact.level, remaining: pact.remaining } : undefined;
  }, [slots]);

  if (!doc || uid === null) return null;
  return (
    <MechanicsCastModal
      cast={cast}
      material={characterMaterialRef(doc, uid)}
      onArmorClass={setTargetArmorClass}
      onClose={onClose}
      {...(pactSlot ? { pactSlot } : {})}
      requiresArmorClass={hasAttack && targetArmorClass === null}
      slotRemaining={slotRemaining}
      spellName={spellName}
      // An enemy-affinity target (Hex's mark) is a creature the solo world
      // does not model: the entity step's self answer is the table-abstract
      // stand-in, so the button must say "the creature at the table".
      targetFlavor={
        spellIndex.get(spellId)?.targeting?.affinity === "enemy" ? "table" : "self"
      }
    />
  );
}
