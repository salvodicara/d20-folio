/**
 * ChoiceRePicker (#45 / U4 / #32-33) — the shared "re-pick a learned set" modal for the
 * RAW-swappable subclass choices: Fighter maneuvers, Sorcerer metamagic, Warlock
 * invocations, and weapon mastery. The fields + engines existed, but those choices could
 * only be made at level-up — never reviewed or swapped outside it. ONE picker serves them
 * all: the host passes the eligible options + the level's known total + the current set,
 * and gets back the new selection (capped at the total).
 *
 * It renders the SAME unified seal-card picker as the creation / level-up wizards
 * (`OptionGrid` card mode — leading {@link KindSeal}, gold-on-select, FIFO past the limit),
 * so a non-in-place choice reads as one family across the app (the owner's "few elements,
 * reused" rule). When the host supplies `detailFor`, a selected card shows a discreet
 * "More" button that opens the entry's FULL detail — reusing the compendium read view
 * (`CompendiumDetailBody` via each type's compendium spec), the single source of truth.
 *
 * Presentation-only — the host writes the relevant `…Choices` field; the math stays in
 * the per-type pick module. The host remounts this via a `key` keyed on `open`, so a
 * cancelled edit never persists and a fresh open re-seeds from `current`.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalBody, ModalFoot } from "@/components/ui/modal-head";
import { OptionGrid, type OptionGridItem } from "@/components/shared/OptionGrid";
import { Button } from "@/components/ui/button";

export interface ChoiceRePickerOption {
  id: string;
  label: string;
  /** Bilingual search candidates (localized + EN name) so search finds either. */
  searchText?: string;
  /** Optional caveat line under the label (e.g. an invocation prerequisite). */
  note?: ReactNode;
  /** Optional PER-OPTION seal medallion, overriding the group `seal` (e.g. a
   *  per-weapon-type glyph in the weapon-mastery re-pick). */
  chip?: ReactNode;
}

interface ChoiceRePickerProps {
  open: boolean;
  onClose: () => void;
  /** Maximum pickable (the level's known total). */
  max: number;
  options: ReadonlyArray<ChoiceRePickerOption>;
  /** Currently-learned ids (seeds the selection). */
  current: ReadonlyArray<string>;
  onCommit: (ids: string[]) => void;
  /** Diamond eyebrow (e.g. the maneuver subclass's name / "Sorcerer"). */
  eyebrow: string;
  /** Cinzel title (e.g. "Maneuvers" / "Metamagic"). */
  title: string;
  /** The OptionGrid instruction label (e.g. "Choose your maneuvers"). */
  label: string;
  searchPlaceholder?: string;
  /** The leading seal medallion painted on every card (shared {@link KindSeal}). */
  seal?: ReactNode;
  /** Full-detail body for the "More" modal; presence enables the "More" affordance. */
  detailFor?: (id: string) => ReactNode;
  /** Title for the "More" detail modal (the entry's localized name). */
  detailTitleFor?: (id: string) => string;
}

export function ChoiceRePicker({
  open,
  onClose,
  max,
  options,
  current,
  onCommit,
  eyebrow,
  title,
  label,
  searchPlaceholder,
  seal,
  detailFor,
  detailTitleFor,
}: ChoiceRePickerProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([...current]);
  const [moreId, setMoreId] = useState<string | null>(null);

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const items: OptionGridItem[] = options.map((o) => ({
    id: o.id,
    label: o.label,
    searchText: o.searchText ?? o.label,
    chip: o.chip ?? seal,
    note: o.note,
  }));

  const moreBody = moreId && detailFor ? detailFor(moreId) : null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      rubric={eyebrow}
      title={title}
      size="lg"
      // Hug the content so a short set (weapon mastery = a few weapons) doesn't leave
      // a big empty void below the cards. The scrolling `.modal-body` caps at 64vh, so
      // a long set (maneuvers) grows to that cap and scrolls — header + body + pinned
      // footer always fit the 88vh modal.
      compact
    >
      <ModalBody>
        <OptionGrid
          label={label}
          count={selected.length}
          total={max}
          options={items}
          selected={selected}
          onToggle={toggle}
          cols={1}
          // Unified seal-card rendering. `onMore` (when there's a detail to read) shows
          // the "More" button on selected cards; otherwise plain seal cards (`card`).
          card
          // Grow with the content (the `.modal-body` owns the scroll) so the list fills
          // the modal naturally instead of nesting a tiny inner scroll box.
          flush
          onMore={detailFor ? setMoreId : undefined}
          searchPlaceholder={searchPlaceholder}
          // Short, fixed sets (metamagic = 10) don't need a search box.
          searchable={options.length > 12}
        />
      </ModalBody>
      <ModalFoot>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onCommit(selected);
            onClose();
          }}
        >
          {t("common.save")}
        </Button>
      </ModalFoot>

      {/* "More" → full detail, reusing the compendium read view (single source). */}
      <ModalShell
        open={moreBody != null}
        onClose={() => setMoreId(null)}
        title={moreId && detailTitleFor ? detailTitleFor(moreId) : undefined}
        compact
      >
        {moreBody}
      </ModalShell>
    </ModalShell>
  );
}
