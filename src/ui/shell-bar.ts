/** The shell's phone-bar slot and its menu, shared by the shell and the pages. */
import { createContext, useContext } from "react";

/** The top bar's slot a page fills with its own phone bar (Play: ← · ⋮), and the
 *  shell's menu, which the page's ⋮ opens. */
export const PageBarSlot = createContext<{
  slot: HTMLElement | null;
  openMenu: () => void;
}>({
  slot: null,
  openMenu: () => undefined,
});

/** The shell's menu (the areas, the search), for a page's own phone bar. */
export function useShellMenu(): () => void {
  return useContext(PageBarSlot).openMenu;
}
