/**
 * An attack with no target in Folio is completed on the row just used: Hit · Miss ·
 * Crit. Miss is one tap; Hit or Crit writes the result and shows the damage field,
 * committed on Enter or when it loses focus (the next tap elsewhere). Nothing is asked
 * twice and nothing waits: ignored, the line stays as today's «uses Longsword». One
 * writer: the use's own log line, which the session report reads («— hit, 9 damage»).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LineChip, LinePick } from "@/components/shared/LinePick";
import { Input } from "@/components/ui";
import type { AttackOutcome } from "@/types/combat-log";
import { useCharacterStore } from "@/stores/characterStore";

import { useAttackOutcomeStore } from "./attack-outcome-store";

const OUTCOMES: AttackOutcome[] = ["hit", "miss", "critical"];

/** Write the declared result (and the damage) on the use's own log line. */
function stamp(logId: string, outcome: AttackOutcome, amount?: number): void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.find((e) => e.id === logId);
  if (entry?.event.kind !== "action-use") return;
  store.amendLogEntry(entry.id, {
    ...entry.event,
    outcome,
    ...(amount !== undefined ? { amount } : {}),
  });
}

export function AttackOutcomeChips({ actionId }: { actionId: string }) {
  const { t } = useTranslation();
  const pending = useAttackOutcomeStore((s) =>
    s.pending?.actionId === actionId ? s.pending : null
  );
  const [chosen, setChosen] = useState<{ logId: string; outcome: AttackOutcome } | null>(
    null
  );
  const [text, setText] = useState("");
  if (!pending) return null;
  const awaiting = chosen?.logId === pending.logId ? chosen : null;

  const finish = () => {
    setChosen(null);
    setText("");
    useAttackOutcomeStore.getState().clear();
  };
  const commitAmount = () => {
    if (!awaiting) return;
    const amount = Number(text.trim());
    if (text.trim() !== "" && Number.isInteger(amount) && amount >= 0)
      stamp(awaiting.logId, awaiting.outcome, amount);
    finish();
  };

  if (awaiting) {
    return (
      <LinePick label={t(`combat.damageTray.outcome.${awaiting.outcome}`)}>
        <span className="attack-outcome-amount">
          <Input
            aria-label={t("combat.damageTray.total")}
            inputMode="tel"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="—"
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitAmount();
            }}
            onBlur={commitAmount}
          />
        </span>
      </LinePick>
    );
  }

  return (
    <LinePick label={t("combat.attackResult")}>
      {OUTCOMES.map((outcome) => (
        <LineChip
          key={outcome}
          label={t(`combat.damageTray.outcome.${outcome}`)}
          onClick={() => {
            stamp(pending.logId, outcome);
            if (outcome === "miss") finish();
            else setChosen({ logId: pending.logId, outcome });
          }}
        />
      ))}
    </LinePick>
  );
}
