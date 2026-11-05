/**
 * The tray's targets as its rows show them: me with my own HP and defenses, a fighter
 * from the live encounter by its row, anyone else as a monster by id. Fixed for the
 * tray's life (the targets were picked already).
 */
import { fightSideOf } from "./outcome-offer";
import { useMemo } from "react";

import {
  trayTargetFromRow,
  type TrayTarget,
} from "@/components/shared/damage-tray-target";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import type { DamageTrayPlan } from "@/lib/play/damage-tray";
import { incomingAttackModes, incomingSaveModes } from "@/lib/combat-effects";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";

export function useTrayTargets(plan: DamageTrayPlan): TrayTarget[] {
  const hp = useHpControls();
  const selfName = useCharacterStore((s) => s.character?.character.name ?? "");
  const status = useCombatStatusStore((s) => s.status);
  const uid = useAuthStore((s) => s.user?.uid);
  // The same "me" the commit used (TurnEconomyProvider.selfCombatantId).
  const selfId = status?.myId ?? (uid ? `pc-${uid}` : "self");

  const targets = useMemo<TrayTarget[]>(
    () =>
      plan.targets.map((id): TrayTarget => {
        if (id === selfId)
          return {
            id,
            name: selfName,
            kind: "self",
            hp: { current: hp.current, max: hp.max, temp: hp.temp },
            defenses: hp.defenses,
          };
        const row = status?.view.rows.find((r) => r.id === id);
        if (!row) return { id, name: id, kind: "monster" };
        const target = trayTargetFromRow(row, row.kind === "pc" || row.side === "ally");
        // An attack's Advantage or Disadvantage from the fight's effects on it.
        const incoming =
          plan.attack && status
            ? incomingAttackModes(
                status.encounter.effectOps,
                id,
                status.myId,
                fightSideOf(status.view.rows)
              ).map((m) => ({
                sourceKind: m.effect.source.kind,
                sourceId: m.sourceId,
                mode: m.mode,
                consumed: m.consumed,
              }))
            : [];
        // A spell's save: the Disadvantage a state on it gives against my spells.
        const incomingSave =
          plan.save?.bySpell && status
            ? incomingSaveModes(status.encounter.effectOps, id, status.myId).map((m) => ({
                sourceKind: m.effect.source.kind,
                sourceId: m.sourceId,
                mode: m.mode,
                consumed: false,
              }))
            : [];
        return {
          ...target,
          ...(incoming.length > 0 ? { incoming } : {}),
          ...(incomingSave.length > 0 ? { incomingSave } : {}),
        };
      }),
    // The rows are fixed for the tray's life: the targets were picked already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return targets;
}
