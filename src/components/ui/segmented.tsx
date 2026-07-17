/**
 * Segmented — folio segmented control (§ selection).
 *
 * A small carved track of mutually-exclusive options (e.g. Theme dark/light/
 * system, Motion auto/reduced, sheet Play/Edit). Implemented as a radio-style
 * group: arrow keys move selection, the active option carries `aria-pressed`
 * and the brass gradient. Generic over the option value type.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible label when `label` is an icon-only node. */
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Optional domain pigment for the active tile (a color token, e.g.
   * `"var(--lvl-accent)"`). Defaults to the brand gold; pass a pigment where the
   * surface is colour-coded (the level-up wizard's per-step ASI toggle) — it keeps
   * the same premium struck-tile treatment + readable ink, just in that hue.
   */
  accent?: string;
  /** Group label for assistive tech. */
  "aria-label"?: string;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accent,
  "aria-label": ariaLabel,
  className,
}: SegmentedProps<T>) {
  const move = (dir: 1 | -1): void => {
    const i = options.findIndex((o) => o.value === value);
    if (i < 0) return;
    const next = (i + dir + options.length) % options.length;
    const target = options[next];
    if (target) onChange(target.value);
  };
  return (
    <div
      className={cn("seg", accent && "accent", className)}
      style={accent ? { ["--seg-accent" as string]: accent } : undefined}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            aria-label={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
