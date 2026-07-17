/**
 * Badge — folio "Tonal" chip atom (§18).
 *
 * ONE primitive parameterised by `--bd-c` (the chip color). Domain chips pass a
 * token: `<Badge color="var(--dmg-fire)">…`. The border is the FULL color (never
 * mixed with transparent — that washes out in light theme). Variants:
 *   tonal (default) · solid · outline · muted · emphasized.
 * Optional leading dot/glyph and a dismiss button (controlled by the caller).
 */

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "tonal" | "solid" | "outline" | "muted" | "emphasized";
export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps {
  children: ReactNode;
  /** CSS color (raw token, e.g. `var(--dmg-fire)`). Defaults to the gold accent. */
  color?: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Show a small leading dot in the chip color. */
  dot?: boolean;
  /** A leading glyph (rendered in the chip color, display font). */
  glyph?: ReactNode;
  /** When set, renders a dismiss (×) button calling this handler. */
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  tonal: "",
  solid: "solid",
  outline: "outline",
  muted: "muted",
  emphasized: "emphasized",
};

export function Badge({
  children,
  color,
  variant = "tonal",
  size = "md",
  dot,
  glyph,
  onDismiss,
  dismissLabel = "Remove",
  className,
  style,
  title,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "badge",
        VARIANT_CLASS[variant],
        size === "sm" && "sm",
        size === "lg" && "lg",
        className
      )}
      style={color ? { ["--bd-c" as string]: color, ...style } : style}
      title={title}
    >
      {dot ? <span className="bd-dot" aria-hidden="true" /> : null}
      {glyph ? (
        <span className="bd-glyph" aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      {children}
      {onDismiss ? (
        <button
          type="button"
          className="bd-dismiss"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <X width={12} height={12} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
