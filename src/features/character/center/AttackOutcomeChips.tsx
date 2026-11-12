/**
 * An attack with no target in Folio is completed on the row just used: Hit · Miss ·
 * Critical, in the situation chips' style. The chips stay until the next use or the end
 * of the turn, the chosen one selected, so a mis-tap is corrected in place: another
 * chip changes the result (Miss clears the damage), the selected one again clears it.
 * Hit or Critical shows a short damage field (the number pad on a phone), written on
 * Enter or when it loses focus. Ignored, the line stays today's «uses Longsword».
 * One writer: the use's own log line, which the session report reads («— hit, 9 damage»).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LineChip, LinePick } from "@/components/shared/LinePick";
import { Input } from "@/components/ui";
import type { AttackOutcome, CombatEvent } from "@/types/combat-log";
import { useCharacterStore } from "@/stores/characterStore";

import { useAttackOutcomeStore } from "./attack-outcome-store";

const OUTCOMES: AttackOutcome[] = ["hit", "miss", "critical"];

type Use = Extract<CombatEvent, { kind: "action-use" }>;

/** Rewrite the use's own log line with this result and damage (absent = cleared). */
function rewrite(logId: string, outcome?: AttackOutcome, amount?: number): void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.find((e) => e.id === logId);
  if (entry?.event.kind !== "action-use") return;
  const { outcome: _outcome, amount: _amount, ...rest } = entry.event;
  void _outcome;
  void _amount;
  store.amendLogEntry(entry.id, {
    ...rest,
    ...(outcome ? { outcome } : {}),
    ...(outcome && outcome !== "miss" && amount !== undefined ? { amount } : {}),
  });
}

export function AttackOutcomeChips({ actionId }: { actionId: string }) {
  const { t } = useTranslation();
  const pending = useAttackOutcomeStore((s) =>
    s.pending?.actionId === actionId ? s.pending : null
  );
  const line = useCharacterStore((s) =>
    pending
      ? (s.character?.session.logEntries.find((e) => e.id === pending.logId)?.event as
          | Use
          | undefined)
      : undefined
  );
  const [draft, setDraft] = useState<{ logId: string; text: string } | null>(null);
  if (!pending || line?.kind !== "action-use") return null;
  const outcome = line.outcome;
  const text =
    draft?.logId === pending.logId
      ? draft.text
      : line.amount !== undefined
        ? String(line.amount)
        : "";

  const choose = (next: AttackOutcome) => {
    setDraft(null);
    if (next === outcome) rewrite(pending.logId);
    else rewrite(pending.logId, next, next === "miss" ? undefined : line.amount);
  };
  const commitAmount = () => {
    if (!outcome || outcome === "miss") return;
    const value = text.trim();
    const amount = Number(value);
    if (value === "") rewrite(pending.logId, outcome);
    else if (Number.isInteger(amount) && amount >= 0)
      rewrite(pending.logId, outcome, amount);
    setDraft(null);
  };

  return (
    <LinePick label={t("combat.attackResult")} weight="status">
      {/* The three results stay together on one line; the damage gets its own. */}
      <span className="attack-outcome-chips">
        {OUTCOMES.map((value) => (
          <LineChip
            key={value}
            weight="status"
            label={t(`combat.damageTray.outcome.${value}`)}
            selected={outcome === value}
            onClick={() => choose(value)}
          />
        ))}
      </span>
      {outcome && outcome !== "miss" && (
        <label className="attack-outcome-amount">
          {/* A label that stays once a number is typed: «DANNI [ 9 ]». */}
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
              onChange={(event) =>
                setDraft({ logId: pending.logId, text: event.target.value })
              }
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
