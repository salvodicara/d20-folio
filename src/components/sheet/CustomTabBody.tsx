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
 *  - LIST — search + one `PickerRow` per entry, EXACTLY as the SRD tabs of these same
 *    modals behave: TAP the row → the entry's DETAIL leg → Add from its footer. Only
 *    the two MANAGEMENT actions (which have no SRD counterpart) sit in a right-edge
 *    `IconButton` cluster, top-aligned on the name line: edit · delete. They are
 *    SIBLINGS of the row button, never nested in it, so a tap on either can't reach
 *    the row (the `UniversalCard` head pattern, axe-clean).
 *  - DETAIL — the entry read-only through the SHARED `CompendiumDetailBody` the SRD
 *    legs wear (eyebrow · meta grid · description) with the standard
 *    `PickerDetailFooter` Add + Back. Same body-swap mechanism as the form legs.
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

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ModalScroll } from "@/components/ui/modal-head";
import { useTranslation } from "react-i18next";
import { ArrowLeft, PencilLine, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import {
  PickerDetailFooter,
  PickerRow,
  PickerSearch,
} from "@/components/sheet/picker-parts";
// LEAF imports (not the picker barrel): the barrel re-exports every concrete spec, so
// pulling the detail scaffold through it would drag the whole compendium spec set into
// any chunk this tab lands in.
import { CompendiumDetailBody } from "@/features/compendium/picker/detail";
import type { PickerDetailView } from "@/features/compendium/picker/types";
import { useCharacterStore } from "@/stores/characterStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { matchesSearch } from "@/lib/search";
import { castingTimeI18nKey } from "@/lib/utils";
import { localizeTrackerRecovery } from "@/lib/views/tracker-view";
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

/** Append one library entry to the character array its kind belongs to, `quantity`
 *  copies deep (the two quantity-bearing kinds; the others ignore it). */
function addEntryToCharacter(entry: LibraryEntry, quantity: number): void {
  const store = useCharacterStore.getState();
  const doc = store.character;
  if (!doc) return;
  const data = doc.character;
  const landed = entryToCharacterItem(entry, quantity);
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
  onDetailTitle,
}: {
  /** Which entry kinds this modal lists + lands (the item modal takes two). */
  kinds: readonly LibraryKind[];
  /** Label of the bar that swaps to the create form (an existing `custom.*` key). */
  createLabel: string;
  /** The modal's own Custom form: blank to create, or prefilled to edit an entry. */
  renderForm: (edit?: LibraryEditRequest) => ReactNode;
  /** Called after a successful add — each modal's existing close behaviour. */
  onAdded: () => void;
  /**
   * Report the open entry's name so the host `ModalShell` title reflects it — the
   * SAME seam `CompendiumPicker` drives from the SRD leg, so a modal's title behaves
   * identically whichever tab is reading (owner, v4 verification).
   */
  onDetailTitle?: (title: string | null) => void;
}) {
  const { t } = useTranslation();
  const entries = useLibraryStore((s) => s.entries);
  const removeFromLibrary = useLibraryStore((s) => s.removeFromLibrary);
  const updateEntry = useLibraryStore((s) => s.updateEntry);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LibraryEntry | null>(null);
  const [viewing, setViewing] = useState<LibraryEntry | null>(null);
  // D55 — the add-time count for the open detail, reset per entry like the SRD leg's.
  const [quantity, setQuantity] = useState(1);

  // Keep the host modal title in sync with the open detail — mirrors the SRD leg's
  // own effect (`CompendiumPicker`), including the revert on Back / tab change.
  useEffect(() => {
    onDetailTitle?.(viewing ? libraryEntryName(viewing) : null);
  }, [viewing, onDetailTitle]);

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
   * The one-line reading under the name: the kind, plus its cheapest fact. A row
   * drops the kind when this modal lands only one (a spell modal's rows are all
   * spells); the detail eyebrow always names it.
   */
  function meta(entry: LibraryEntry, withKind = kinds.length > 1): string {
    const parts: Array<string | undefined> = withKind
      ? [t(LIBRARY_KIND_LABEL_KEY[entry.kind])]
      : [];
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

  /**
   * The entry's facts as the SHARED picker detail shape — so a homebrew reads in the
   * SAME scaffold (eyebrow · meta grid · description) as every SRD entry in these
   * modals, for free. Labels are the existing keys each field already uses elsewhere.
   */
  function detailView(entry: LibraryEntry): PickerDetailView {
    const grid: NonNullable<PickerDetailView["meta"]> = [];
    let description: string | undefined;
    switch (entry.kind) {
      case "spell": {
        const spell = entry.item;
        grid.push(
          {
            label: t("spells.castingTime"),
            // Same normalization the spell card applies to a CUSTOM spell's stored
            // casting time (the create form writes one of these tokens).
            value: t(`srd.castingTime_${castingTimeI18nKey(spell.castingTime)}`),
          },
          { label: t("spells.range"), value: spell.range },
          { label: t("spells.duration"), value: spell.duration },
          {
            label: t("spells.components"),
            value: [
              spell.components.v && "V",
              spell.components.s && "S",
              spell.components.m && "M",
            ]
              .filter(Boolean)
              .join(", "),
            term: "components",
          }
        );
        if (spell.concentration)
          grid.push({
            label: t("spells.concentration"),
            value: t("common.yes"),
            term: "concentration",
          });
        description = spell.description;
        break;
      }
      case "weapon": {
        const weapon = entry.item;
        grid.push(
          {
            label: t("custom.damageDie"),
            value: `${weapon.damageDie} ${t(`srd.damage_${weapon.damageType}`)}`,
          },
          {
            label: t("custom.attackStat"),
            value: t(`abilities.${weapon.attackStat}_short`),
          }
        );
        if (weapon.properties)
          grid.push({ label: t("custom.properties"), value: weapon.properties });
        description = weapon.description;
        break;
      }
      case "equipment": {
        const item = entry.item;
        if (item.armorCategory)
          grid.push({
            label: t("custom.armorCategory"),
            // The SRD category family every other surface uses (equipment spec).
            value: t(`srd.armorCategory_${item.armorCategory}`),
          });
        if (item.acBonus != null)
          grid.push({ label: t("custom.acBonus"), value: String(item.acBonus) });
        if (item.charges)
          grid.push({
            label: t("equipment.charges"),
            value: `${item.charges.current} / ${item.charges.max}`,
          });
        if (item.tracked || item.isConsumable)
          grid.push({ label: t("equipment.trackUses"), value: t("common.yes") });
        if (item.isConsumable)
          grid.push({ label: t("equipment.autoRemove"), value: t("common.yes") });
        if (item.potionFormula)
          grid.push({ label: t("custom.healingFormula"), value: item.potionFormula });
        description = item.description;
        break;
      }
      case "feature": {
        const feature = entry.item;
        grid.push({ label: t("custom.source"), value: feature.source });
        const tracker = feature.trackers?.[0];
        if (tracker) {
          grid.push({ label: t("custom.totalUses"), value: tracker.total });
          // The ONE place a Recovery token becomes a word (golden rule 6).
          const recovery = localizeTrackerRecovery(tracker.recovery, t);
          if (recovery) grid.push({ label: t("custom.recovery"), value: recovery });
        }
        // A feature's content IS its blocks: the text ones read as the description.
        description = feature.contentBlocks
          .map((block) => block.text)
          .filter(Boolean)
          .join("\n\n");
        break;
      }
    }
    return {
      eyebrow: meta(entry, true),
      meta: grid,
      description: description || undefined,
    };
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

  // DETAIL — the SRD flow, for homebrew: the tapped row opens the shared read
  // scaffold, and the standard footer commits the add (each modal's close-on-add
  // behaviour) or goes Back to the list.
  if (viewing) {
    // The quantity-bearing kinds get the SAME stepper the SRD equipment/magic-item
    // legs show (the shared footer builds it); a spell or feature gets none, exactly
    // as its own SRD leg gets none.
    const counts = viewing.kind === "equipment" || viewing.kind === "weapon";
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <CompendiumDetailBody view={detailView(viewing)} />
        <PickerDetailFooter
          alreadyAdded={false}
          onAdd={() => {
            addEntryToCharacter(viewing, counts ? quantity : 1);
            onAdded();
          }}
          onBack={() => setViewing(null)}
          quantity={counts ? { value: quantity, onChange: setQuantity } : undefined}
        />
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
      <ModalScroll className="flex-1">
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
                <li key={entry.id} className="flex items-start gap-1">
                  {/* The row IS the reading leaf, exactly like an SRD row: tapping it
                      opens the detail, where Add lives. */}
                  <span className="min-w-0 flex-1">
                    <PickerRow
                      name={name}
                      meta={meta(entry)}
                      ariaLabel={name}
                      onClick={() => {
                        setQuantity(1);
                        setViewing(entry);
                      }}
                    />
                  </span>
                  {/* MANAGEMENT only (no SRD counterpart), seated on the name line as
                      SIBLINGS of the row button — never nested, so neither glyph can
                      trigger the row's tap. */}
                  <span className="flex shrink-0 items-start gap-0.5">
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
      </ModalScroll>
      <div className="border-t border-border px-4 py-3">
        <Button variant="secondary" block onClick={() => setCreating(true)}>
          <Icon as={Plus} size="sm" decorative />
          {createLabel}
        </Button>
      </div>
    </div>
  );
}
