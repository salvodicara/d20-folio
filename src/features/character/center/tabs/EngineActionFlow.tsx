/**
 * The engine-driven ACTIONS flow: mounts one replay-driven engine protocol for
 * a feature-granted action or a weapon attack and walks it through the shared
 * `MechanicsCastModal` (the actions-surface twin of `EngineCastFlow`).
 *
 * This is the deterministic-runtime side of the Play-tab dual dispatch —
 * engine-executable actions resolve here (pool/tracker debits, chosen amounts,
 * physical rolls, one canonical journal commit with exact undo); everything
 * else still rides the legacy commit loop until its own cutover wave.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { MechanicsCastModal } from "@/components/sheet/MechanicsCastModal";
import {
  useMechanicsEngineAction,
  type EngineActionSource,
} from "@/features/character/useMechanicsCast";
import {
  characterFeatureActionCapability,
  characterMaterialRef,
  characterWeaponAttackCapability,
} from "@/lib/mechanics-world-store";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore, type SelectedAction } from "@/stores/combatStore";
import type { EconomyActionCategory } from "@/lib/combat-economy";
import type { FeatureActionContext } from "@/lib/mechanics-transcription";
import type { LocText } from "@/lib/loc-text";
import type { SrdActionDef } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";

/** One engine-eligible feature action, resolved by the Play-tab gate. */
export interface EngineFeatureDispatch {
  readonly kind: "feature";
  readonly action: Readonly<SrdActionDef>;
  readonly actionName: string;
  readonly context: FeatureActionContext;
  readonly derived: Readonly<{
    readonly attackBonus?: number;
    readonly attackDiceCount?: number;
    readonly featureBonus: number;
    /** Caller-resolved concrete count for a dynamic `targeting.maxTargets`. */
    readonly maxTargets?: number;
    readonly saveDc: number;
  }>;
  /** Rules category mirrored onto the economy entry (restricted-slot truth). */
  readonly economyCategory: EconomyActionCategory | null;
  readonly economySlot: "action" | "bonus" | "free";
  readonly featureId: string;
  /** The action requires a target armor class before its attack can review. */
  readonly hasAttackRoll: boolean;
  /** The resolved legacy row id, for the turn-economy mirror. */
  readonly legacyActionId: string;
  /** Stable persisted name, so a hydrated turn re-localizes the entry. */
  readonly nameLoc?: LocText;
  readonly ordinal: number;
  /** The commit counts as an "attack" turn event (Rage-style maintenance). */
  readonly triggersAttack: boolean;
}

/** One engine-eligible weapon attack row, resolved by the Play-tab gate. */
export interface EngineWeaponDispatch {
  readonly kind: "weapon";
  readonly actionName: string;
  /** Rules category mirrored onto the economy entry (restricted-slot truth). */
  readonly economyCategory: EconomyActionCategory | null;
  /** The resolved weapon row id (`weapon-...`) the capability re-resolves. */
  readonly legacyActionId: string;
  /** Stable persisted name, so a hydrated turn re-localizes the entry. */
  readonly nameLoc?: LocText;
  /** Extra Attack: mirror the commit as one attack-pips SWING (claim or ride
   * an Attack action) instead of a whole Action-slot occupant. */
  readonly swing: boolean;
}

export type EngineActionDispatch = EngineFeatureDispatch | EngineWeaponDispatch;

export interface EngineActionFlowProps {
  readonly dispatch: EngineActionDispatch;
  readonly onClose: () => void;
}

export function EngineActionFlow({ dispatch, onClose }: EngineActionFlowProps) {
  const { t } = useTranslation();
  const doc = useCharacterStore((state) => state.character);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [targetArmorClass, setTargetArmorClass] = useState<number | null>(null);

  const needsArmorClass = dispatch.kind === "weapon" || dispatch.hasAttackRoll;

  const sourceFor = useCallback(
    (
      document: Readonly<CharacterDoc>,
      ownerUid: string,
      world: Readonly<CharacterMaterialState>
    ): EngineActionSource | null => {
      const maxHp = document.character.hp.max;
      if (dispatch.kind === "weapon") {
        const capability = characterWeaponAttackCapability(
          document,
          ownerUid,
          dispatch.legacyActionId,
          {
            maxHp,
            ...(targetArmorClass !== null ? { targetArmorClass } : {}),
          }
        );
        return capability ? { capability, key: `use-${dispatch.legacyActionId}` } : null;
      }
      const capability = characterFeatureActionCapability(
        document,
        ownerUid,
        dispatch.featureId,
        dispatch.action,
        dispatch.ordinal,
        {
          ...dispatch.derived,
          maxHp,
          ...(targetArmorClass !== null ? { targetArmorClass } : {}),
        },
        dispatch.context,
        world
      );
      return capability ? { capability, key: `use-${dispatch.legacyActionId}` } : null;
    },
    [dispatch, targetArmorClass]
  );

  const engineAction = useMechanicsEngineAction(sourceFor);
  // The rollout bridge mirrors a successful engine commit onto the legacy turn
  // economy (the occupied slot) and clears the legacy chips of any cures the
  // player opted into — the engine world's condition mirror covers only
  // world-owned conditions, never a manually-chipped one.
  const cast = {
    ...engineAction,
    commit: (): boolean => {
      const curedConditions = engineAction.answers.flatMap((answer) => {
        if (answer.kind !== "boolean" || !answer.value) return [];
        const match = /^cure-(.+)-opt$/.exec(answer.inputId);
        return match?.[1] !== undefined ? [match[1]] : [];
      });
      const committed = engineAction.commit();
      if (!committed) return false;
      const store = useCharacterStore.getState();
      const current = store.character;
      if (
        current &&
        curedConditions.some((id) => current.session.conditions.includes(id))
      ) {
        store.updateSession({
          ...current.session,
          conditions: current.session.conditions.filter(
            (id) => !curedConditions.includes(id)
          ),
        });
      }
      // The economy mirror stays EXACT to the legacy entry the commit loop
      // would have written: slot occupant, rules category, and the "attack"
      // turn event the maintenance check reads. An Extra-Attack weapon swing
      // mirrors onto the attack-pips ledger (claim or ride an Attack action)
      // instead of occupying a whole Action slot.
      const combat = useCombatStore.getState();
      const triggersAttack = dispatch.kind === "weapon" || dispatch.triggersAttack;
      const entry: SelectedAction = {
        id: dispatch.legacyActionId,
        name: dispatch.actionName,
        ...(dispatch.nameLoc ? { nameLoc: dispatch.nameLoc } : {}),
        slot: dispatch.kind === "weapon" ? "action" : dispatch.economySlot,
        ...(dispatch.economyCategory
          ? { economyCategory: dispatch.economyCategory }
          : {}),
        ...(triggersAttack ? { triggerEvents: ["attack"] as const } : {}),
      };
      if (dispatch.kind === "weapon" && dispatch.swing) {
        combat.commitAttackSwing(
          {
            id: "attack-group",
            name: t("combat.attackAction"),
            nameLoc: { ui: "combat.attackAction" },
            slot: "action",
            isAttackGroup: true,
            economyCategory: "attack",
            triggerEvents: ["attack"],
          },
          dispatch.legacyActionId
        );
      } else {
        combat.selectAction(entry);
      }
      return true;
    },
  };

  if (!doc || uid === null) return null;
  return (
    <MechanicsCastModal
      cast={cast}
      flavor={dispatch.kind === "weapon" ? "attack" : "action"}
      material={characterMaterialRef(doc, uid)}
      onArmorClass={setTargetArmorClass}
      onClose={onClose}
      requiresArmorClass={needsArmorClass && targetArmorClass === null}
      slotRemaining={{}}
      spellName={dispatch.actionName}
    />
  );
}
