import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light" | "system";
type SheetMode = "play" | "edit";

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  sheetMode: SheetMode;
  /**
   * Whether the global bug/feature report dialog is open (OWN-37). A transient
   * UI flag (NOT persisted) — the "Ask the Folio" palette flips it on, the
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
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSheetMode: (mode: SheetMode) => void;
  toggleSheetMode: () => void;
  setReportOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  root.setAttribute("data-theme", effectiveTheme);
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark",
      sidebarOpen: false,
      sheetMode: "play",
      reportOpen: false,
      shortcutsOpen: false,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSheetMode: (mode) => set({ sheetMode: mode }),
      toggleSheetMode: () =>
        set((s) => ({ sheetMode: s.sheetMode === "play" ? "edit" : "play" })),
      setReportOpen: (open) => set({ reportOpen: open }),
      setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
    }),
    {
      name: "d20-folio-ui",
      partialize: (state) => ({
        theme: state.theme,
        sheetMode: state.sheetMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
        }
      },
    }
  )
);

// Apply OS preferences to <html> and keep them in sync.
//
// Motion: there is no in-app animations toggle (removed Owner-feedback
// 2026-06-07) — `data-motion` is a pure mirror of the OS `prefers-reduced-motion`
// setting, which the CSS in index.css/folio.css gates every animation on. The
// anti-FOUC boot script in index.html sets it before first paint; this listener
// keeps it live if the user flips the OS setting while the app is open. Theme
// "system" likewise follows the OS color scheme.
if (typeof window !== "undefined") {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const applyMotionFromOS = () => {
    document.documentElement.setAttribute(
      "data-motion",
      reducedMotion.matches ? "reduced" : "auto"
    );
  };
  applyMotionFromOS();
  reducedMotion.addEventListener("change", applyMotionFromOS);

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const { theme } = useUIStore.getState();
    if (theme === "system") {
      applyTheme("system");
    }
  });
}
