import { create } from "zustand";
import { persist } from "zustand/middleware";

type SheetMode = "play" | "edit";

interface UIState {
  sidebarOpen: boolean;
  sheetMode: SheetMode;
  /**
   * Whether the global bug/feature report dialog is open (OWN-37). A transient
   * UI flag (NOT persisted) — the "Search the Folio" palette flips it on, the
   * AppShell-hosted ReportDialog reads it. Kept here (vs. local AppShell state)
   * so the palette can open the dialog without prop-drilling or a context.
   */
  reportOpen: boolean;
  /**
   * Whether the keyboard-shortcuts sheet is open. A transient UI flag (NOT
   * persisted). Lifted here so the `?` key, the palette's shortcuts action, and
   * the palette footer chip all open the ONE sheet through a single seam.
   */
  shortcutsOpen: boolean;
  /**
   * Open/closed state of the on-demand Play-tab reference sections (the combat
   * playbook + the SRD rules reference), keyed by their stable id
   * (`play-reference.ts` → PLAY_REF_SECTIONS). PERSISTED per user (survives tab
   * switches + reloads); a missing key = CLOSED, so both foot blocks default
   * collapsed to just their header (no first-run special casing).
   */
  playRefSections: Record<string, boolean>;
  /**
   * A one-shot request (from the ⌘K palette) to reveal a Play-tab reference
   * section: the section id to switch to the Combat tab, open, and scroll into
   * view. TRANSIENT (not persisted) — the cockpit's deep-link consumer reads it,
   * acts, and clears it. `null` when idle.
   */
  pendingPlayRef: string | null;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSheetMode: (mode: SheetMode) => void;
  toggleSheetMode: () => void;
  setReportOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  /** Set one Play-tab reference section's open/closed state (persisted). */
  setPlayRefOpen: (id: string, open: boolean) => void;
  /** Request the cockpit reveal a Play-tab reference section (the ⌘K seam). */
  requestPlayRef: (section: string) => void;
  /** Clear the pending reveal request (the consumer calls this once handled). */
  clearPlayRef: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      sheetMode: "play",
      reportOpen: false,
      shortcutsOpen: false,
      playRefSections: {},
      pendingPlayRef: null,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSheetMode: (mode) => set({ sheetMode: mode }),
      toggleSheetMode: () =>
        set((s) => ({ sheetMode: s.sheetMode === "play" ? "edit" : "play" })),
      setReportOpen: (open) => set({ reportOpen: open }),
      setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
      setPlayRefOpen: (id, open) =>
        set((s) => ({ playRefSections: { ...s.playRefSections, [id]: open } })),
      requestPlayRef: (section) => set({ pendingPlayRef: section }),
      clearPlayRef: () => set({ pendingPlayRef: null }),
    }),
    {
      name: "d20-folio-ui",
      // Older builds also persisted a `theme` ("dark" | "light" | "system"); the
      // app is dark only (owner 2026-10-16), so that stale key is simply ignored.
      partialize: (state) => ({
        sheetMode: state.sheetMode,
        playRefSections: state.playRefSections,
      }),
    }
  )
);

// The app is dark only (owner 2026-10-16): <html> always carries
// data-theme="dark" (index.html sets it pre-paint; this pins it once the bundle
// runs, whatever an older build persisted).
//
// Motion: there is no in-app animations toggle (removed Owner-feedback
// 2026-06-07) — `data-motion` is a pure mirror of the OS `prefers-reduced-motion`
// setting, which the CSS in index.css/folio.css gates every animation on. The
// anti-FOUC boot script in index.html sets it before first paint; this listener
// keeps it live if the user flips the OS setting while the app is open.
if (typeof window !== "undefined") {
  document.documentElement.setAttribute("data-theme", "dark");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const applyMotionFromOS = () => {
    document.documentElement.setAttribute(
      "data-motion",
      reducedMotion.matches ? "reduced" : "auto"
    );
  };
  applyMotionFromOS();
  reducedMotion.addEventListener("change", applyMotionFromOS);
}
