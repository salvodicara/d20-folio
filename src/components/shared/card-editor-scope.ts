/**
 * card-editor-scope — the portal-aware "an inline editor of THIS card is open" channel.
 *
 * A combatant card toggles its disclosure on a click anywhere on its resting surface (the
 * owner-loved click-to-expand). The exception: a click that merely DISMISSES one of the
 * card's own inline editors (the HP popover, the conditions popover, the initiative input)
 * must JUST close that editor — never ALSO toggle the card. Detecting "is an editor open"
 * by probing the card's DOM subtree FAILS for a Radix popover, which renders its content
 * into a PORTAL on `document.body` — outside the card's subtree (the prior-fix bug).
 *
 * So the card establishes a SCOPE: it provides a `report` sink through
 * {@link CardEditorScopeContext}; each editor it contains holds a +1 on the card's
 * open-editor count while open (released on close/unmount) via {@link useReportEditorOpen},
 * regardless of where the editor's content portals to. The card reads the live count at
 * pointer-DOWN to decide whether the resulting click is a dismiss (swallow the toggle) or a
 * genuine expand (toggle).
 *
 * Decoupled by construction: the shared HP / condition / init editors call the hook
 * unconditionally, but it's a NO-OP outside a provider (the cockpit, the topbar combat
 * pip), so those surfaces are entirely unaffected. Kept hook-only (no component export) so
 * fast-refresh stays happy — the lone consumer renders `CardEditorScopeContext.Provider`.
 */

import { createContext, useContext, useEffect } from "react";

/** Adjust the enclosing card's open-editor count (+1 on open, −1 on close/unmount). */
export type EditorOpenReporter = (delta: 1 | -1) => void;

export const CardEditorScopeContext = createContext<EditorOpenReporter | null>(null);

/**
 * While `open`, hold a +1 on the enclosing combatant card's open-editor count (released on
 * close or unmount), so a dismissing click on the card surface can be told apart from a
 * genuine expand click — even when the editor's content lives in a PORTAL outside the
 * card's DOM subtree. A no-op outside a {@link CardEditorScopeContext} provider.
 */
export function useReportEditorOpen(open: boolean): void {
  const report = useContext(CardEditorScopeContext);
  useEffect(() => {
    if (!report || !open) return;
    report(1);
    return () => report(-1);
  }, [report, open]);
}
