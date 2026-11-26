/**
 * The DM's limited-use strip for each monster line of the Scontro tab, as one hook the
 * fight screen mounts: the uses its catalogue stat block prints, read live from the
 * fight, each change one move with its undo in the toast (once the lazy monster catalogue
 * that names them is in). A group line (several
 * creatures, each with its own uses) and a homebrew creature show none yet.
 */
import { useTranslation } from "react-i18next";

import { getMonster } from "@/data/monsters";
import { monsterUsesView, type MonsterUseRow } from "@/domains/combat/monster-uses-view";
import { MonsterUses } from "@/domains/combat/ui/MonsterUses";
import type { Toaster } from "@/domains/combat/ui/fight-moves";
import { cryptoD20, monsterUseMove } from "@/features/campaigns/combat-lifecycle-io";
import type { MonsterUseChange } from "@/features/campaigns/combat-lifecycle";
import { useLazySrdKind } from "@/hooks/useLazySrdKind";
import { localizeSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import type { Locale } from "@/lib/locale";
import type { EncounterState } from "@/types/campaign";

/** A d6 from the same fair source as the app's d20 (1–20 → 1–6 would bias it). */
function cryptoD6(): number {
  for (;;) {
    const d20 = cryptoD20();
    if (d20 <= 18) return ((d20 - 1) % 6) + 1;
  }
}

export function useMonsterUses(
  campaignId: string,
  encounter: EncounterState,
  uid: string,
  locale: Locale,
  onToast: Toaster
) {
  const { t } = useTranslation();
  // The uses' names live in the lazy monster catalogue: wait for it (a fresh load has
  // not opened «Aggiungi mostri», which loads it too).
  const named = useLazySrdKind(
    "monster",
    encounter.combatants.some((c) => c.kind === "monster" && c.srdId !== undefined)
  );
  const stripFor = (ids: readonly string[]) => {
    if (!named || ids.length !== 1) return null;
    const monster = encounter.combatants.find((c) => c.id === ids[0]);
    if (monster?.kind !== "monster" || !monster.srdId) return null;
    const block = getMonster(monster.srdId);
    if (!block) return null;
    const labelOf = (use: MonsterUseRow) => {
      if (use.kind === "spell" && use.spellId)
        return localizeSrd("spell", use.spellId, "name", locale);
      const [section, entryId] = use.key.split(":");
      return section && entryId
        ? localizeSrd("monster", srdKey(block.id, section, entryId), "name", locale)
        : "";
    };
    const uses = monsterUsesView(monster, block).map((use) => ({
      use,
      label: labelOf(use),
    }));
    const run = (use: MonsterUseRow, change: MonsterUseChange, label: string) => {
      void monsterUseMove(campaignId, { uid, monsterId: monster.id, use, change })
        .then((done) => {
          if (!done) {
            onToast(t("fight.moved"));
            return;
          }
          const name = labelOf(use) || monster.name;
          const text =
            change.kind === "recharge"
              ? t(done.back ? "fight.uses.rechargeBack" : "fight.uses.rechargeMiss", {
                  d6: change.d6,
                  name,
                })
              : t(label, { name: use.kind === "legendary" ? monster.name : name });
          onToast(text, () => {
            void done.undo().then((ok) => {
              if (!ok) onToast(t("fight.tooLate"));
            });
          });
        })
        .catch(() => onToast(t("fight.failed")));
    };
    return (
      <MonsterUses
        uses={uses}
        onSpend={(use) =>
          run(
            use,
            { kind: "spend" },
            use.kind === "legendary"
              ? "fight.uses.legendarySpent"
              : "fight.uses.spentDone"
          )
        }
        onRecharge={(use) =>
          run(use, { kind: "recharge", d6: cryptoD6() }, "fight.uses.rechargeBack")
        }
        onRegain={(use) => run(use, { kind: "regain" }, "fight.uses.regainDone")}
      />
    );
  };
  return { stripFor };
}
