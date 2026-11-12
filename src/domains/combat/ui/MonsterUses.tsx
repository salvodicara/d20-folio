/**
 * The DM's limited uses under a monster's line in the campaign's Scontro (rules-gap
 * board A1; D&D Beyond's combat tracker, where a monster's «3/Day» and «Recharge 5–6»
 * are check boxes on its line). One chip per use, named as the stat block names it,
 * with what is left; a tap spends one, with its undo. A spent Recharge asks its d6
 * (the app never rolls: the DM taps the face it showed), and a 5 or 6 gives it back.
 * Every write goes through the DM's edit log (`editEncounter`, one writer).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { getMonster } from "@/data/monsters";
import { monsterUseChips } from "@/domains/combat/monster-use-chips";
import {
  restoreMonsterUse,
  rollMonsterRecharge,
  spendMonsterUse,
} from "@/domains/combat/monster-uses-view";
import type { Toaster } from "@/domains/combat/ui/fight-moves";
import { editEncounter } from "@/features/campaigns/encounter-edit-sync";
import type { Locale } from "@/lib/locale";
import type { EncounterState } from "@/types/campaign";
import { Chip } from "@/ui";

const FACES = [1, 2, 3, 4, 5, 6] as const;

export function MonsterUses({
  campaignId,
  encounter,
  ids,
  locale,
  onToast,
}: {
  campaignId: string;
  encounter: EncounterState;
  ids: readonly string[];
  locale: Locale;
  onToast: Toaster;
}) {
  const { t } = useTranslation();
  const [rolling, setRolling] = useState<string | null>(null);
  const monsters = ids.flatMap((id) => {
    const c = encounter.combatants.find((x) => x.id === id);
    if (c?.kind !== "monster" || !c.srdId) return [];
    const block = getMonster(c.srdId);
    if (!block) return [];
    const chips = monsterUseChips(c.srdId, c, block, t, locale);
    return chips.length > 0 ? [{ id, name: c.name, chips }] : [];
  });
  if (monsters.length === 0) return null;
  return (
    <div className="f-mon-uses">
      {monsters.map((m) => (
        <div
          key={m.id}
          className="f-chips"
          role="group"
          aria-label={t("fight.uses", { name: m.name })}
        >
          {ids.length > 1 && <span className="f-lbl">{m.name}</span>}
          {m.chips.map((use) => {
            const rollKey = `${m.id}:${use.key}`;
            if (use.rollDue) {
              return rolling === rollKey ? (
                <span key={use.key} className="f-mon-roll">
                  <span className="f-help">
                    {t("fight.rechargeAsk", { min: use.recharge })}
                  </span>
                  {FACES.map((face) => (
                    <Chip
                      key={face}
                      ariaLabel={t("fight.rechargeFace", { face })}
                      onClick={() => {
                        setRolling(null);
                        editEncounter(campaignId, (fight) =>
                          rollMonsterRecharge(fight, m.id, use, face)
                        );
                        onToast(
                          t(
                            face >= (use.recharge ?? 7)
                              ? "fight.rechargeBack"
                              : "fight.rechargeNot",
                            { name: use.label, face }
                          )
                        );
                      }}
                    >
                      {String(face)}
                    </Chip>
                  ))}
                </span>
              ) : (
                <Chip key={use.key} kind="cond" onClick={() => setRolling(rollKey)}>
                  {`${use.label} · ${t("fight.rechargeRoll")}`}
                </Chip>
              );
            }
            return (
              <Chip
                key={use.key}
                pressed={use.left > 0}
                disabled={use.left === 0}
                onClick={() => {
                  editEncounter(campaignId, (fight) =>
                    spendMonsterUse(fight, m.id, use.key, use.max)
                  );
                  onToast(t("fight.useSpent", { name: use.label }), () =>
                    editEncounter(campaignId, (fight) =>
                      restoreMonsterUse(fight, m.id, use.key)
                    )
                  );
                }}
              >
                {use.max > 1 ? `${use.label} · ${use.left}/${use.max}` : use.label}
              </Chip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
