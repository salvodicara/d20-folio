/**
 * Wizard F PICK LIST — the ONE generic F-family picker for every in-wizard
 * choice pool (owner 2026-06-11: "NO pre-F picker may remain anywhere in either
 * wizard"). It wears the morph-list voice (`.wiz-entry`/`.wiz-row` rows, golden
 * seals, the gold-ceremony picked state, the wax check) in two row modes:
 *
 *  - PROSE options (`description` set) — read-then-choose: a tap unfolds the
 *    reading spread; an explicit Choose/Learn commits (an exploratory tap never
 *    burns a pick — the spell-list contract).
 *  - FACT options (no description — skills, tools, languages, weapons) — a tap
 *    commits directly; the row is compact (there is nothing to read first).
 *
 * Selection capping is the CALLER's logic (FIFO replace / hard cap) via
 * `onToggle`; the list renders state, never invents rules. The `removing` voice
 * paints picked rows vermilion (the spell-swap "replace this" half).
 *
 * Rows are `memo`ized with primitive-ish props so toggling one row never
 * re-renders the full pool (the D smoothness fix — the 300ms long task on the
 * old full-list re-render).
 */
import { memo, useCallback, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, Check, ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/shared/SearchField";
import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { rankedSearch } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useEnthroneAnchor } from "./use-enthrone-anchor";
import { WizardFold } from "./fold";

export interface WizardPickOption {
  /** Stable id — the list binds to and emits THIS (golden rule 7). */
  id: string;
  name: string;
  /** One-line gloss on the collapsed row (mastery note, prerequisite, cost). */
  gloss?: string;
  /** Mono eyebrow above the name while open (kind / category line). */
  eyebrow?: string;
  /** Markdown prose — present ⇒ the row is read-then-choose. */
  description?: string;
  /** Golden seal glyph slot (`KindSeal` / `SpellLevelSeal`). */
  seal?: ReactNode;
  /** Bilingual tier-1 search anchor (localized + EN name); defaults to `name`. */
  searchText?: string;
  /** Bilingual tier-2 search corpus (localized + EN description) — when set,
   *  a ≥3-char query also surfaces description hits AFTER every name hit. */
  searchDesc?: string;
  disabled?: boolean;
  /** The disabled reason ("Already taken") — shown in place of the gloss. */
  note?: string;
}

export function WizardPickList({
  options,
  selected,
  onToggle,
  total,
  label,
  searchPlaceholder,
  searchable,
  removing = false,
  chooseLabel,
  onRead,
  readLabel,
}: {
  options: ReadonlyArray<WizardPickOption>;
  selected: ReadonlyArray<string>;
  /** Commit/release a pick — capping (FIFO/hard) is the caller's rule. */
  onToggle: (id: string) => void;
  /** How many the pool requires (the n/total counter). */
  total: number;
  /** The head rubric; omit for a bare list (the head is the host's). */
  label?: ReactNode;
  searchPlaceholder?: string;
  /** Defaults to `options.length > 12`. */
  searchable?: boolean;
  /** Vermilion picked voice (the swap's "spell being replaced"). */
  removing?: boolean;
  /** Localized commit-button text for prose rows; default `wizard.choose`. */
  chooseLabel?: (name: string) => string;
  /**
   * COMPACT-DETAIL mode (the asks-column / design-lab pattern, owner fb3
   * 2026-06-11): when set, EVERY row is a compact fact row that commits on
   * tap — no inline prose unfolds — and a PICKED row grows the open-book
   * affordance (detail on SELECTED only) that calls this with the option id.
   * The caller opens the shared `PickerDetailModal` read view.
   */
  onRead?: (id: string) => void;
  /** Localized open-book aria/title; default `wizard.readSpell`. */
  readLabel?: (name: string) => string;
}) {
  const { t } = useTranslation();
  const scopeRef = useRef<HTMLDivElement>(null);
  const remember = useEnthroneAnchor(scopeRef);
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);

  const showSearch = searchable ?? options.length > 12;
  // Two-tier ranked search (fb4): name hits first, description hits appended.
  const visible = rankedSearch(
    query,
    options,
    (o) => o.searchText ?? o.name,
    (o) => o.searchDesc
  );
  // FACT pools (no prose anywhere) pack into a responsive GRID of compact
  // carved cells — a full-width row per two-word skill reads huge and cheap
  // (owner 2026-06-11). Prose pools stay a single reading column. In
  // compact-detail mode every pool is a fact pool (prose lives in the modal).
  const factGrid =
    options.length > 0 && (onRead != null || options.every((o) => !o.description));

  const onHeader = useCallback(
    (id: string, hasProse: boolean) => {
      remember(id);
      if (hasProse) setFocusId((prev) => (prev === id ? null : id));
      else onToggle(id);
    },
    [remember, onToggle]
  );
  const onCommit = useCallback(
    (id: string) => {
      remember(id);
      onToggle(id);
    },
    [remember, onToggle]
  );

  return (
    <div className="wiz-pick">
      {label != null && (
        <p className="wiz-pick-head">
          <span className="wiz-pick-label">{label}</span>
          <span className={cn("wiz-count tnum", selected.length >= total && "full")}>
            {selected.length} / {total}
          </span>
        </p>
      )}
      {showSearch && (
        <SearchField
          className="wiz-search wiz-pick-search"
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder ?? t("common.search")}
        />
      )}
      <div className={cn("wiz-list", factGrid && "wiz-list-grid")} ref={scopeRef}>
        {visible.map((o) => (
          <PickRow
            key={o.id}
            opt={o}
            picked={selected.includes(o.id)}
            open={focusId === o.id}
            removing={removing}
            chooseText={
              chooseLabel ? chooseLabel(o.name) : t("wizard.choose", { name: o.name })
            }
            removeText={t("common.remove")}
            readText={
              onRead
                ? readLabel
                  ? readLabel(o.name)
                  : t("wizard.readSpell", { name: o.name })
                : undefined
            }
            onHeader={onHeader}
            onCommit={onCommit}
            onRead={onRead}
          />
        ))}
        {visible.length === 0 && <p className="wiz-empty">{t("common.noResults")}</p>}
      </div>
    </div>
  );
}

/**
 * ONE row — memoized so a pick/expand elsewhere re-renders only the rows whose
 * state actually changed (D: never the whole pool).
 */
const PickRow = memo(function PickRow({
  opt,
  picked,
  open,
  removing,
  chooseText,
  removeText,
  readText,
  onHeader,
  onCommit,
  onRead,
}: {
  opt: WizardPickOption;
  picked: boolean;
  open: boolean;
  removing: boolean;
  chooseText: string;
  removeText: string;
  readText?: string;
  onHeader: (id: string, hasProse: boolean) => void;
  onCommit: (id: string) => void;
  onRead?: (id: string) => void;
}) {
  // Compact-detail mode (`onRead`) suppresses the inline unfold: the row is a
  // fact row, the prose lives behind the picked row's open-book modal.
  const hasProse = !!opt.description && !onRead;
  return (
    <div
      className="wiz-entry"
      data-fid={opt.id}
      data-open={open ? "" : undefined}
      data-picked={picked && !removing ? "" : undefined}
      data-removing={picked && removing ? "" : undefined}
    >
      <button
        type="button"
        className={cn("wiz-row", !hasProse && "wiz-row-fact")}
        aria-expanded={hasProse ? open : undefined}
        aria-pressed={hasProse ? undefined : picked}
        disabled={opt.disabled && !picked}
        title={opt.name}
        onClick={() => onHeader(opt.id, hasProse)}
      >
        {opt.seal}
        <span className="wiz-row-main">
          {opt.eyebrow && <span className="wiz-row-eyebrow">{opt.eyebrow}</span>}
          <span className="wiz-row-name">{opt.name}</span>
          {(opt.note ?? opt.gloss) && (
            <span className="wiz-row-gloss">{opt.note ?? opt.gloss}</span>
          )}
        </span>
        {hasProse ? (
          picked ? (
            <span className="wiz-row-check" aria-hidden>
              <Icon as={Check} size="xs" decorative />
            </span>
          ) : (
            <Icon
              as={ChevronDown}
              size="xs"
              decorative
              className={cn("wiz-chev", open && "open")}
            />
          )
        ) : (
          /* FACT rows keep the check medallion in the DOM — a reserved slot at
             the row's right edge, shown/hidden by the entry's picked state, so
             the appear/disappear is ONE symmetric CSS transition and the label
             never shifts when a pick lands (owner fb4). */
          <span className="wiz-row-check" aria-hidden>
            <Icon as={Check} size="xs" decorative />
          </span>
        )}
      </button>
      {/* Detail on SELECTED only (the lab/B pattern): the picked row grows the
          open-book affordance → the shared compendium read view. */}
      {onRead && picked && (
        <button
          type="button"
          className="wiz-book"
          aria-label={readText}
          title={readText}
          onClick={() => onRead(opt.id)}
        >
          <Icon as={BookOpenText} size="xs" decorative />
        </button>
      )}
      {hasProse && (
        <WizardFold open={open}>
          <div className="wiz-read">
            <BlockMarkdown className="wiz-read-prose" text={opt.description ?? ""} />
            <div className="wiz-read-act">
              {picked ? (
                <Button variant="ghost" onClick={() => onCommit(opt.id)}>
                  {removeText}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={opt.disabled}
                  onClick={() => onCommit(opt.id)}
                >
                  {chooseText}
                </Button>
              )}
            </div>
          </div>
        </WizardFold>
      )}
    </div>
  );
});
