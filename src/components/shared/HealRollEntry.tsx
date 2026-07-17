/**
 * HealRollEntry — the shared dice-heal apply affordance (Second Wind "1d10 +
 * Fighter level"; the RA-02 short-rest Hit-Die spend "Nd{hitDie} + N×CON").
 *
 * Golden rule 21: the app NEVER rolls — the player rolls their dice EXTERNALLY
 * and enters the result here; tapping Apply heals `enteredRoll + bonus` (the
 * deterministic part the engine resolved). The roll field is the shared, CLAMPED
 * `NumberStepper` (golden rule 20 — selects-on-focus, bounded to [count, count×face],
 * no invalid value reachable). The deterministic bonus is shown on the button so
 * the player sees what's added — no fabricated total.
 *
 * Extracted from PlayTab (S8) so the RestModal short-rest flow reuses the ONE
 * recipe (golden rule 3) instead of a parallel widget.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/input";

export function HealRollEntry({
  dice,
  bonus,
  onApply,
  applyLabel,
}: {
  dice: string;
  bonus: number;
  onApply: (total: number) => void;
  /** Optional override for the Apply-button copy (RA-02: "Heal & rest"); when
   *  omitted the shared `combat.healRoll*` copy is used. */
  applyLabel?: string;
}) {
  const { t } = useTranslation();
  // The die's max face (1d10 → 10), so the entry can't exceed a single die's
  // result. A multi-die heal ("2d4") bounds to count×face. Falls back to a loose
  // cap if the token is unexpected (never blocks entry).
  const m = /^(\d*)d(\d+)$/.exec(dice);
  const count = m && m[1] ? parseInt(m[1], 10) : 1;
  const face = m ? parseInt(m[2] ?? "0", 10) : 0;
  const dieMax = face > 0 ? count * face : 99;
  const dieMin = m ? count : 1;
  const [roll, setRoll] = useState(dieMin);
  return (
    <div className="heal-roll-entry">
      <span className="heal-roll-label">{t("combat.healRollLabel", { dice })}</span>
      <NumberStepper
        value={roll}
        onChange={setRoll}
        min={dieMin}
        max={dieMax}
        ariaLabel={t("combat.healRollField", { dice })}
        decrementLabel={t("combat.healRollDec")}
        incrementLabel={t("combat.healRollInc")}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onApply(roll + bonus);
        }}
      >
        {applyLabel ??
          (bonus > 0
            ? t("combat.healRollApply", { bonus })
            : t("combat.healRollApplyFlat"))}
      </Button>
    </div>
  );
}
