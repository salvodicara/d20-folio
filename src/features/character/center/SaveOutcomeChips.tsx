/**
 * A save spell with nothing for the app to apply (Command) is completed on the row
 * just used, like an attack's result (`AttackOutcomeChips`): one line per picked
 * creature, «Goblin · Saved · Failed», in the situation chips' style. The chips stay
 * until the next use or the end of the turn, the chosen one selected; the selected
 * one again clears it. Ignored, the line stays today's. One writer: the use's own log
 * line, which the session report reads («Goblin fails, Orc saves»).
 */
import { useTranslation } from "react-i18next";

import { LineChip, LinePick } from "@/components/shared/LinePick";
import type { CombatEvent } from "@/types/combat-log";
import { useCharacterStore } from "@/stores/characterStore";

import { rewriteSave, useSaveOutcomeStore } from "./save-outcome-store";

type Use = Extract<CombatEvent, { kind: "action-use" }>;
const RESULTS = ["saved", "failed"] as const;

export function SaveOutcomeChips({ actionId }: { actionId: string }) {
  const { t } = useTranslation();
  const pending = useSaveOutcomeStore((s) =>
    s.pending?.actionId === actionId ? s.pending : null
  );
  const line = useCharacterStore((s) =>
    pending
      ? (s.character?.session.logEntries.find((e) => e.id === pending.logId)?.event as
          | Use
          | undefined)
      : undefined
  );
  if (!pending || line?.kind !== "action-use") return null;
  return (
    <>
      {pending.targets.map((target) => {
        const current = line.saves?.[target.id];
        return (
          <LinePick key={target.id} label={target.name} weight="status">
            <span className="attack-outcome-chips">
              {RESULTS.map((value) => (
                <LineChip
                  key={value}
                  weight="status"
                  label={t(`combat.damageTray.${value}`)}
                  selected={current === value}
                  onClick={() =>
                    rewriteSave(
                      pending.logId,
                      target.id,
                      current === value ? undefined : value
                    )
                  }
                />
              ))}
            </span>
          </LinePick>
        );
      })}
    </>
  );
}
