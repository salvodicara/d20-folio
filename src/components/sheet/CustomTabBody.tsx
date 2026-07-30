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
 *  - LIST — search + one row per entry: the name/meta reading on the left, and ALL
 *    THREE actions as one right-edge icon cluster, top-aligned with the name line —
 *    add-to-sheet · edit · delete (the delete behind the house confirm). The cluster
 *    sits at the far right, never beside the name: a `+` adjacent to "Emberfang Blade"
 *    reads as a magic-item suffix, not a control (owner, 2026-07-30).
 *  - CREATE / EDIT — the EXISTING `CustomSpellForm` / `CustomEquipmentForm` /
 *    `CustomFeatureForm`, rendered by the modal through `renderForm`, with a Back
 *    affordance that returns WITHOUT saving. The pencil renders the same form
 *    PRE-FILLED and commits an id-keyed `updateEntry` — the template changes, the
 *    character's copies do not. An EMPTY library skips the list entirely and opens on
 *    the create form (with a one-line hint that whatever you create is kept) — a blank
 *    list would be a dead end.
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
import { ArrowLeft, PencilLine, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { PickerSearch } from "@/components/sheet/picker-parts";
import { useCharacterStore } from "@/stores/characterStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { matchesSearch } from "@/lib/search";
import {
  entryToCharacterItem,
  LIBRARY_KIND_LABEL_KEY,
  libraryEntryName,
  type LibraryDraft,
  type LibraryEntry,
  type LibraryKind,
} from "@/lib/library";

/**
 * What the tab hands its modal when the pencil opens an entry: the entry to prefill
 * from (discriminated, so the modal narrows to its own form's item type without a
 * cast) and the commit that saves the rebuilt draft back to THAT entry.
 */
export interface LibraryEditRequest {
  entry: LibraryEntry;
  onSave: (draft: LibraryDraft) => void;
}

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
  renderForm,
  onAdded,
}: {
  /** Which entry kinds this modal lists + lands (the item modal takes two). */
  kinds: readonly LibraryKind[];
  /** Label of the bar that swaps to the create form (an existing `custom.*` key). */
  createLabel: string;
  /** The modal's own Custom form: blank to create, or prefilled to edit an entry. */
  renderForm: (edit?: LibraryEditRequest) => ReactNode;
  /** Called after a successful add — each modal's existing close behaviour. */
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const entries = useLibraryStore((s) => s.entries);
  const removeFromLibrary = useLibraryStore((s) => s.removeFromLibrary);
  const updateEntry = useLibraryStore((s) => s.updateEntry);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LibraryEntry | null>(null);

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

  /** The form leg: a Back bar (or the first-run hint) above the modal's own form. */
  function formLeg(back: (() => void) | null, form: ReactNode) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {back ? (
          <div className="border-b border-border-subtle px-4 py-2">
            <Button size="sm" variant="ghost" onClick={back}>
              <Icon as={ArrowLeft} size="sm" decorative />
              {t("common.back")}
            </Button>
          </div>
        ) : (
          <p className="border-b border-border-subtle px-4 py-2 text-[0.72rem] italic text-text-secondary">
            {t("custom.libraryAutoHint")}
          </p>
        )}
        {form}
      </div>
    );
  }

  // EDIT — the same form, prefilled. Saving rewrites THIS entry (id-keyed, so a rename
  // keeps its identity) and returns to the list. The character's copies are untouched
  // BY DESIGN: an entry is a template, and a sheet item is an independent copy of it
  // (the same one-way relationship the delete confirm teaches).
  if (editing) {
    return formLeg(
      () => setEditing(null),
      renderForm({
        entry: editing,
        onSave: (draft) => {
          updateEntry(editing.id, draft);
          setEditing(null);
        },
      })
    );
  }

  // Nothing of this kind kept yet → the tab IS the create form (a blank list would
  // be a dead end), with the one line that explains where creations go.
  if (creating || mine.length === 0) {
    return formLeg(mine.length === 0 ? null : () => setCreating(false), renderForm());
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
          <ul className="flex flex-col gap-1.5">
            {rows.map((entry) => {
              const name = libraryEntryName(entry);
              return (
                // `items-start` seats the action cluster on the NAME line of a
                // two-line row (it used to float mid-row), and `flex-1` on the
                // reading keeps the cluster pinned to the far right edge — a `+`
                // sitting next to the name reads as a magic-item suffix.
                <li key={entry.id} className="flex items-start gap-3 px-1">
                  <span className="pick-body">
                    <span className="pick-name">{name}</span>
                    <span className="pick-meta">{meta(entry)}</span>
                  </span>
                  <span className="flex shrink-0 items-start gap-0.5">
                    <IconButton
                      aria-label={t("custom.libraryAdd", { name })}
                      onClick={() => {
                        addEntryToCharacter(entry);
                        onAdded();
                      }}
                    >
                      <Icon as={Plus} size="sm" decorative />
                    </IconButton>
                    <IconButton
                      aria-label={t("common.editNamed", { name })}
                      onClick={() => setEditing(entry)}
                    >
                      <Icon as={PencilLine} size="sm" decorative />
                    </IconButton>
                    <IconButton
                      aria-label={t("custom.libraryDelete", { name })}
                      className="hover:text-error"
                      onClick={() => void handleDelete(entry)}
                    >
                      <Icon as={Trash2} size="sm" decorative />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
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
