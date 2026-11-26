/**
 * The DM's limited uses under a monster's line on the Scontro tab (SRD 5.2.1; D&D
 * Beyond's stat block prints «Recharge 5–6» and the legendary uses, Foundry's dnd5e NPC
 * sheet counts them down): each use a chip. A ready Recharge use is spent with a tap;
 * once spent, its chip rolls the d6. N/Day uses and per-day spells count down. The
 * legendary pool counts down, with «regain» for the start of the monster's turn.
 */
import { useTranslation } from "react-i18next";

import type { MonsterUseRow } from "@/domains/combat/monster-uses-view";
import { Chip } from "@/ui";

export function MonsterUses({
  uses,
  onSpend,
  onRecharge,
  onRegain,
}: {
  uses: ReadonlyArray<{ use: MonsterUseRow; label: string }>;
  onSpend: (use: MonsterUseRow) => void;
  onRecharge: (use: MonsterUseRow) => void;
  onRegain: (use: MonsterUseRow) => void;
}) {
  const { t } = useTranslation();
  if (uses.length === 0) return null;
  return (
    <div className="f-chips f-uses" role="group" aria-label={t("fight.uses.title")}>
      {uses.map(({ use, label }) => {
        if (use.kind === "recharge") {
          const rate =
            use.recharge === 6
              ? t("monster.rechargeExact")
              : t("monster.recharge", { min: use.recharge });
          return use.left > 0 ? (
            <Chip key={use.key} pressed onClick={() => onSpend(use)}>
              {`${label} (${rate})`}
            </Chip>
          ) : (
            <Chip key={use.key} pressed={false} onClick={() => onRecharge(use)}>
              {t("fight.uses.rollRecharge", { name: label })}
            </Chip>
          );
        }
        if (use.kind === "legendary") {
          return (
            <span key={use.key} className="f-chips">
              <Chip pressed={use.left > 0} onClick={() => use.left > 0 && onSpend(use)}>
                {t("fight.uses.legendary", { left: use.left, max: use.max })}
              </Chip>
              {use.left < use.max && (
                <Chip pressed={false} onClick={() => onRegain(use)}>
                  {t("fight.uses.regain")}
                </Chip>
              )}
            </span>
          );
        }
        return (
          <Chip
            key={use.key}
            pressed={use.left > 0}
            onClick={() => use.left > 0 && onSpend(use)}
          >
            {`${label} ${String(use.left)}/${String(use.max)}`}
          </Chip>
        );
      })}
    </div>
  );
}
