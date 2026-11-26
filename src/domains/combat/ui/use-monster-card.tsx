/**
 * The DM's monster card on the Scontro tab, as one hook the fight screen mounts: `open`
 * a monster by id, and the dialog it renders (name, AC, notes and the stat block), whose
 * «Salva» is one move with its undo. The creature is read live from the fight.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";
import { getMonster } from "@/data/monsters";
import { MonsterCardDialog } from "@/domains/combat/ui/MonsterCardDialog";
import { useFightMove, type Toaster } from "@/domains/combat/ui/fight-moves";
import { editMonsterMove } from "@/features/campaigns/combat-lifecycle-io";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { EncounterState } from "@/types/campaign";

export function useMonsterCard(
  campaignId: string,
  encounter: EncounterState,
  uid: string,
  locale: Locale,
  onToast: Toaster
) {
  const { t } = useTranslation();
  const move = useFightMove(onToast);
  const [openId, setOpenId] = useState<string | null>(null);
  const monster = encounter.combatants.find(
    (c) => c.id === openId && c.kind === "monster"
  );
  const open = (id: string) => {
    // The stat block reads the monster catalogue's localized text: load it first.
    void import("@/i18n")
      .then((i) => i.ensureSrdKind("monster"))
      .finally(() => setOpenId(id));
  };
  const block = monster?.kind === "monster" && monster.srdId && getMonster(monster.srdId);
  const dialog = monster?.kind === "monster" && (
    <MonsterCardDialog
      key={monster.id}
      monster={{ name: monster.name, ac: monster.ac, notes: monster.notes ?? "" }}
      statBlock={
        block ? (
          <MonsterStatBlockCard
            monster={block}
            locale={locale}
            title={localizeSrd("monster", block.id, "name", locale)}
          />
        ) : undefined
      }
      onClose={() => setOpenId(null)}
      onSave={(edit) =>
        move(
          () => editMonsterMove(campaignId, { uid, monsterId: monster.id, ...edit }),
          t("fight.dm.cardDone", { name: edit.name })
        )
      }
    />
  );
  return { open, dialog };
}
