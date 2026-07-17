/**
 * Section — a folio sub-section header (`.sec-head`: diamond · display-italic
 * title · gold-fading rule) plus its body.
 *
 * The shared idiom for grouping content under a titled rubric INSIDE a page
 * (beneath the page's `PageHeader`). Extracted so the full-page surfaces that use
 * it — Settings, Admin — share one implementation instead of each re-declaring
 * the ~10-line `.sec-head` markup.
 *
 * Purely presentational: emits the documented `.sec-head` / `.sec-title` classes
 * (CSS lives in folio.css); owns no state. The title renders as an `<h2>`, so it
 * sits one level under a page's `<h1>` `PageHeader`.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";

export interface SectionProps {
  title: ReactNode;
  children: ReactNode;
  /** Extra classes on the wrapping `<section>`. */
  className?: string;
}

export function Section({ title, children, className }: SectionProps) {
  return (
    <section className={cn("mt-8 first:mt-0", className)}>
      <SectionHeader as="h2" title={title} />
      {children}
    </section>
  );
}
