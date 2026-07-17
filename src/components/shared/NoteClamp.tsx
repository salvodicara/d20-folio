/**
 * NoteClamp — the ONE bounded-preview recipe for user-authored prose that can
 * grow indefinitely (a shared note, a session summary, a chronicle chapter).
 *
 * Collapsed, the body is capped at a per-variant max-height; when the content
 * MEANINGFULLY overflows that cap, the cut edge fades out and a quiet
 * `.rh-action` "Show more" reveals the full text IN PLACE — the page scrolls,
 * never a nested scrollbar (the D27 reading rule: prose flows, inner scroll
 * regions are a reading anti-pattern). "Show less" collapses back per instance.
 *
 * The bound only ENGAGES past a TOLERANCE threshold (owner, 2026-06-12: a
 * chronicle chapter that hid only a fraction of its scene-break separator still
 * showed "Show more" — a click that reveals nothing is pure friction). The cap
 * is a soft reading bound, not a hard layout guarantee: when the hidden remainder
 * is under the threshold the content renders UNCLAMPED — no cap, no fade, no
 * affordance — identical to the short-note path. Overflow is measured live off
 * the DOM (and re-checked on resize, since narrower wraps change the verdict),
 * so the verdict can never drift from what is actually rendered, in either
 * direction across the threshold.
 *
 * Variants:
 *  - `note`     — a tight cap for at-a-glance card lists (shared notes).
 *  - `reading`  — a generous cap for prose the user already chose to open
 *                 (a session summary behind its accordion, a chronicle chapter);
 *                 typical entries fit untouched, only the pathological ones clamp.
 */

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "note" | "reading";
  className?: string;
  children: ReactNode;
}

/**
 * The clamp engages only when it would reveal at least this many LINES of prose.
 *
 * Why 3: "Show more" earns its place only if expanding shows the reader a short
 * paragraph's worth of new text — one or two cut lines (or a trailing scene-break
 * separator) don't change what the entry says, so hiding them trades a click for
 * nothing. Three lines is also strictly taller than the chronicle's whole `---`
 * scene-break block (2 × `--sp-8` margins + the 1px hairline ≈ 65px vs
 * 3 × ~24–27px line-height ≈ 72–81px), so the owner's case — a chapter whose only
 * hidden content was part of that separator — can never summon the affordance.
 * Line-height is read off the body's computed style, so the threshold scales with
 * each variant's typography.
 */
const MEANINGFUL_OVERFLOW_LINES = 3;

/** Resolve the px threshold for "meaningful" hidden content under `el`. */
function meaningfulThreshold(el: HTMLElement): number {
  const cs = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(cs.lineHeight);
  const fontSize = Number.parseFloat(cs.fontSize);
  // `line-height: normal` (or a layout-less test DOM) parses NaN — approximate
  // with the CSS-typical 1.5 × font-size, then a 16px-base constant.
  const line = Number.isFinite(lineHeight)
    ? lineHeight
    : Number.isFinite(fontSize)
      ? fontSize * 1.5
      : 24;
  return MEANINGFUL_OVERFLOW_LINES * line;
}

export function NoteClamp({ variant = "note", className, children }: Props) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  // Measure ONLY while collapsed; expanded keeps its "Show less" until the user
  // collapses, at which point this re-runs and the affordance drops away if the
  // content was edited down under the cap. Below the tolerance the body renders
  // UNCAPPED, so the cap is applied inline JUST for the read (and restored in the
  // same synchronous frame — nothing ever paints capped): hidden-vs-cap stays
  // measurable in both states, so crossing the threshold either way (an edit, a
  // narrower wrap) flips the verdict live. The setState bails out when the
  // verdict is unchanged, so this cannot loop.
  useLayoutEffect(() => {
    if (expanded) return;
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const prevMax = el.style.maxHeight;
      const prevOverflow = el.style.overflow;
      el.style.maxHeight = "var(--note-clamp-max)";
      el.style.overflow = "hidden";
      const hidden = el.scrollHeight - el.clientHeight;
      el.style.maxHeight = prevMax;
      el.style.overflow = prevOverflow;
      setClamped(hidden >= meaningfulThreshold(el));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, children]);

  return (
    <div
      className={cn(
        "note-clamp",
        variant === "reading" && "note-clamp--reading",
        className
      )}
      data-collapsed={(!expanded && clamped) || undefined}
    >
      <div ref={bodyRef} id={bodyId} className="note-clamp-body">
        {children}
      </div>
      {(clamped || expanded) && (
        <button
          type="button"
          className="rh-action self-start"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon as={expanded ? ChevronUp : ChevronDown} size="xs" decorative />
          {expanded ? t("common.showLess") : t("common.showMore")}
        </button>
      )}
    </div>
  );
}
