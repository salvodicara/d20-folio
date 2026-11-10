/**
 * The DM's own monsters (headless): the saved list with a search and a one-line reading
 * (type, CR, AC, HP), saving a new one, deleting one, and the entry that adds it to the
 * fight (`customMonsterToInput`). Shared by the classic custom monsters panel and the
 * new fight screen; the form and the confirmation stay in each UI.
 */
import type { TFunction } from "i18next";
import type { LibraryEntry } from "@/lib/library";
import { matchesSearch } from "@/lib/search";
import { uploadMonsterPortrait } from "@/lib/storage";
import { formatCr } from "@/lib/utils";
import { useLibraryStore } from "@/stores/libraryStore";
import { useToastStore } from "@/stores/toastStore";
import type { CustomMonster } from "@/types/campaign";
import type { PortraitCrop } from "@/types/character";

export { customMonsterToInput } from "@/features/campaigns/encounter-monster-input";

export type MonsterEntry = LibraryEntry & { kind: "monster"; item: CustomMonster };

export const isMonsterEntry = (entry: LibraryEntry): entry is MonsterEntry =>
  entry.kind === "monster";

/** The one-line reading under a monster's name: type · CR · AC · HP. */
export function customMonsterMeta(monster: CustomMonster, t: TFunction): string {
  return [
    monster.creatureType ? t(`srd.creatureType_${monster.creatureType}`) : undefined,
    monster.cr ? t("polymorph.crShort", { cr: formatCr(Number(monster.cr)) }) : undefined,
    `${t("character.armorClassShort")} ${monster.ac}`,
    `${monster.maxHp} ${t("character.hp")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function customMonsterRows(
  entries: readonly LibraryEntry[],
  search: string,
  t: TFunction
): Array<{ id: string; name: string; meta: string; entry: MonsterEntry }> {
  const query = search.trim();
  return entries
    .filter(isMonsterEntry)
    .filter((entry) => !query || matchesSearch(query, entry.item.name))
    .map((entry) => ({
      id: entry.id,
      name: entry.item.name,
      meta: customMonsterMeta(entry.item, t),
      entry,
    }));
}

/**
 * Save a new monster to the DM's library; its portrait (when chosen) uploads after the
 * save and lands on the entry. The new entry's id, or null when the library is full
 * (said with a notice).
 */
export function saveCustomMonster(
  template: CustomMonster,
  portrait: { blob: Blob; crop: PortraitCrop } | null,
  uid: string,
  t: TFunction
): string | null {
  const { outcome, id } = useLibraryStore
    .getState()
    .saveToLibrary({ kind: "monster", item: template });
  if (outcome === "full") {
    useToastStore
      .getState()
      .showToast({ message: t("custom.libraryFull"), duration: 4000 });
    return null;
  }
  if (!id) return null;
  if (portrait) {
    void uploadMonsterPortrait(uid, id, portrait.blob)
      .then((portraitUrl) =>
        useLibraryStore
          .getState()
          .setEntryPortrait(id, { portraitUrl, portraitCrop: portrait.crop })
      )
      .catch(() =>
        useToastStore
          .getState()
          .showToast({ message: t("portrait.crop.saveError"), duration: 5000 })
      );
  }
  return id;
}

/** Delete a monster from the library (the UI confirms first). */
export function deleteCustomMonster(id: string): void {
  useLibraryStore.getState().removeFromLibrary(id);
}
