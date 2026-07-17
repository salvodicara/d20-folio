/**
 * OptionGrid — the ONE selectable-option grid behind every choice picker.
 *
 * Skills, tools, languages, expertise, skill-or-tool, and feat-spell pickers
 * (creation + level-up wizards) were six byte-identical raw-Tailwind grids with a
 * flat `bg-accent/15` selected chip that read as pre-folio. They now all compose
 * this one primitive, so they share: the folio `.search` recipe, a carved-brass
 * `.opt-cell` that lifts to gold-leaf when chosen, a `count / total` counter, and
 * the universal "can't pick past the limit" disable rule.
 *
 * The parent owns the data + selection state; OptionGrid owns search + rendering:
 *   <OptionGrid
 *     label={t("featChoices.pickSkills", { count })}
 *     count={picked.length}
 *     total={slot.amount}
 *     options={skills}            // [{ id, label, badge?, disabled?, title? }]
 *     selected={picked}
 *     onToggle={toggle}
 *   />
 */
import { Fragment, useId, useMemo, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/shared/SearchField";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";

export interface OptionGridItem {
  id: string;
  /** Visible label text. */
  label: string;
  /**
   * Text the search matches against. Defaults to `label`; pass a richer string
   * (e.g. an English spell name alongside the localized one) so a search still
   * finds an item by a name not shown in the current locale.
   */
  searchText?: string;
  /** Optional leading tag, e.g. the "S"/"T" skill-or-tool kind badge. */
  badge?: string;
  /**
   * Optional secondary gloss line under the label (e.g. a species' "30 ft ·
   * Medium", a background's granted skills, a feature's short description).
   * Clamped to 2 lines. Presence promotes the cell to its richer stacked layout.
   */
  meta?: React.ReactNode;
  /**
   * Optional prerequisite / caveat line, rendered in the warning voice under the
   * meta (e.g. an invocation's "Requires: Pact of the Tome"). Also promotes the
   * stacked layout.
   */
  note?: React.ReactNode;
  /**
   * Optional rich chip rendered at the right of the label row — e.g. a chromatic
   * `.sl-chip` spell-level chip or a school tag. Kept verbatim so the committed
   * domain encodings (spell-level colours, etc.) survive unification. Also
   * promotes the stacked layout.
   */
  chip?: React.ReactNode;
  /**
   * Optional leading icon (e.g. a class glyph). In `tile` mode it sits centered
   * above the label; otherwise it leads the label row. Also promotes the
   * stacked layout.
   */
  icon?: React.ReactNode;
  /** Already-owned / otherwise un-pickable. */
  disabled?: boolean;
  /** Native tooltip (e.g. "Already proficient"). */
  title?: string;
  /**
   * Optional rich detail (e.g. a spell/feat's full SRD description) revealed by a
   * per-cell expand chevron, default collapsed, one at a time — so a player can read
   * what they're picking without cluttering the grid (#74). Presence adds the chevron
   * + the collapsible region; cells without it stay the plain selectable button.
   */
  detail?: React.ReactNode;
}

interface Props {
  /** Header rubric on the left (e.g. "Pick 2 skill(s)"). */
  label?: React.ReactNode;
  /** Small chip beside the label (e.g. the source spell list). */
  headerChip?: React.ReactNode;
  /** Currently picked count — drives the counter + the "full" disable rule. */
  count: number;
  /** Maximum pickable. */
  total: number;
  options: ReadonlyArray<OptionGridItem>;
  /** Picked ids. */
  selected: ReadonlyArray<string>;
  onToggle: (id: string) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Hide the search field (short, fixed option sets). Defaults to shown. */
  searchable?: boolean;
  /** Grid columns. Defaults to 2; use 1 for description-heavy rich lists. */
  cols?: 1 | 2 | 3;
  /**
   * Single-select mode (species / background / class / spell-level slot): picking
   * one option does NOT lock the rest — clicking another switches the choice (the
   * parent replaces the single id). Drops the multi-select "full → disable the
   * unpicked" rule and the count/total chip. Defaults to multi-select.
   */
  single?: boolean;
  /**
   * Let the grid grow with its content instead of scrolling inside the locked
   * 11rem viewport — for in-wizard steps that own their own page scroll. Defaults
   * to the scrolling box (modals / fixed-height pickers).
   */
  flush?: boolean;
  /**
   * Centered icon-tile layout (the creation class grid): each cell centers its
   * icon-over-label-over-meta column instead of the default left-aligned row.
   * Pair with each item's `icon`. Defaults to the row layout.
   */
  tile?: boolean;
  /**
   * "More → modal" mode (W2 — the unified spell/feat picker): when provided, cells
   * are SIMPLE selectable cards (name + a chip badge, no in-place description), and a
   * selected card shows a discreet "More" button that calls this with the item id so
   * the host can open a full-detail modal (the compendium read view). Clicking the
   * card selects with the same limit / FIFO auto-replace as the Pick flow. Reading is
   * optional — selecting commits immediately. When set, the in-place accordion path is
   * suppressed.
   */
  onMore?: (id: string) => void;
  /**
   * Render the SAME unified seal-card as the spell/feat picker (single carved card,
   * leading seal, gold-on-select, FIFO auto-replace past the limit) WITHOUT a "More"
   * detail modal — for the homogeneous in-place proficiency picks (skills · tools ·
   * languages · expertise) whose options are just names with nothing to read. Pair with
   * each option's `chip` (its {@link KindSeal}) and `cols={1}`. `onMore` implies this.
   */
  card?: boolean;
  /**
   * Paint the selected card in the REMOVE voice (vermilion) instead of the gold "pick"
   * voice — for the level-up "Replace a Spell" step, where selecting marks the spell to
   * be removed. Only meaningful with `onMore` / `card`. Defaults to the pick voice.
   */
  removing?: boolean;
}

export function OptionGrid({
  label,
  headerChip,
  count,
  total,
  options,
  selected,
  onToggle,
  searchPlaceholder,
  emptyMessage,
  searchable = true,
  cols = 2,
  single = false,
  flush = false,
  tile = false,
  onMore,
  card = false,
  removing = false,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  // Detail cells (spells / feats) are an accordion. Expansion is independent of
  // selection so a player reads before committing. The rule: at most ONE *unselected*
  // ("browse") card is open at a time, but *selected* cards are an exception — they
  // stay re-expandable so you can review / deselect them without disturbing the browse
  // card (owner: "the accordion rule makes an exception for the selected one").
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const searchId = useId();

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Opening an unselected card collapses any other unselected one; selected
        // cards stay open (the exception).
        if (!selected.includes(id)) {
          for (const other of [...next]) {
            if (other !== id && !selected.includes(other)) next.delete(other);
          }
        }
      }
      return next;
    });
  }

  function pick(id: string) {
    const wasSelected = selected.includes(id);
    // Auto-replace (multi-select): at the limit, picking another drops the OLDEST pick
    // (FIFO) so the player keeps choosing without hunting for one to deselect first.
    // Single-select pickers already replace via their own onToggle.
    if (!wasSelected && !single && total > 0 && selected.length >= total) {
      const oldest = selected[0];
      if (oldest != null && oldest !== id) onToggle(oldest);
    }
    onToggle(id);
    // Picking closes that card so you move on; un-picking leaves it open so the change
    // is visible and you can re-pick.
    if (!wasSelected) {
      setExpandedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((o) => matchesSearch(query, o.searchText ?? o.label));
  }, [options, query]);

  // Multi-select locks the unpicked once full; single-select never does (picking
  // another just switches), and shows no count chip.
  const complete = !single && count >= total;

  return (
    <>
      {(label || headerChip) && (
        <div className="opt-head">
          <span className="opt-head-label">
            {label}
            {headerChip && <span className="opt-head-chip">{headerChip}</span>}
          </span>
          {!single && (
            <span className="opt-count" data-complete={complete}>
              {count} / {total}
            </span>
          )}
        </div>
      )}
      {searchable && (
        // SEARCH1 — the SAME shared field as the roster + compendium (was a bespoke
        // 14rem-capped input that looked different from them). Full-width within the
        // picker, with the clear (×) affordance.
        <SearchField
          id={searchId}
          className="opt-search"
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder}
        />
      )}
      <div
        className="opt-grid"
        data-cols={cols === 3 ? "3" : cols === 1 ? "1" : undefined}
        data-flush={flush ? "" : undefined}
        data-tile={tile ? "" : undefined}
      >
        {filtered.map((opt) => {
          const isSelected = selected.includes(opt.id);
          const disabled = opt.disabled || (!isSelected && complete);
          // A cell is "rich" (stacked layout) when it carries a gloss, a caveat,
          // a chip, an icon, or detail; otherwise it stays the compact single-row chip.
          const rich =
            opt.meta != null ||
            opt.note != null ||
            opt.chip != null ||
            opt.icon != null ||
            opt.detail != null;
          const cellContent = rich ? (
            <>
              {opt.icon != null && (
                <span className="opt-cell-icon" aria-hidden>
                  {opt.icon}
                </span>
              )}
              <span className="opt-cell-row">
                {opt.badge && <span className="opt-badge">{opt.badge}</span>}
                <span className="opt-cell-label">{opt.label}</span>
                {opt.chip && <span className="opt-cell-chip">{opt.chip}</span>}
              </span>
              {opt.meta != null && <span className="opt-cell-meta">{opt.meta}</span>}
              {opt.note != null && <span className="opt-cell-note">{opt.note}</span>}
            </>
          ) : (
            <>
              {opt.badge && <span className="opt-badge">{opt.badge}</span>}
              <span className="opt-cell-label">{opt.label}</span>
            </>
          );
          const cellButton = (
            <button
              type="button"
              aria-pressed={isSelected}
              disabled={disabled}
              title={opt.title}
              onClick={() => onToggle(opt.id)}
              className={rich ? "opt-cell rich" : "opt-cell"}
            >
              {cellContent}
            </button>
          );
          // W2 — the ONE unified spell/feat/proficiency picker card: a single carved card
          // that paints gold-leaf when selected. Inside (left → right): the leading seal,
          // then the name, then — only when there's something to read (`onMore`) and the
          // card is selected — a discreet "More" button opening the full-detail modal. The
          // whole card commits on click (FIFO past the limit); reading the detail is optional.
          if (onMore || card) {
            return (
              <div
                key={opt.id}
                className="opt-cell-wrap"
                data-selected={isSelected ? "" : undefined}
                data-removing={removing ? "" : undefined}
              >
                <div className="opt-more-card">
                  <button
                    type="button"
                    className="opt-more-select"
                    aria-pressed={isSelected}
                    disabled={opt.disabled}
                    title={opt.title}
                    onClick={() => pick(opt.id)}
                  >
                    {/* The chromatic level/cantrip SEAL sits on the LEFT (action-card
                        consistency), then the name. */}
                    {opt.chip && <span className="opt-more-seal">{opt.chip}</span>}
                    {opt.badge && <span className="opt-badge">{opt.badge}</span>}
                    <span className="opt-cell-label">{opt.label}</span>
                    {opt.note != null && (
                      <span className="opt-cell-note">{opt.note}</span>
                    )}
                  </button>
                  {/* "More" → full-detail modal, on the RIGHT, only when SELECTED and
                      there's something to read (proficiency cards omit it). Stamping a
                      detail icon on every row overwhelmed the list (owner, 2026-06-10);
                      the focused card alone carries the affordance — read on demand,
                      list stays calm. */}
                  {onMore && isSelected && (
                    <button
                      type="button"
                      className="opt-more"
                      onClick={() => onMore(opt.id)}
                    >
                      {t("common.more")}
                    </button>
                  )}
                </div>
              </div>
            );
          }
          // No detail → the plain selectable cell (unchanged path for every existing
          // picker). With detail → the action-card pattern (#74 / D43–D45): click the
          // row to EXPAND its description (accordion, one at a time), then commit with
          // the "Pick" button inside the expanded card — so a player is invited to read
          // before choosing, and browsing is fully independent of selecting. The picked
          // state shows on the collapsed row (gold check) so choices read at a glance.
          if (opt.detail == null) return <Fragment key={opt.id}>{cellButton}</Fragment>;
          // The lemma content is shared by both detail modes.
          const bodyMain = (
            <span className="opt-cell-body-main">
              {opt.icon != null && (
                <span className="opt-cell-icon" aria-hidden>
                  {opt.icon}
                </span>
              )}
              <span className="opt-cell-row">
                {opt.badge && <span className="opt-badge">{opt.badge}</span>}
                <span className="opt-cell-label">{opt.label}</span>
                {opt.chip && <span className="opt-cell-chip">{opt.chip}</span>}
              </span>
              {opt.meta != null && <span className="opt-cell-meta">{opt.meta}</span>}
              {opt.note != null && <span className="opt-cell-note">{opt.note}</span>}
            </span>
          );
          // Detail cells (spells): click to browse the description (accordion), commit
          // with the Pick button; picking past the limit FIFO-replaces. (Feats don't
          // use `detail` — their description rides the always-visible `meta`, which
          // un-clamps in place when the feat is selected; see the .opt-cell-meta rule.)
          const expanded = expandedIds.has(opt.id);
          return (
            <div
              key={opt.id}
              className="opt-cell-wrap"
              data-selected={isSelected ? "" : undefined}
              data-expanded={expanded ? "" : undefined}
            >
              <button
                type="button"
                className="opt-cell-body"
                aria-expanded={expanded}
                onClick={() => toggleExpand(opt.id)}
              >
                {bodyMain}
                <Icon
                  as={ChevronDown}
                  size="xs"
                  decorative
                  className={cn("opt-body-chev", expanded && "open")}
                />
              </button>
              {expanded && (
                <div className="opt-cell-detail">
                  <div className="opt-cell-detail-prose">{opt.detail}</div>
                  <div className="opt-cell-pick-row">
                    <button
                      type="button"
                      className="opt-pick-btn"
                      aria-pressed={isSelected}
                      disabled={opt.disabled}
                      title={opt.title}
                      onClick={() => pick(opt.id)}
                    >
                      {isSelected && <Icon as={Check} size="xs" decorative />}
                      {isSelected ? t("common.picked") : t("common.pick")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="opt-empty">{emptyMessage ?? t("featChoices.noMatches")}</p>
      )}
    </>
  );
}
