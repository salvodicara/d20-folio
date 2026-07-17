/**
 * InfoCard — thin wrapper for the folio `.info-card` surface.
 *
 * The `.info-card` is the standard inset content panel (carved vellum tile)
 * used across the sheet for grouped read/edit fields. This wrapper just emits
 * the className contract so call sites stop hand-writing `className="info-card"`
 * and the optional `flush` (no inner padding) modifier stays consistent.
 *
 * Usage:
 *   <InfoCard>…</InfoCard>
 *   <InfoCard flush as="section">…</InfoCard>
 */

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InfoCardProps extends HTMLAttributes<HTMLElement> {
  /** Drop the inner padding (e.g. when the card hosts a full-bleed list). */
  flush?: boolean;
  /** Element tag — defaults to "div" (lists render the surface on `ul`/`li`,
   *  a prose callout on `p`). */
  as?: "div" | "section" | "article" | "ul" | "li" | "p";
}

export function InfoCard({
  flush,
  as = "div",
  className,
  children,
  ...props
}: InfoCardProps) {
  const Element = as;
  return (
    <Element className={cn("info-card", flush && "flush", className)} {...props}>
      {children}
    </Element>
  );
}
