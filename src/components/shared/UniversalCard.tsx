/**
 * UniversalCard — the single content molecule (folio §26 "Lemma & Gloss").
 *
 * ONE card for spell = feature = feat = trait = weapon = gear. Collapsed it
 * reads as a serif name (lemma) + ONE verdict chip + a quiet mono gloss; the
 * full facts/description + a Cast/Use/Attack CTA live in an inline accordion
 * (progressive disclosure, `aria-expanded`). It is the highest-leverage seam
 * between the engine's resolved view and the sheet.
 *
 * Modes (the `mode` prop):
 *  - "library"    — default. Chevron toggles the accordion; the open detail can
 *                   carry an action button (Cast/Use) in the foot.
 *  - "with-prep"  — Spells page. Prepends a prepared-toggle column and surfaces
 *                   concentration / ritual / always-prepared(locked) / over-limit
 *                   states; unprepared spells dim + italicise.
 *  - "combat-CTA" — Combat page. Replaces the chevron with an immediate-commit
 *                   CTA column (Cast for spells / Attack for weapons / Use for
 *                   features, + optional chromatic slot pips). Tapping the CTA
 *                   commits NOW (the caller wires spend + log + undo); the CTA
 *                   states usability only — a spent economy token disables it
 *                   (the caller passes the "Used" label; the committed occupant
 *                   adds `ctaCommitted` for the recessed treatment + `active`
 *                   for the gold ring), and reversal lives on the session undo
 *                   system, never on the card. When the card has a description
 *                   the WHOLE row still toggles the inline accordion
 *                   (progressive disclosure), independent of the CTA.
 *
 * Honest blanks: every optional slice (verdict, gloss, facts, higher-levels,
 * tags, slot pips, qty) is omitted when absent — never a "+0"/"0/0"/empty list.
 *
 * Type badges use lucide via the folio `<Icon>` (no emoji); the seal is either a
 * chromatic spell-level seal (`kind="spell"` + `level`) or a kind medallion.
 *
 * This is the sole content card — one card for spell = feature = feat = weapon =
 * gear, across every card-bearing page.
 */

import {
  useId,
  useState,
  type ReactNode,
  type ComponentType,
  type SVGProps,
} from "react";
import {
  ChevronDown,
  Sparkles,
  Gem,
  Star,
  Dna,
  Sword,
  Shield,
  Backpack,
  FlaskRound,
  Circle,
} from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { useRulesTextHighlight } from "@/components/shared/highlightRulesText";
import { MagicMark } from "@/components/ui/folio-marks";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import { cn } from "@/lib/utils";
import type { ActionType } from "@/data/types";
import type { BreakdownLine } from "@/lib/value-breakdown";

/** The action-economy slot that colours the left border. */
export type UniversalCardSlot = ActionType | "nothing";

/** Card kind — drives the seal medallion glyph + colour. */
export type UniversalCardKind =
  | "spell"
  | "feature"
  | "feat"
  | "race"
  | "weapon"
  | "armor"
  | "gear"
  | "potion"
  | "base";

/**
 * Verdict outcome — the ONE chip that summarises what the card does at a glance.
 * Damage types colour-key to the §11 palette; heal/buff/debuff/utility/physical
 * use semantic colours. Maps 1:1 to the `.uc-verdict[data-o]` recipe.
 */
export type VerdictOutcome =
  | "fire"
  | "cold"
  | "lightning"
  | "acid"
  | "thunder"
  | "poison"
  | "necrotic"
  | "radiant"
  | "force"
  | "psychic"
  | "heal"
  | "buff"
  | "debuff"
  | "control"
  | "advantage"
  | "utility"
  | "physical"
  | "neutral";

const KIND_ICON = {
  spell: Sparkles,
  // `feature` gets its own lapidary Gem glyph — distinct from the spell
  // Sparkles (which is ALSO the Spells nav icon). A uniform sparkle on the
  // Features page made every class feature read as "a spell"; Gem fits the
  // Illuminated Folio lapidary motif and carries per-kind information.
  feature: Gem,
  feat: Star,
  race: Dna,
  weapon: Sword,
  armor: Shield,
  gear: Backpack,
  potion: FlaskRound,
  base: Circle,
} as const;

/** Cantrip uses the dedicated `--sl-c` token; levelled spells use `--sl-N`. */
function spellLevelVar(level: number): string {
  return level <= 0 ? "var(--sl-c)" : `var(--sl-${level})`;
}

/** Per-hue, AA-safe seal-digit ink token (paired with `spellLevelVar`). */
function spellLevelInkVar(level: number): string {
  return level <= 0 ? "var(--sl-c-ink)" : `var(--sl-${level}-ink)`;
}

/** Map the slot to the `data-slot` attribute the CSS keys off. */
function slotAttr(slot: UniversalCardSlot): string {
  return slot === "free" ? "nothing" : slot;
}

export interface UniversalCardProps {
  /** Card kind — picks the seal glyph (ignored when `spellLevel` is set). */
  kind: UniversalCardKind;
  /**
   * Optional seal-glyph override (e.g. a per-weapon-type icon from
   * `weaponSealIcon`) — replaces the default `KIND_ICON[kind]` glyph while
   * keeping the kind's medallion pigment. Ignored when `spellLevel` is set.
   */
  sealIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Serif lemma (the name). */
  name: string;
  /** Action-economy slot for the left-border colour. Default "nothing". */
  slot?: UniversalCardSlot;
  /**
   * Spell-level seal (0 = cantrip). When provided the seal renders the chromatic
   * level medallion instead of the kind glyph (spells/cantrips).
   */
  spellLevel?: number;
  /** Bilingual short label for the cantrip seal (EN "CAN" / IT "TRC"). */
  cantripSealLabel?: string;
  /** Quiet mono gloss sub-line (e.g. "Bard 1 · Bonus Action · Short Rest"). Omitted at empty. */
  gloss?: ReactNode;
  /** ONE verdict chip text (e.g. "1d6 Psy", "Heal", "3 / 4"). Omitted when absent. */
  verdict?: ReactNode;
  /** Verdict colour key. Default "neutral". */
  verdictOutcome?: VerdictOutcome;
  /**
   * The COLLAPSED-FACE on-hit rider summary (#87 rider-render) — a single bounded
   * pill the weapon/combat card shows in the gloss band, BESIDE the base-damage
   * verdict, signalling "this hit also triggers extras" at a glance. The fuller
   * rider treatment lives in the accordion detail (progressive disclosure).
   * Omitted (null) when the action carries no rider. Built by `RiderSummary`.
   */
  riderSummary?: ReactNode;
  /**
   * Provenance for the verdict chip — when present the chip ITSELF becomes the
   * breakdown-tip trigger (tap → "Second Wind 1d10 · Fighter level +5"), riding
   * the SAME `BreakdownTip` register as the weapon damage label (golden
   * rule 3: one tip component for every formula decomposition).
   */
  verdictBreakdown?: {
    flavor: "damage" | "heal";
    lines: ReadonlyArray<BreakdownLine>;
  };
  /** Magical source mark (✦) beside the name. */
  magical?: boolean;
  /** Concentration mark beside the name (focus rings glyph). */
  concentration?: boolean;
  /** Ritual tag beside the name. */
  ritual?: boolean;
  /** Owned quantity (gear) shown after the name, e.g. "×3". Omitted at ≤1. */
  quantity?: number;
  /** Inline accordion body (facts / description / higher-levels / foot). */
  children?: ReactNode;

  /** Card mode. Default "library". */
  mode?: "library" | "with-prep" | "combat-CTA";

  // ── with-prep mode ───────────────────────────────────────────────────────
  /** Whether the spell is prepared (with-prep). */
  prepared?: boolean;
  /** Always-prepared / cantrip — prep toggle is locked on. */
  prepLocked?: boolean;
  /** Toggle prepared (with-prep). Omit to render the toggle read-only. */
  onTogglePrepared?: () => void;
  /** Dim + italicise an unprepared spell (with-prep). */
  unprepared?: boolean;

  // ── combat-CTA mode ──────────────────────────────────────────────────────
  /** CTA label (e.g. "Cast", "Attack", "Use"; the caller passes "Undo" when committed). */
  ctaLabel?: ReactNode;
  /** Commit handler — immediate-commit (spend + log + undo wired by caller). */
  onCommit?: () => void;
  /** Disable the CTA (economy spent / out of resources). */
  ctaDisabled?: boolean;
  /**
   * A quiet, persistent inline REASON the CTA is unavailable right now (B2 — the
   * BG3 at-a-glance can/cannot): "Stunned" / "No uses left" / "Reaction spent".
   * Rendered beside the CTA. Omitted when the action is freely usable.
   */
  ctaReason?: ReactNode;
  /**
   * Visually DIM the CTA without hard-disabling it — a condition-blocked card
   * stays tappable so the post-tap toast guard remains the backstop (a block
   * just added is honoured), and the player's own table adjudication wins
   * (override-first). Depleted cards keep `ctaDisabled` (a true hard stop).
   */
  ctaDimmed?: boolean;
  /**
   * BG3 grammar — the CTA turns STRUCK GOLD (the app's lit-primary material +
   * rest bloom, no new keyframe): the attack affordance stays lit while swings
   * remain in the open Attack action. The gold ALONE signals "you can still
   * attack" — no standing label; the count is discoverable via `ctaTitle` (hover)
   * + the sr-only status.
   */
  ctaEmphasis?: boolean;
  /**
   * Native `title` (hover tooltip) on the commit button — used only by the gilt
   * attack affordance to surface the "N of M attacks remaining" count on hover,
   * so the count is discoverable without any standing chrome.
   */
  ctaTitle?: string;
  /**
   * Whether THIS action is the committed occupant of its economy slot this turn.
   * Flips the carved-brass CTA to the recessed spent state (matches the spent
   * econ-token language); the caller pairs it with `active` for the card's
   * committed gold ring, the "Used" label, and `ctaDisabled` — reversal lives
   * on the undo system, never on the card (the CTA grammar).
   */
  ctaCommitted?: boolean;
  /** Slot pips beside the CTA: { level, total, used }. Omitted when absent. */
  slotPips?: { level: number; total: number; used: number };
  /**
   * Accessible name for the combat CTA (bilingual, mirrors the visible label +
   * the card name, e.g. "Cast: Fireball" / "Used: Fireball"). The visible
   * label is just the verb/state word, so the button needs a fuller aria-label.
   */
  ctaAriaLabel?: string;

  // ── shared state ─────────────────────────────────────────────────────────
  /** Active/selected highlight (gold halo) — e.g. concentrating, or combat pick. */
  active?: boolean;
  /** Controlled open state. Omit for uncontrolled (internal) open state. */
  open?: boolean;
  /** Open-change callback (controlled). */
  onOpenChange?: (open: boolean) => void;
  /** Accessible labels (bilingual copy injected by caller). */
  ariaPreparedLabel?: string;
  /**
   * Composed screen-reader facts (bilingual, from the caller) — folds in what
   * the aria-hidden seal/concentration/magic/slot marks can't convey: spell
   * level, concentration, ritual, prepared state, verdict. Rendered as ONE
   * `sr-only` span (NOT as the article's aria-label) so AT reads it once and
   * then the visible name/gloss naturally — no double-announce. Should NOT
   * repeat the visible name (the name is read from the heading).
   */
  srSummary?: string;
  /** Verb for the chevron's accessible name, e.g. "Expand" (bilingual). */
  ariaExpandLabel?: string;
  /** Tooltip for the prepared toggle (bilingual, reflects the current state). */
  preparedTitle?: string;
  /** Tooltip for the magic ✦ mark (bilingual, e.g. "Magical source"). */
  magicTitle?: string;
  /** Tooltip for the concentration ◎ mark (bilingual, e.g. "Requires concentration"). */
  concentrationTitle?: string;
  /**
   * Edit-mode trailing action (icon-only, e.g. a Trash delete) shown in the
   * head's trailing column so it's one tap from the COLLAPSED row. The card
   * must stop propagation on its click. A system-level slot reusable by every
   * card page.
   */
  editAction?: ReactNode;
  /**
   * Whether the card is in edit mode — adds `.is-edit` so the row reclaims the
   * verdict-chip width for the name/gloss on narrow viewports (a play-time cast
   * aid is dead weight while editing, and it forced the name to truncate).
   */
  isEdit?: boolean;
  className?: string;
}

export function UniversalCard({
  kind,
  sealIcon,
  name,
  slot = "nothing",
  spellLevel,
  cantripSealLabel = "CAN",
  gloss,
  verdict,
  verdictOutcome = "neutral",
  riderSummary,
  verdictBreakdown,
  magical,
  concentration,
  ritual,
  quantity,
  children,
  mode = "library",
  prepared,
  prepLocked,
  onTogglePrepared,
  unprepared,
  ctaLabel,
  onCommit,
  ctaDisabled,
  ctaReason,
  ctaDimmed,
  ctaEmphasis,
  ctaTitle,
  ctaCommitted,
  slotPips,
  ctaAriaLabel,
  active,
  open: openProp,
  onOpenChange,
  ariaPreparedLabel,
  srSummary,
  ariaExpandLabel,
  preparedTitle,
  magicTitle,
  concentrationTitle,
  editAction,
  isEdit,
  className,
}: UniversalCardProps) {
  const detailId = useId();
  const [openState, setOpenState] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : openState;
  const hasDetail = children != null;

  function toggle() {
    if (!hasDetail) return;
    const next = !isOpen;
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
  }

  const isSpell = spellLevel !== undefined;
  const seal = spellLevel ?? 0;
  const isCantrip = isSpell && seal <= 0;
  const withPrep = mode === "with-prep";
  const combat = mode === "combat-CTA";

  const SealGlyph = sealIcon ?? KIND_ICON[kind];

  return (
    <article
      className={cn(
        "uc",
        withPrep && "with-prep",
        unprepared && "unprepared",
        active && "is-active",
        isOpen && "is-open",
        isEdit && "is-edit",
        unprepared && !isOpen && "is-dim",
        className
      )}
      data-slot={slotAttr(slot)}
    >
      {/* One sr-only fact summary read once by AT (NOT the article's aria-label
          — that double-announced with the visible name/gloss). Folds in the
          marks AT can't see; phrased not to repeat the visible name. */}
      {srSummary && <span className="sr-only">{srSummary}</span>}
      <div className="uc-head">
        {/* with-prep: prepared toggle */}
        {withPrep && (
          <button
            type="button"
            className="uc-prep"
            data-prepared={prepared || undefined}
            data-locked={prepLocked || undefined}
            aria-pressed={prepLocked ? undefined : !!prepared}
            aria-label={ariaPreparedLabel}
            title={preparedTitle}
            disabled={prepLocked || !onTogglePrepared}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePrepared?.();
            }}
          >
            <PrepGlyph filled={!!prepared || !!prepLocked} />
          </button>
        )}

        {/* Seal — chromatic spell-level OR kind medallion */}
        {isSpell ? (
          <span
            className={cn("uc-seal", "lvl", isCantrip && "cantrip")}
            style={{
              ["--sl" as string]: spellLevelVar(seal),
              ["--sl-ink" as string]: spellLevelInkVar(seal),
            }}
            aria-hidden
          >
            {isCantrip ? cantripSealLabel : seal}
          </span>
        ) : (
          <span className="uc-seal kind" data-kind={kind} aria-hidden>
            <Icon as={SealGlyph} decorative />
          </span>
        )}

        {/* Name cell — lemma + magical/conc/ritual/qty marks */}
        <span className="uc-name-cell">
          <span className="uc-name">{name}</span>
          {magical && (
            <span className="uc-mark-wrap" title={magicTitle} aria-hidden>
              <MagicMark />
            </span>
          )}
          {concentration && (
            <span className="uc-conc" title={concentrationTitle} aria-hidden>
              <ConcentrationGlyph />
            </span>
          )}
          {ritual && <span className="uc-rit">RIT</span>}
          {/* Honest blank: only show quantity when owning more than one. */}
          {quantity != null && quantity > 1 && (
            <span className="uc-qty">×{quantity}</span>
          )}
        </span>

        {/* Gloss sub-line (row 2) — the mono sub-line only. The collapsed-face
            rider summary does NOT ride here: a bonus die beside the to-hit gloss
            ("+8 to hit  +3d6") read as a duplicate of the to-hit. It lives in the
            DAMAGE CLUSTER beside the verdict chip instead (#87). Honest blank. */}
        {gloss != null && gloss !== "" && (
          <span className="uc-gloss-band">
            <span className="uc-gloss">{gloss}</span>
          </span>
        )}

        {/* Damage cluster (grid col 3) — the base-damage VERDICT chip + the
            collapsed-face on-hit RIDER summary, grouped so a bonus die ([1d12+3
            Slsh] [+3d6]) reads unambiguously as EXTRA on-hit damage, not a
            duplicate of the to-hit. Wraps as a UNIT on narrow cards (base + rider
            never split). translate="no" on the verdict: it is a dice/formula token
            ("2d6+5 Fire") a machine translator would mangle; the rest of the card
            stays open to translation (src/lib/dom-resilience.ts crash-proofs it).
            When the chip carries provenance (an evaluated heal formula) it IS the
            breakdown-tip trigger — same register as the weapon damage label. */}
        {(verdict != null && verdict !== "") || riderSummary ? (
          <span className="uc-verdict-cluster">
            {verdict != null &&
              verdict !== "" &&
              (verdictBreakdown ? (
                <span translate="no" className="contents">
                  <BreakdownTip
                    label={verdict}
                    lines={verdictBreakdown.lines}
                    flavor={verdictBreakdown.flavor}
                    outcome={verdictOutcome}
                    className="uc-verdict"
                  />
                </span>
              ) : (
                <span className="uc-verdict" data-o={verdictOutcome} translate="no">
                  {verdict}
                </span>
              ))}
            {riderSummary}
          </span>
        ) : null}

        {/* Edit-mode trailing action (e.g. inline delete) — one tap from the
            collapsed row. Sits above the chevron's row-stretch overlay. */}
        {editAction && <span className="uc-edit-action">{editAction}</span>}

        {/* Trailing column: combat CTA OR accordion chevron */}
        {combat ? (
          <>
            {/* Combat cards keep progressive disclosure: when the card carries a
                description the WHOLE row (name / gloss / seal) toggles the
                accordion via this stretched overlay (z-index 1) — the CTA + pips
                are siblings layered above it (z-index 2) so the explicit
                Cast/Attack/Use commit stays independently clickable WITHOUT
                nesting interactive elements (axe-clean). Mirrors the library
                chevron's `.uc-chevron::before` row-stretch idiom. */}
            {hasDetail && (
              <button
                type="button"
                className="uc-row-toggle"
                aria-expanded={isOpen}
                aria-controls={detailId}
                aria-label={`${ariaExpandLabel ?? "Details"}: ${name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
              />
            )}
            <span className={cn("uc-cta", ctaEmphasis && "is-emphasis")}>
              {ctaReason && (
                <span className="cc-reason" translate="no">
                  {ctaReason}
                </span>
              )}
              <button
                type="button"
                className={cn(
                  "cc-btn",
                  ctaCommitted && "is-committed",
                  ctaDimmed && "is-dimmed"
                )}
                disabled={ctaDisabled}
                title={ctaTitle}
                aria-label={ctaAriaLabel}
                onClick={(e) => {
                  e.stopPropagation();
                  onCommit?.();
                }}
              >
                {ctaLabel}
              </button>
              {slotPips && (
                <SlotPips
                  level={slotPips.level}
                  total={slotPips.total}
                  used={slotPips.used}
                />
              )}
            </span>
          </>
        ) : hasDetail ? (
          // The chevron IS the accordion toggle, but its hit area is stretched
          // to cover the WHOLE row via a `.uc-chevron::before` overlay (see
          // folio.css) — clicking the name / gloss / seal expands the card
          // (the DDB / BG3 whole-row standard, fixing the false-affordance +
          // Fitts's-law failure where only the tiny glyph was clickable). The
          // prep toggle / CTA sit above the overlay (z-index) so they stay
          // independently clickable WITHOUT nesting interactive elements.
          <button
            type="button"
            className="uc-chevron"
            aria-expanded={isOpen}
            aria-controls={detailId}
            aria-label={`${ariaExpandLabel ?? "Details"}: ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
          >
            <Icon as={ChevronDown} decorative />
          </button>
        ) : (
          // Keep the grid column occupied so the layout doesn't collapse.
          <span className="uc-chevron" aria-hidden />
        )}
      </div>

      {/* Inline accordion detail — grid-rows 0fr→1fr animation via CSS.
          Named region so screen readers can announce/skip the disclosed facts;
          a `region` landmark without a name is an axe violation. */}
      {hasDetail && (
        <div className="uc-detail-wrap">
          <div
            className="uc-detail"
            id={detailId}
            role="region"
            aria-label={name}
            // Not `hidden` (display:none) — that snapped the row shut with nothing
            // for the grid-rows transition to animate. `inert` keeps the content
            // in the DOM (so collapse ANIMATES) while removing it from focus + the
            // a11y tree when closed; CSS clips it to 0 height.
            inert={!isOpen}
          >
            {children}
          </div>
        </div>
      )}
    </article>
  );
}

/** Spell-slot pips beside the combat CTA (filled diamonds = available). */
function SlotPips({
  level,
  total,
  used,
}: {
  level: number;
  total: number;
  used: number;
}) {
  const available = Math.max(0, total - used);
  return (
    <span
      className="uc-slotpips"
      role="img"
      aria-label={`${available} / ${total} level-${level} slots available`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn("sp", i >= available && "used")}
          style={{ ["--sl" as string]: spellLevelVar(level) }}
          aria-hidden
        />
      ))}
      <span className="sp-lbl" aria-hidden>
        L{level}
      </span>
    </span>
  );
}

/**
 * Prepared-toggle book glyph. The book SILHOUETTE (cover outline + spine + page
 * lines) is recognizable in EVERY state — `filled` fills the cover body (a clear
 * "marked / prepared" book) while keeping the engraved page lines + spine on top
 * in a contrasting ink so the shape survives; unfilled is the same book in pure
 * outline. So prepared / always-prepared-locked / unprepared differ by SHAPE +
 * FILL (not hue alone): a previously filled flat rectangle had collapsed the book
 * to an indistinguishable square that read as a passive status dot.
 *
 * CRITICAL: folio.css `svg.icon[stroke] { fill: none }` beats the inline `fill`
 * presentation attribute (CSS rule > presentation attr). So the FILLED book uses
 * a TWO-LAYER approach: a stroke-less filled cover path (gets `fill:currentColor`
 * via the `.is-filled` rule, since it carries no `stroke`) UNDER a stroked detail
 * path (spine + page lines) drawn in the inverse ink so the book reads as a book,
 * not a solid tile.
 */
function PrepGlyph({ filled }: { filled?: boolean }) {
  // Book cover silhouette (rounded-spine codex) shared by both states.
  const cover = "M5 4a2 2 0 012-2h11a1 1 0 011 1v16a1 1 0 01-1 1H7a2 2 0 01-2-2z";
  // Spine + two page lines — the detail that keeps the book reading as a book.
  const detail = "M9 5h7M9 9h7M5 4v17";
  if (filled) {
    return (
      <svg className="icon uc-prep-glyph is-filled" viewBox="0 0 24 24" aria-hidden>
        {/* filled cover (no stroke → fill:currentColor wins) */}
        <path d="M5 4a2 2 0 012-2h11a1 1 0 011 1v16a1 1 0 01-1 1H7a2 2 0 01-2-2z" />
        {/* engraved spine + page lines in the inverse ink so the book survives */}
        <path
          className="uc-prep-detail"
          d={detail}
          fill="none"
          stroke="var(--prep-detail-ink, var(--bg-surface-1))"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      className="icon uc-prep-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={cover} />
      <path d={detail} strokeWidth={1.4} />
    </svg>
  );
}

/** Concentration glyph — concentric rings (distinct from the magic ✦). */
function ConcentrationGlyph() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

// ── Detail sub-components (composable accordion building blocks) ───────────────

/** Facts grid (Casting / Range / Save / Duration …). Omits empty entries.
 * Each fact may carry an optional lucide `icon` — the icon-anchored stat row
 * of the typed-document reading spread (quiet, label-ink, never decoration). */
export function UniversalCardFacts({
  facts,
}: {
  facts: {
    label: ReactNode;
    value: ReactNode;
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
  }[];
}) {
  const present = facts.filter((f) => f.value != null && f.value !== "");
  if (present.length === 0) return null;
  return (
    <dl className="uc-facts">
      {present.map((f, i) => (
        <div key={i}>
          <dt>
            {f.icon && <Icon as={f.icon} decorative />}
            {f.label}
          </dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Prose description block. SRD prose may carry inline markdown (`**bold**`,
 * `*italic*`) — string children route through the ONE shared renderer so
 * "**Luck Points.**" reads as bold, never literal asterisks — and wear the
 * rules-text colour grammar (this IS rules prose, on every card type). */
export function UniversalCardDesc({ children }: { children: ReactNode }) {
  const highlight = useRulesTextHighlight();
  if (children == null || children === "") return null;
  if (typeof children === "string") {
    return <InlineMarkdown text={children} className="uc-desc" highlight={highlight} />;
  }
  return <p className="uc-desc">{children}</p>;
}

/** "At Higher Levels" callout. */
export function UniversalCardHigher({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  const highlight = useRulesTextHighlight();
  if (children == null || children === "") return null;
  return (
    <div className="uc-callout uc-higher">
      <h5>{title}</h5>
      {typeof children === "string" ? (
        <InlineMarkdown text={children} highlight={highlight} />
      ) : (
        <p>{children}</p>
      )}
    </div>
  );
}

/** Detail foot: tag list (left) + action button/extra (right). */
export function UniversalCardFoot({
  tags,
  children,
}: {
  tags?: ReactNode[];
  children?: ReactNode;
}) {
  const hasTags = tags != null && tags.length > 0;
  if (!hasTags && children == null) return null;
  return (
    <div className="uc-detail-foot">
      {hasTags ? (
        <div className="uc-tags">
          {tags.map((tag, i) => (
            <span key={i} className="uc-tag">
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}
