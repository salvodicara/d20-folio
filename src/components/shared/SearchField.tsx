/**
 * SearchField — the ONE always-on search input used app-wide (SEARCH1).
 *
 * The owner's ask: "re-use one single component all across the app." Every
 * full-page / picker search (roster · compendium · the creation + level-up
 * pickers) renders THIS — the folio `.search` recipe (gold focus halo, recessed
 * input, hidden native widgets), a leading lens, a conditional clear (×), and the
 * bilingual default placeholder. The dense cockpit tabs use `CollapsibleSearch`,
 * which is the SAME field in its collapse-to-lens mode.
 *
 * `PickerSearch` (the add-modal wrapper) and `OptionGrid`'s inline search both
 * delegate here, so the field is defined once and fixes propagate everywhere.
 */

import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Optional id (e.g. to pair with a `<label htmlFor>`). */
  id?: string;
  /** Extra classes on the `.search` wrapper (layout only). */
  className?: string;
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
  id,
  className,
}: SearchFieldProps) {
  const { t } = useTranslation();
  const label = t("common.search");
  return (
    <div className={cn("search w-full", className)}>
      <Icon as={Search} className="search-icon" decorative />
      <input
        id={id}
        type="search"
        className="input w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `${label}…`}
        aria-label={label}
        autoFocus={autoFocus}
      />
      {/* Conditional clear (×) — folio `.search .clear-btn` recipe (44px hit-slop);
          folio hides the native search clear globally (CO2). */}
      {value && (
        <button
          type="button"
          className="clear-btn"
          aria-label={t("common.clearSearch")}
          onClick={() => onChange("")}
        >
          <Icon as={X} decorative />
        </button>
      )}
    </div>
  );
}
