/**
 * Wizard F chrome — the owner-approved B step chrome, shared VERBATIM by both
 * wizards (creation + level-up): progress ORBS, the centered chapter eyebrow /
 * title / hint, an optional FORK row (boon kind, spell-slot tabs), the docked
 * Quick-start/Guided PATH plaques, and the footer NAV.
 *
 * PIXEL-STABILITY CONTRACT (owner): "while navigating through the wizards all
 * the headers and fixed things among screens stay still so the user doesn't
 * feel the jumps." The hint slab reserves TWO lines (CSS `min-height`) and the
 * orbs/title rows are fixed-height — so step swaps never shift the fixed
 * chrome. The fork row renders ONLY on the step that has one (fb3, owner
 * 2026-06-11: an empty reserved slab read as a void between the chrome and
 * the first card — the chrome→content rhythm must be IDENTICAL on every step,
 * so nothing below the hint is reserved).
 */
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, BookOpen, Check, Zap } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { useRealmBackdrop } from "@/hooks/useRealmBackdrop";
import { cn } from "@/lib/utils";

// ─── Step model ───────────────────────────────────────────────────────────────

export interface WizardStepDef {
  /** Stable step id. */
  id: string;
  /** Localized orb tooltip / nav label. */
  label: string;
  /** Optional orb glyph shown while the step is CURRENT (level-up canon). */
  glyph?: ComponentType<SVGProps<SVGSVGElement>>;
}

// ─── The frame ────────────────────────────────────────────────────────────────

export function WizardFrame({
  paths,
  children,
  nav,
}: {
  /** The docked Quick-start/Guided plaques (creation only). */
  paths?: ReactNode;
  children: ReactNode;
  /** The footer navigation row. */
  nav?: ReactNode;
}) {
  // The wizards' own realm scene — the Ritual of Making (per-theme pair,
  // DESIGN.md §13) — replaces the app-wide study backdrop while EITHER wizard
  // (creation / level-up) is mounted: the frame is their one shared chrome, so
  // mounting the realm here covers both.
  useRealmBackdrop("var(--asset-creation-scene)");
  return (
    <div className="wiz on-art-scope">
      {paths}
      {children}
      {nav}
    </div>
  );
}

// ─── Progress orbs + chapter title ────────────────────────────────────────────

export function WizardChrome({
  steps,
  current,
  eyebrow,
  title,
  hint,
  fork,
  onStepClick,
  freeJump = false,
  stepEnabled,
}: {
  steps: ReadonlyArray<WizardStepDef>;
  current: number;
  eyebrow: string;
  title: string;
  /** The two-line teaching hint. May carry inline `GlossaryTip` slots (P2) via
   *  `<Trans>`, so a D&D term inside the rubric glosses itself on demand. */
  hint: ReactNode;
  /** The fork row (boon kind / mode tabs) under the hint, when the step has one. */
  fork?: ReactNode;
  /** Jump to an already-visited step by clicking its orb (back-only on-rails). */
  onStepClick?: (index: number) => void;
  /** Allow jumping FORWARD too (creation: steps are independently editable). */
  freeJump?: boolean;
  /**
   * Forward-gating (B6): a FUTURE orb is also clickable when this returns true
   * for its index (level-up: every step before it is complete). Visited orbs
   * are always reachable; `freeJump` overrides everything.
   */
  stepEnabled?: (index: number) => boolean;
}) {
  const { t } = useTranslation();
  // B2 — the orb row MORPHS when the step list changes (the multiclass fork /
  // the creation class swap): keying the row content by the step signature
  // remounts it through the ~180ms `wiz-orbs-swap` cross-fade, so the count
  // change reads as a transition, never a snap. The row's reserved min-height
  // keeps the chrome below pixel-stable throughout.
  const signature = steps.map((s) => s.id).join("|");
  return (
    <header className="wiz-chrome">
      {/* role=group permits the label (a bare div may not carry aria-label);
          an EMPTY step list keeps the slab as a spacer so the chrome height
          never shifts between modes. */}
      <div
        className="wiz-orbs"
        {...(steps.length > 0
          ? { role: "group", "aria-label": t("wizard.progress") }
          : { "aria-hidden": true })}
      >
        <span key={signature} className="wiz-orbs-row">
          {steps.map((step, i) => {
            const Glyph = step.glyph;
            const visited = i < current;
            const clickable =
              onStepClick != null && (freeJump || visited || (stepEnabled?.(i) ?? false));
            return (
              <span key={step.id} className="wiz-orb-stop">
                <button
                  type="button"
                  className={cn("wiz-orb", visited && "done", i === current && "current")}
                  title={step.label}
                  aria-label={step.label}
                  aria-current={i === current ? "step" : undefined}
                  disabled={!clickable}
                  onClick={clickable ? () => onStepClick(i) : undefined}
                >
                  {visited ? (
                    <Icon as={Check} size="xs" decorative />
                  ) : i === current && Glyph ? (
                    <Icon as={Glyph} size="xs" decorative />
                  ) : (
                    <span className="tnum">{i + 1}</span>
                  )}
                </button>
                {i < steps.length - 1 && <span className="wiz-orb-rule" aria-hidden />}
              </span>
            );
          })}
        </span>
      </div>
      <p className="wiz-eyebrow on-art">{eyebrow}</p>
      <h2 className="wiz-title on-art">{title}</h2>
      <p className="wiz-hint on-art">{hint}</p>
      {fork != null && <div className="wiz-fork-slot">{fork}</div>}
    </header>
  );
}

// ─── Live-morph value (B2) ────────────────────────────────────────────────────

/**
 * A value that CROSS-FADES (~180ms folio easing) when it changes instead of
 * snapping — the B2 live-morph grammar for every number the multiclass fork
 * (or any in-step choice) rewrites: the HP die average, the "PF: a → b" range,
 * a plaque eyebrow. Keyed remount + the `wiz-morph` enter animation; the
 * wrapper is inline-block so the swap never reflows its line.
 */
export function MorphValue({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      key={
        typeof children === "string" || typeof children === "number"
          ? String(children)
          : undefined
      }
      className={cn("wiz-morph", className)}
    >
      {children}
    </span>
  );
}

// ─── Fork tabs (boon kind · spell-slot tabs · lineage options) ────────────────

export function WizardForkTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="wiz-fork-tab"
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ─── Quick-start / Guided path plaques ────────────────────────────────────────

export function WizardPaths({
  mode,
  onMode,
}: {
  mode: "quick" | "guided";
  onMode: (m: "quick" | "guided") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="wiz-paths" role="group" aria-label={t("create.modeToggle")}>
      <button
        type="button"
        className="wiz-path"
        aria-pressed={mode === "quick"}
        onClick={() => onMode("quick")}
      >
        <span className="wiz-path-glyph">
          <Icon as={Zap} size="sm" decorative />
        </span>
        <span className="wiz-path-name">{t("create.quickStart")}</span>
        <span className="wiz-path-gloss">{t("wizard.quickGloss")}</span>
      </button>
      <button
        type="button"
        className="wiz-path"
        aria-pressed={mode === "guided"}
        onClick={() => onMode("guided")}
      >
        <span className="wiz-path-glyph">
          <Icon as={BookOpen} size="sm" decorative />
        </span>
        <span className="wiz-path-name">{t("create.guided")}</span>
        <span className="wiz-path-gloss">{t("wizard.guidedGloss")}</span>
      </button>
    </div>
  );
}

// ─── The page-turn navigation (owner 2026-06-11: no bar, no scrolling) ────────

/**
 * Wizard navigation as PAGE TURNS — the folio is a book, the steps are pages.
 * On wide viewports two carved seals ride the side GUTTERS, fixed at the
 * vertical centre of the viewport (always at hand, zero content occlusion):
 * Back on the left (quiet), Continue on the right (gilt), each with its
 * destination named beneath. Below the gutter breakpoint they fold into a
 * compact floating cluster at the bottom-right (a pill, not a bar). The user
 * never scrolls to navigate; the orbs above remain the fast jumper.
 *
 * Back is ALWAYS live: on the first step it walks OUT of the wizard (the
 * caller passes the exit handler + label), guarded by the same leave-confirm
 * blocker as browser back — one confirm seam.
 */
export function WizardNav({
  backLabel,
  nextLabel,
  nextShort,
  onBack,
  onNext,
  nextDisabled = false,
  loading = false,
  commit = false,
}: {
  /** The PREVIOUS step's label — or the exit label on the first step. */
  backLabel: string;
  /** The forward CTA ("Continue to <next>" / the final confirm label). */
  nextLabel: string;
  /** The COMPACT forward caption (the bare destination) — phones swap to it so
   *  the pill never overflows or ellipses (owner fb3, 2026-06-11). */
  nextShort?: string;
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  loading?: boolean;
  /** TRUE only on the final commit step (Create / Confirm): marks the next seal
   *  with a one-shot gold bloom on press (the ceremony). */
  commit?: boolean;
}) {
  // The ceremony bloom is a one-shot: armed on the commit press, cleared when the
  // ::after animation ends (reduced motion collapses the animation to ~0ms, so it
  // still fires and clears — never a stuck state).
  const [blooming, setBlooming] = useState(false);
  return (
    <nav className="wiz-pager">
      <button
        type="button"
        className="wiz-pager-btn back"
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
      >
        <span className="wiz-pager-seal" aria-hidden>
          <Icon as={ArrowLeft} size="sm" decorative />
        </span>
        <span className="wiz-pager-cap cap-full">{backLabel}</span>
      </button>
      <button
        type="button"
        className={cn("wiz-pager-btn next", commit && "commit", blooming && "blooming")}
        onClick={() => {
          if (commit) setBlooming(true);
          onNext();
        }}
        onAnimationEnd={(e) => {
          if (e.animationName === "pager-bloom") setBlooming(false);
        }}
        disabled={nextDisabled || loading}
        aria-label={nextLabel}
        aria-busy={loading || undefined}
        title={nextLabel}
      >
        <span className="wiz-pager-seal gold" aria-hidden>
          {loading ? (
            <Spinner size="sm" onBrass />
          ) : (
            <Icon as={ArrowRight} size="sm" decorative />
          )}
        </span>
        <span className="wiz-pager-cap cap-full">{nextLabel}</span>
        {nextShort && <span className="wiz-pager-cap cap-short">{nextShort}</span>}
      </button>
    </nav>
  );
}
