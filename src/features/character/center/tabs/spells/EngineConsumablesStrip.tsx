/**
 * The conjured consumables the character's engine world holds (Goodberry's
 * berry batch): one row per live inventory instance whose item carries a
 * canonical consume program, with the consume walking the same modal protocol
 * as a cast (pay 1 quantity from THIS instance, apply the item's effect).
 *
 * Names localize from the CREATING spell (a conjured blueprint carries no
 * display strings): the spell whose `consumableItem` declares the item id.
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { MechanicsCastModal } from "@/components/sheet/MechanicsCastModal";
import { spells } from "@/data/spells";
import { localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";
import {
  characterConjuredItemCapability,
  characterMaterialRef,
  characterTrackerSeeds,
  characterWorldState,
  engineConsumableRows,
  type EngineConsumableRow,
} from "@/lib/mechanics-world-store";
import {
  useMechanicsEngineAction,
  type EngineActionSource,
} from "@/features/character/useMechanicsCast";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";

/** The creating spell of a conjured item id (Goodberry for `goodberry-berry`),
 *  from the ONE data declaration (`spell.consumableItem`). */
function creatingSpellId(itemId: string): string | null {
  return spells.find((spell) => spell.consumableItem?.itemId === itemId)?.id ?? null;
}

function ConsumeFlow({
  maxHp,
  onClose,
  row,
  itemName,
}: {
  readonly maxHp: number;
  readonly onClose: () => void;
  readonly row: EngineConsumableRow;
  readonly itemName: string;
}) {
  const doc = useCharacterStore((state) => state.character);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const sourceFor = useCallback(
    (
      document: Readonly<CharacterDoc>,
      ownerUid: string,
      world: Readonly<CharacterMaterialState>
    ): EngineActionSource | null => {
      const capability = characterConjuredItemCapability(
        document,
        ownerUid,
        world,
        row.instanceId,
        document.character.hp.max
      );
      return capability ? { capability, key: `consume-${row.instanceId}` } : null;
    },
    [row.instanceId]
  );
  const cast = useMechanicsEngineAction(sourceFor);
  if (!doc || uid === null || maxHp <= 0) return null;
  return (
    <MechanicsCastModal
      cast={cast}
      flavor="action"
      material={characterMaterialRef(doc, uid)}
      onClose={onClose}
      slotRemaining={{}}
      sourceItem={{
        instanceId: row.instanceId,
        instanceOrdinal: row.instanceOrdinal,
      }}
      spellName={itemName}
    />
  );
}

export function EngineConsumablesStrip({ maxHp }: { readonly maxHp: number }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const doc = useCharacterStore((state) => state.character);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [openRow, setOpenRow] = useState<EngineConsumableRow | null>(null);

  const rows = useMemo(() => {
    if (!doc || uid === null) return [];
    return engineConsumableRows(
      characterWorldState(doc, uid, maxHp, {}, characterTrackerSeeds(doc))
    );
  }, [doc, maxHp, uid]);

  if (rows.length === 0) return null;
  const nameOf = (row: EngineConsumableRow): string => {
    const spellId = creatingSpellId(row.itemId);
    return spellId === null ? row.itemId : localizeSrd("spell", spellId, "name", locale);
  };
  return (
    <div role="group" aria-label={t("mechanics.consumables.strip")}>
      {rows.map((row) => (
        <Button key={row.instanceId} onClick={() => setOpenRow(row)} variant="secondary">
          {t("mechanics.consumables.consume", {
            count: row.quantity,
            name: nameOf(row),
          })}
        </Button>
      ))}
      {openRow && (
        <ConsumeFlow
          itemName={nameOf(openRow)}
          maxHp={maxHp}
          onClose={() => setOpenRow(null)}
          row={openRow}
        />
      )}
    </div>
  );
}
