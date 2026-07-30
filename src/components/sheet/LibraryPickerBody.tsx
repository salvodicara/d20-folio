/**
 * LibraryPickerBody — the "Library" tab shared by the three Add-X modals (spell ·
 * item · feature): the account-level homebrew the player already saved, one row per
 * entry, ready to drop onto THIS character.
 *
 * ONE component for the same list three times (golden rule 3/6): the caller passes
 * which `kinds` its modal accepts (`["equipment", "weapon"]` for the item modal) and
 * the commit closes its modal. Deliberately NOT a `CompendiumPicker` spec — a
 * library is ≤ `FREE_TIER_LIMITS.libraryEntries` user entries with nothing to facet
 * or read, so it wears the plain `PickerSearch` + `PickerRow` parts every add-modal
 * list already uses.
 *
 * The commit routes through the SAME path the Custom creation forms use
 * (`characterStore.setCharacter`), appending the landed copy
 * (`entryToCharacterItem` — a deep copy re-seeded with the create-form defaults) to
 * the matching array.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { PickerRow, PickerSearch } from "@/components/sheet/picker-parts";
import { useCharacterStore } from "@/stores/characterStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { matchesSearch } from "@/lib/search";
import {
  entryToCharacterItem,
  LIBRARY_KIND_LABEL_KEY,
  libraryEntryName,
  type LibraryEntry,
  type LibraryKind,
} from "@/lib/library";

/** Append one library entry to the character array its kind belongs to. */
function addEntryToCharacter(entry: LibraryEntry): void {
  const store = useCharacterStore.getState();
  const doc = store.character;
  if (!doc) return;
  const data = doc.character;
  const landed = entryToCharacterItem(entry);
  // The switch narrows `landed.item` to the exact type of the array it joins.
  switch (landed.kind) {
    case "spell":
      store.setCharacter({
        ...doc,
        character: { ...data, spells: [...data.spells, landed.item] },
      });
      return;
    case "feature":
      store.setCharacter({
        ...doc,
        character: { ...data, features: [...data.features, landed.item] },
      });
      return;
    case "equipment":
      store.setCharacter({
        ...doc,
        character: { ...data, equipment: [...data.equipment, landed.item] },
      });
      return;
    case "weapon":
      store.setCharacter({
        ...doc,
        character: { ...data, weapons: [...data.weapons, landed.item] },
      });
      return;
  }
}

export function LibraryPickerBody({
  kinds,
  onAdded,
}: {
  /** Which entry kinds this modal can land (the item modal takes two). */
  kinds: readonly LibraryKind[];
  /** Called after a successful add — each modal's existing close behaviour. */
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const entries = useLibraryStore((s) => s.entries);
  const [search, setSearch] = useState("");

  /**
   * The one-line reading under the name: the kind (only when this modal lands
   * more than one kind — a spell modal's rows are all spells), plus its
   * cheapest fact.
   */
  function meta(entry: LibraryEntry): string {
    const parts: Array<string | undefined> =
      kinds.length > 1 ? [t(LIBRARY_KIND_LABEL_KEY[entry.kind])] : [];
    switch (entry.kind) {
      case "spell":
        parts.push(
          entry.item.level === 0
            ? t("spells.cantrip")
            : t("spells.levelN", { level: entry.item.level }),
          t(`srd.school_${entry.item.school}`)
        );
        break;
      case "weapon":
        parts.push(`${entry.item.damageDie} ${t(`srd.damage_${entry.item.damageType}`)}`);
        break;
      case "feature":
        parts.push(entry.item.source);
        break;
      case "equipment":
        break;
    }
    return parts.filter(Boolean).join(" · ");
  }

  const rows = useMemo(() => {
    const mine = entries.filter((e) => kinds.includes(e.kind));
    if (!search.trim()) return mine;
    return mine.filter((e) => matchesSearch(search, libraryEntryName(e)));
  }, [entries, kinds, search]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PickerSearch
        value={search}
        onChange={setSearch}
        placeholder={t("custom.librarySearch")}
      />
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[0.72rem] italic text-text-secondary">
            {entries.length === 0 ? t("custom.libraryEmpty") : t("common.noResults")}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((entry) => (
              <PickerRow
                key={entry.id}
                name={libraryEntryName(entry)}
                meta={meta(entry)}
                ariaLabel={t("custom.libraryAdd", { name: libraryEntryName(entry) })}
                trailing={<Icon as={Plus} size="sm" decorative />}
                onClick={() => {
                  addEntryToCharacter(entry);
                  onAdded();
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
