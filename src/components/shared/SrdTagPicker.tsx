/**
 * SrdTagPicker
 *
 * Multi-select tag-input backed by an SRD roster — ID-FIRST (golden rule 7). The
 * MANUAL value is two stable arrays: catalogue IDS (`valueIds`) + verbatim custom
 * labels (`customLabels`, the ONE place an off-catalogue label lives). A localized
 * token NEVER survives as a verbatim display string — only `custom*` is
 * single-locale (homebrew, by definition).
 *
 * The effective chips (`effective` — manual ids ∪ custom ∪ engine-granted, deduped
 * + localized) come PRECOMPUTED from the presenter (`effectiveLanguageTokens` /
 * `effectiveToolTokens`), so the picker, the cockpit rail, and the Bio read-only
 * view can never drift (single source of truth). The picker renders:
 *   - GRANTED tokens → LOCKED chips (you cannot remove a build-granted proficiency);
 *   - manual catalogue ids → removable chips (removal drops the id from `valueIds`);
 *   - custom labels → removable chips (removal drops the label from `customLabels`);
 *   - a pending UMBRELLA (`umbrellaId`) is NEVER offered as a chip here (the
 *     dropdown excludes `pickable: false` options; the presenter surfaces it as a
 *     "choose one kind of X" pending choice elsewhere).
 *
 * Edit-mode only; play mode reads the joined display string from the same presenter.
 */

import { useState, useRef, useCallback } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useTranslation } from "react-i18next";
import { X, Plus, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";
import type { EffectiveProficiencyToken } from "@/lib/views/sheet-view";

export interface SrdOption {
  id: string;
  name: { en: string; it: string };
  /**
   * `false` = the option can be HELD (so it must localize when present) but is NOT
   * offered in the add-dropdown. Used only for the generic tool UMBRELLAS (Musical
   * Instrument / Gaming Set / Artisan's Tools) — a grant surfaces the category, but
   * a player picks a CONCRETE tool, not the umbrella. Omitted = offerable (default).
   */
  pickable?: boolean;
}

interface Props {
  /** The catalogue roster the add-dropdown offers (id + bilingual name). */
  options: ReadonlyArray<SrdOption>;
  /** The PRECOMPUTED effective tokens (manual ids ∪ custom ∪ granted), from the
   *  presenter — the SINGLE source the rail/read-view share. */
  effective: ReadonlyArray<EffectiveProficiencyToken>;
  /** The stored MANUAL catalogue ids (what removing an id-chip edits). */
  valueIds: ReadonlyArray<string>;
  /** The stored MANUAL custom (off-catalogue) labels. */
  customLabels: ReadonlyArray<string>;
  /** Replace the manual catalogue ids. */
  onChangeIds: (ids: string[]) => void;
  /** Replace the manual custom labels. */
  onChangeCustom: (labels: string[]) => void;
  label: string;
  placeholder?: string;
}

export function SrdTagPicker({
  options,
  effective,
  valueIds,
  customLabels,
  onChangeIds,
  onChangeCustom,
  label,
  placeholder,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "it" ? "it" : "en";

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close + clear the dropdown on outside pointerdown / Escape (shared, capture-phase).
  useDismissOnOutside(open, containerRef, () => {
    setOpen(false);
    setSearch("");
  });

  const removeId = useCallback(
    (id: string) => onChangeIds(valueIds.filter((v) => v !== id)),
    [valueIds, onChangeIds]
  );
  const removeCustom = useCallback(
    (labelToRemove: string) =>
      onChangeCustom(customLabels.filter((l) => l !== labelToRemove)),
    [customLabels, onChangeCustom]
  );

  /** Add a catalogue option by its STABLE ID (idempotent). */
  const addOption = useCallback(
    (opt: SrdOption) => {
      if (!valueIds.includes(opt.id)) onChangeIds([...valueIds, opt.id]);
      setSearch("");
      inputRef.current?.focus();
    },
    [valueIds, onChangeIds]
  );

  /** Add a custom (off-catalogue) entry as a verbatim label (homebrew). */
  const addCustomEntry = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (customLabels.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
        setSearch("");
        return;
      }
      onChangeCustom([...customLabels, trimmed]);
      setSearch("");
      inputRef.current?.focus();
    },
    [customLabels, onChangeCustom]
  );

  // Filter the add-dropdown: exclude non-pickable umbrellas + already-effective ids.
  const effectiveIds = new Set(
    effective.map((tk) => tk.id).filter((id): id is string => id !== null)
  );
  const filtered = options.filter((o) => {
    if (o.pickable === false) return false; // umbrellas localize but aren't offered
    if (effectiveIds.has(o.id)) return false; // already held (manual or granted)
    return matchesSearch(search, o.name[locale], o.name.en);
  });

  // Is the current search text a valid custom entry? True ONLY when there is
  // truly NO catalogue match (golden rule 7 — bind ids, not display strings):
  // reuses the SAME fuzzy `filtered` the dropdown renders, so a search that
  // ambiguously matches one or more real SRD entries never offers — or falls
  // through Enter to — an off-catalogue homebrew duplicate.
  const searchIsCustom =
    search.trim().length > 0 &&
    filtered.length === 0 &&
    !customLabels.some((l) => l.toLowerCase() === search.trim().toLowerCase());

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const onlyMatch = filtered.length === 1 ? filtered[0] : undefined;
      if (onlyMatch !== undefined) {
        addOption(onlyMatch);
      } else if (searchIsCustom) {
        addCustomEntry(search);
      }
    } else if (e.key === "Backspace" && search === "") {
      // Remove the last MANUAL chip (an id, else a custom label).
      const lastId = valueIds[valueIds.length - 1];
      const lastCustom = customLabels[customLabels.length - 1];
      if (lastId !== undefined) removeId(lastId);
      else if (lastCustom !== undefined) removeCustom(lastCustom);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Tag container + search input */}
      <div
        className={cn(
          "flex min-h-[2rem] flex-wrap items-center gap-1 rounded border bg-bg-tertiary px-2 py-1 cursor-text",
          open ? "border-accent" : "border-border"
        )}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {effective.map((tok) =>
          tok.granted ? (
            // GRANTED → locked chip: the engine grants this proficiency, so it
            // cannot be removed here (on-rails). A small lock glyph + muted style
            // distinguishes it from the player's manual picks.
            <span
              key={`granted:${tok.id ?? tok.label}`}
              title={t("srdTagPicker.granted")}
              className="flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[0.65rem] font-medium text-text-secondary ring-1 ring-inset ring-border"
            >
              <Lock className="h-2.5 w-2.5 text-text-muted" aria-hidden />
              {tok.label}
            </span>
          ) : (
            <span
              key={`manual:${tok.id ?? tok.label}`}
              className="flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[0.65rem] font-medium text-text-primary"
            >
              {tok.label}
              <button
                type="button"
                aria-label={t("srdTagPicker.remove", { name: tok.label })}
                onClick={(e) => {
                  e.stopPropagation();
                  if (tok.id !== null) removeId(tok.id);
                  else removeCustom(tok.label);
                }}
                className="ml-0.5 rounded text-text-secondary hover:text-danger transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )
        )}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={effective.length === 0 ? (placeholder ?? label) : ""}
          aria-label={label}
          className="min-w-[4rem] flex-1 bg-transparent text-[0.7rem] text-text-primary outline-none placeholder:text-text-secondary"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-bg-secondary shadow-lg">
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onMouseDown={(e) => {
                  // Prevent input blur before we handle the click
                  e.preventDefault();
                  addOption(opt);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.72rem] text-text-primary transition-colors hover:bg-bg-tertiary"
              >
                {opt.name[locale]}
              </button>
            ))}
            {/* Custom entry affordance */}
            {searchIsCustom && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addCustomEntry(search);
                }}
                className="flex w-full items-center gap-2 border-t border-border-subtle px-3 py-1.5 text-left text-[0.72rem] text-text-secondary transition-colors hover:bg-bg-tertiary"
              >
                <Plus className="h-3 w-3 shrink-0 text-accent" />
                <span>{t("srdTagPicker.addCustom", { name: search.trim() })}</span>
              </button>
            )}
            {filtered.length === 0 && !searchIsCustom && (
              <p className="px-3 py-2 text-center text-[0.65rem] italic text-text-secondary">
                {t("featChoices.noMatches")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
