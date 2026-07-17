/**
 * Shared building blocks for the "add" modals (Spell · Equipment · Magic Item ·
 * Feature). These four searchable list/detail modals had drifted apart — three
 * search-input variants, two row markups (`.spell-pick-row` vs raw `rounded-xl
 * border` boxes), and two filter-chip implementations. They now compose this one
 * small set so every add-modal reads as the same Illuminated-Folio surface:
 *
 *   <PickerSearch value={q} onChange={setQ} placeholder={…} />   // folio .search
 *   <FilterChip label={…} active={…} onClick={…} />              // folio .fchip
 *   <PickerRow leading={…} name={…} meta={…} trailing={…} />     // folio .pick-row
 */
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/shared/SearchField";

/**
 * The add-modal search — the shared `SearchField` (SEARCH1) inside the modal's
 * `border-b` chrome wrapper. `bare` drops the wrapper for in-page use (e.g. the
 * roster filter, which supplies its own layout).
 */
export function PickerSearch({
  value,
  onChange,
  placeholder,
  autoFocus,
  bare = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Drop the modal `border-b` chrome wrapper — for in-page use (e.g. the
   *  roster filter, which supplies its own `.roster-search` layout wrapper). */
  bare?: boolean;
}) {
  const field = (
    <SearchField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  );
  if (bare) return field;
  return <div className="border-b border-border-subtle px-4 py-2">{field}</div>;
}

/** The folio `.fchip` filter chip — active state via aria-pressed. */
export function FilterChip({
  label,
  active,
  onClick,
  count,
  small = false,
  ariaLabel,
}: {
  label: ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  small?: boolean;
  /** Full accessible name when the visible label is a bare glyph (a "3" level
   *  numeral chip announces "Level 3"; the "C" seal announces "Cantrip"). */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn("fchip", small && "fchip-sm")}
    >
      {label}
      {count != null && <span className="fc-count">{count}</span>}
    </button>
  );
}

/**
 * One option row: leading slot (icon / level seal) · name + meta · trailing slot
 * (added / above-level badge). Renders the shared `.pick-row` recipe.
 */
export function PickerRow({
  leading,
  name,
  meta,
  trailing,
  state = "default",
  current,
  onClick,
  disabled,
  title,
  ariaLabel,
}: {
  leading?: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  state?: "default" | "added" | "warn";
  /** This row's entry is the OPEN reading leaf (the compendium spread) — the
   *  seated-selection treatment + `aria-current`, so the index always shows
   *  where the reader is. Omitted wherever selection closes the list. */
  current?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className="pick-row"
      data-state={state === "default" ? undefined : state}
      data-current={current ? "" : undefined}
      aria-current={current ? "true" : undefined}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      {leading}
      <span className="pick-body">
        <span className="pick-name">{name}</span>
        {meta != null && <span className="pick-meta">{meta}</span>}
      </span>
      {trailing}
    </button>
  );
}

/**
 * The detail-view action bar shared by all four add-modals: a primary "Add"
 * (folio Button, not a raw `bg-accent` button) that flips to an "already added"
 * note, with an optional secondary "Back" beside it. Standardizes the footer that
 * had drifted into three different markups.
 */
export function PickerDetailFooter({
  alreadyAdded,
  onAdd,
  onBack,
  addLabel,
  quantityControl,
}: {
  alreadyAdded: boolean;
  onAdd: () => void;
  /** When provided, renders a secondary Back button beside Add. */
  onBack?: () => void;
  addLabel?: ReactNode;
  /** D55 — optional add-time quantity control, shown above the buttons. */
  quantityControl?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-border px-4 py-3">
      {quantityControl && !alreadyAdded && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {quantityControl}
        </div>
      )}
      <div className="flex gap-2">
        {onBack && (
          <Button variant="secondary" block onClick={onBack}>
            {t("common.back")}
          </Button>
        )}
        {alreadyAdded ? (
          <div className="flex flex-1 items-center justify-center text-sm font-medium text-success">
            {t("common.alreadyAdded")}
          </div>
        ) : (
          <Button block onClick={onAdd}>
            <Icon as={Plus} size="sm" decorative />
            {addLabel ?? t("common.addToCharacter")}
          </Button>
        )}
      </div>
    </div>
  );
}
