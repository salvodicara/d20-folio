/**
 * CustomTabBody — the "Custom" tab of the three Add-X modals (spell · item ·
 * feature). ONE component for the same tab three times (golden rule 3/6).
 *
 * THE MODEL: **custom IS the library** — there is no separate "save to library"
 * gesture and no manager surface anywhere. Everything the player creates on any
 * character is auto-upserted into the account-level library (`libraryStore`, keyed by
 * kind + name), so this tab shows their whole homebrew of the matching kind(s), ready
 * to drop onto THIS character. The tab therefore carries both halves:
 *
 *  - LIST — search + one row per entry: the row IS the add-to-sheet button, with a
 *    trash glyph beside it (the ONLY place an entry is deleted, behind the house
 *    confirm). A "Create …" bar swaps the body to the create form.
 *  - CREATE — the EXISTING `CustomSpellForm` / `CustomEquipmentForm` /
 *    `CustomFeatureForm`, passed in by the modal, with a Back affordance. An EMPTY
 *    library skips the list entirely and opens on the form (with a one-line hint that
 *    whatever you create is kept) — a blank list would be a dead end.
 *
 * Deliberately NOT a `CompendiumPicker` spec: a library is ≤
 * `FREE_TIER_LIMITS.libraryEntries` user entries with nothing to facet or read, so it
 * wears the plain `PickerSearch` + `PickerRow` parts every add-modal list uses.
 *
 * The add commit routes through the SAME path the create forms use
 * (`characterStore.setCharacter`), appending the landed copy (`entryToCharacterItem` —
 * a deep copy re-seeded with the create-form defaults) to the matching array.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { PickerRow, PickerSearch } from "@/components/sheet/picker-parts";
import { useCharacterStore } from "@/stores/characterStore";
import { useConfirmStore } from "@/stores/confirmStore";
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

export function CustomTabBody({
  kinds,
  createLabel,
  createForm,
  onAdded,
}: {
  /** Which entry kinds this modal lists + lands (the item modal takes two). */
  kinds: readonly LibraryKind[];
  /** Label of the bar that swaps to the create form (an existing `custom.*` key). */
  createLabel: string;
  /** The modal's own Custom creation form — rendered in place of the list. */
  createForm: ReactNode;
  /** Called after a successful add — each modal's existing close behaviour. */
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const entries = useLibraryStore((s) => s.entries);
  const removeFromLibrary = useLibraryStore((s) => s.removeFromLibrary);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  /** Everything of this modal's kind(s) — the "is my library empty here" set. */
  const mine = useMemo(
    () => entries.filter((e) => kinds.includes(e.kind)),
    [entries, kinds]
  );
  const rows = useMemo(() => {
    if (!search.trim()) return mine;
    return mine.filter((e) => matchesSearch(search, libraryEntryName(e)));
  }, [mine, search]);

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

  async function handleDelete(entry: LibraryEntry) {
    const name = libraryEntryName(entry);
    const ok = await useConfirmStore.getState().confirm({
      title: t("common.deleteTitle", { name }),
      message: t("custom.libraryDeleteMessage"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (ok) removeFromLibrary(entry.id);
  }

  // Nothing of this kind kept yet → the tab IS the create form (a blank list would
  // be a dead end), with the one line that explains where creations go.
  if (creating || mine.length === 0) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {mine.length === 0 ? (
          <p className="border-b border-border-subtle px-4 py-2 text-[0.72rem] italic text-text-secondary">
            {t("custom.libraryAutoHint")}
          </p>
        ) : (
          <div className="border-b border-border-subtle px-4 py-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              <Icon as={ArrowLeft} size="sm" decorative />
              {t("common.back")}
            </Button>
          </div>
        )}
        {createForm}
      </div>
    );
  }

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
            {t("common.noResults")}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((entry) => (
              <div key={entry.id} className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <PickerRow
                    name={libraryEntryName(entry)}
                    meta={meta(entry)}
                    ariaLabel={t("custom.libraryAdd", { name: libraryEntryName(entry) })}
                    trailing={<Icon as={Plus} size="sm" decorative />}
                    onClick={() => {
                      addEntryToCharacter(entry);
                      onAdded();
                    }}
                  />
                </div>
                <IconButton
                  aria-label={t("custom.libraryDelete", {
                    name: libraryEntryName(entry),
                  })}
                  className="hover:text-error"
                  onClick={() => void handleDelete(entry)}
                >
                  <Icon as={Trash2} size="sm" decorative />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border px-4 py-3">
        <Button variant="secondary" block onClick={() => setCreating(true)}>
          <Icon as={Plus} size="sm" decorative />
          {createLabel}
        </Button>
      </div>
    </div>
  );
}
