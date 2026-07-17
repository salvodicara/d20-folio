/**
 * Spinner — folio "Brass Gyre" loading atom.
 *
 * The small, INLINE busy indicator for control- and region-level waits (the login
 * sign-in CTA, a portrait crop, a hero-banner thumb). Page/content-level loading uses
 * the unified `FolioLoader` (the rolling gilt d20) instead — this is only for spots
 * where a tiny inline ring is the right scale. A carved gold ring with a brighter
 * sweeping arc, theme-aware (gilt-on-slate dark /
 * deep-gold-ink light) and reduced-motion safe: under `[data-motion="reduced"]`
 * (or OS prefers-reduced-motion) the arc degrades to a steady full ring at
 * reduced opacity — it reads as "busy", never as a frozen/broken partial arc
 * (the failure mode of a raw `animate-spin` ring stalled by the global
 * motion kill-switch).
 *
 * Sizes: sm (16px) · md (24px, default) · lg (36px). `label` sets the
 * accessible name (defaults to a generic "Loading"); render a visible caption
 * separately when the surface wants one.
 */

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Accessible name; falls back to the i18n "common.loading" string. */
  label?: string;
  /** On the gold-leaf brass CTA the ring must read on a gold field — flips the
   * arc to the deep-ink tone. */
  onBrass?: boolean;
  className?: string;
}

export function Spinner({ size = "md", label, onBrass, className }: SpinnerProps) {
  const { t } = useTranslation();
  const a11yLabel = label ?? t("common.loading");
  return (
    <span
      className={cn("spinner", `spinner-${size}`, onBrass && "on-brass", className)}
      role="status"
      aria-label={a11yLabel}
    />
  );
}
