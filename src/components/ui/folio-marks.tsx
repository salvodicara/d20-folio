/**
 * Folio decorative primitives — shared SVG marks + gem badges (§ tokens).
 *
 * - MagicMark    — glittery white-gold ✦ flagging a MAGICAL SOURCE (twinkles).
 * - FocusMark    — concentric-rings concentration marker (scale-pulse).
 *   These two are intentionally DISTINCT: ✦ = magic source, ◎ = concentration.
 * - LevelSeal    — spell-level gem badge; pass the chromatic `level` (0–9).
 * - ProficiencyDot — 4-state dot (none / half / proficient / expertise).
 *
 * SVG paths are ported byte-faithful from previews/folio_design/00-foundation.html.
 * Motion is driven by the global `[data-motion]` rules in folio.css.
 */

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface MarkProps {
  className?: string;
  /** Accessible label; omit for a purely decorative mark. */
  label?: string;
}

export function MagicMark({ className, label }: MarkProps) {
  return (
    <span
      className={cn("magic-mark", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" />
      </svg>
    </span>
  );
}

export interface FocusMarkProps extends MarkProps {
  style?: CSSProperties;
}

export function FocusMark({ className, label, style }: FocusMarkProps) {
  return (
    <span
      className={cn("focus-mark", className)}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    </span>
  );
}

// NOTE: the `.lvl-seal` and `.pr-dot` recipes live in folio.css and are applied
// RAW (className) by the spell pickers / HUD / StatCard — the wrapper components
// that once owned them were unused and were removed (2026-06-08 dead-code sweep).
