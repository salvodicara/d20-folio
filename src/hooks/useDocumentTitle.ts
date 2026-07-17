/**
 * useDocumentTitle — sets the browser tab / history title per routed surface.
 *
 * `document.title` was a static `"d20 Folio"` on every route, so the browser
 * history menu, back-button long-press, reopened tabs, and screen-reader route
 * announcements were all blind — the browser-level breadcrumb was missing. Each
 * page calls this with its own name; the effect writes
 * `"<title> · d20 Folio"` (or the bare brand when no title is given, e.g. the
 * login splash), so the tab always names where you are.
 *
 * Callers pass `t(...)` output (or a raw character/campaign name), so the effect
 * re-runs on locale change — an IT user reads `Impostazioni · d20 Folio`. Nothing
 * is restored on unmount: the next page sets its own title, and a page that wants
 * the bare brand calls it with no argument.
 */

import { useEffect } from "react";

const BRAND = "d20 Folio";

/** Set `document.title` to `<title> · d20 Folio`, or the bare brand when empty. */
export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BRAND}` : BRAND;
  }, [title]);
}
