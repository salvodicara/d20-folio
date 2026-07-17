/**
 * useGlobalShortcuts — the ONE global keydown listener for the signed-in shell,
 * mounted once in `AppShell` (it replaced the inline ⌘K effect). Implements §3.2's
 * global rows behind §3.4's guards; the route-scoped accelerators
 * (`useEditModeShortcut` on the cockpit, `useTurnAdvanceShortcut` in the encounter)
 * stay route-scoped and are NOT re-implemented here.
 *
 * Global bindings:
 *  - ⌘K / Ctrl+K → toggle the palette (the ONE key that still fires under an open
 *    dialog, so it can close the palette it opened — preserve the exact old toggle);
 *  - `/`          → open the palette (the industry "focus search" key; the palette
 *    IS global search, so no per-page search wiring);
 *  - `g` then `1/2/3` → go to Characters / Campaigns / Compendium (POSITIONAL,
 *    honoring realm tab query-memory via `realmTarget`);
 *  - `g` then `s`  → Settings; `g` then `a` → Admin (only when admin; else the
 *    sequence disarms silently).
 *
 * Guards (§3.4): ignore typing targets; ignore under a dialog EXCEPT ⌘K; ignore a
 * key a layer already consumed (`defaultPrevented`); a chord modifier voids `/` and
 * the sequences. Arming `g` never `preventDefault`s (a harmless keypress); a handled
 * second key does. The pending sequence disarms on timeout (1500ms, in the stepper),
 * an unmatched key, a route change, or blur.
 */

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useUIStore } from "@/stores/uiStore";
import { REALM_PATHS, realmTarget } from "@/lib/realm-memory";
import {
  GO_SEQUENCES,
  IDLE_SEQ,
  inDialog,
  isTypingTarget,
  nextSeqState,
  type SeqState,
} from "@/lib/shortcuts";

export interface GlobalShortcutsOptions {
  /** Toggle/open the "Ask the Folio" palette (owned by AppShell state). */
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
}

/** Arms the global keyboard shortcuts for as long as the shell is mounted. */
export function useGlobalShortcuts({ setPaletteOpen }: GlobalShortcutsOptions): void {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
  const { pathname } = useLocation();
  const seqRef = useRef<SeqState>(IDLE_SEQ);

  // A route change or a blur disarms a pending `g` sequence (§3.4.4).
  useEffect(() => {
    seqRef.current = IDLE_SEQ;
  }, [pathname]);

  useEffect(() => {
    function disarm(): void {
      seqRef.current = IDLE_SEQ;
    }
    function onKey(e: KeyboardEvent): void {
      // ⌘K / Ctrl+K — handled BEFORE the typing/dialog guards so it still toggles the
      // palette from inside a field or over an open dialog (the exact prior behavior).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      if (inDialog(e.target)) return;
      // A chord modifier means a browser/OS shortcut — leave `/` + the sequences alone.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // `/` opens the palette (no modifiers; Shift+/ is `?`, handled below).
      if (e.key === "/" && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // `?` toggles the shortcuts sheet — matched by the produced CHARACTER, so it
      // is layout-independent (Shift+/ on US, Shift+' on IT both yield `?`). The
      // shift the character requires is exempt from the shift guard below.
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(!useUIStore.getState().shortcutsOpen);
        return;
      }

      // Everything below is shift-free (only `?` above needs shift).
      if (e.shiftKey) return;

      // The `g`-prefixed go-to sequences. EVERY other single key flows through the
      // stepper too, so an unmatched key disarms a pending `g`. `fired` is the
      // second key only when a complete sequence just landed.
      const { state, fired } = nextSeqState(seqRef.current, e.key, Date.now());
      seqRef.current = state;
      if (fired) {
        const path = GO_SEQUENCES[fired];
        if (!path) return;
        // `g a` (Admin) is admin-only — disarm silently for everyone else.
        if (path === "/admin" && !isAdmin) return;
        e.preventDefault();
        void navigate(REALM_PATHS.has(path) ? realmTarget(path) : path);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", disarm);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", disarm);
    };
  }, [navigate, isAdmin, setPaletteOpen, setShortcutsOpen]);
}
