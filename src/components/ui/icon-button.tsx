/**
 * IconButton — the folio `.hdr-icon` atom: a small (32px) icon-only button with
 * built-in touch hit-slop and a gold-on-hover tint, used for lightweight inline
 * actions (toast dismiss, PWA banner close, ledger edit/remove glyphs).
 *
 * The ONE home of the `.hdr-icon` recipe so the ~5 raw `<button className="hdr-icon">`
 * sites stop re-spelling it. Lighter than `<Button iconOnly>` (the bevelled
 * `.btn.icon-only` CTA) and distinct from the modal-head `.modal-close` glyph —
 * this is the bare ghost-icon control. `type` defaults to "button"; an
 * `aria-label` is REQUIRED (an icon-only control has no text to name it). Forwards
 * every native button prop (onClick, disabled, title, …) and merges `className`
 * (callers tune the hover tint, e.g. `hover:text-danger`).
 */

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — an icon-only button needs an accessible name. */
  "aria-label": string;
}

export function IconButton({ className, type, children, ...props }: IconButtonProps) {
  return (
    <button type={type ?? "button"} className={cn("hdr-icon", className)} {...props}>
      {children}
    </button>
  );
}
