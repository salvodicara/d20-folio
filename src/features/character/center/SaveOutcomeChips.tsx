/**
 * A save spell with nothing for the app to apply (Command) is completed on the row
 * just used, like an attack's result (`AttackOutcomeChips`): one line per picked
 * creature, «Goblin · Saved · Failed», in the situation chips' style. The chips stay
 * until the next use or the end of the turn, the chosen one selected; the selected
 * one again clears it. Ignored, the line stays today's. One writer: the use's own log
 * line, which the session report reads («Goblin fails, Orc saves»).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LineChip, LinePick } from "@/components/shared/LinePick";
import { Input } from "@/components/ui";
import { ALONE_SAVE_ID, type CombatEvent } from "@/types/combat-log";
import { useCharacterStore } from "@/stores/characterStore";

import {
  rewriteSave,
  rewriteSaveDamage,
  useSaveOutcomeStore,
} from "./save-outcome-store";

type Use = Extract<CombatEvent, { kind: "action-use" }>;
const RESULTS = ["saved", "failed"] as const;
/** The tray's «Saved» and the shared «Failed» (one key per string). */
const LABEL = {
  saved: "combat.damageTray.saved",
  failed: "combat.atZeroHpSaveFailed",
} as const;

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
  if (pending.alone)
    return <AloneSave logId={pending.logId} line={line} damage={pending.alone.damage} />;
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
                  label={t(LABEL[value])}
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

/**
 * A save spell cast with nobody named: one «Save · Saved · Failed» line, and a damage
 * field once a result is chosen when the spell deals damage (the attack chips' field:
 * the number pad on a phone, written on Enter or when it loses focus).
 */
function AloneSave({
  logId,
  line,
  damage,
}: {
  logId: string;
  line: Use;
  damage: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<{ logId: string; text: string } | null>(null);
  const current = line.saves?.[ALONE_SAVE_ID];
  const text =
    draft?.logId === logId
      ? draft.text
      : line.amount !== undefined
        ? String(line.amount)
        : "";
  const commitAmount = () => {
    const value = text.trim();
    const amount = Number(value);
    if (value === "") rewriteSaveDamage(logId);
    else if (Number.isInteger(amount) && amount >= 0) rewriteSaveDamage(logId, amount);
    setDraft(null);
  };
  return (
    <LinePick label={t("spells.save")} weight="status">
      <span className="attack-outcome-chips">
        {RESULTS.map((value) => (
          <LineChip
            key={value}
            weight="status"
            label={t(LABEL[value])}
            selected={current === value}
            onClick={() => {
              setDraft(null);
              rewriteSave(logId, ALONE_SAVE_ID, current === value ? undefined : value);
            }}
          />
        ))}
      </span>
      {damage && current && (
        <label className="attack-outcome-amount">
          <span className="encounter-feed-pick-label">
            {t("mechanics.cast.optionDamage")}
          </span>
          <span className="attack-outcome-field">
            <Input
              placeholder="—"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              autoFocus
              value={text}
              onChange={(event) => setDraft({ logId, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitAmount();
              }}
              onBlur={commitAmount}
            />
          </span>
        </label>
      )}
    </LinePick>
  );
}
