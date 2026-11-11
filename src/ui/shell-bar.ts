/** The shell's phone-bar slot and its menu, shared by the shell and the pages. */
import { createContext, useContext, useEffect } from "react";

import type { IconName } from "./icon-names";

/** A page's own entry in the shell menu (Play: «Sali di livello»). */
export interface PageMenuAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
}

/** The top bar's slot a page fills with its own phone bar (Play: ← · ⋮), and the
 *  shell's menu, which the page's ⋮ opens. */
export const PageBarSlot = createContext<{
  slot: HTMLElement | null;
  openMenu: () => void;
  setPageActions: (actions: PageMenuAction[]) => void;
}>({
  slot: null,
  openMenu: () => undefined,
  setPageActions: () => undefined,
});

/** The shell's menu (the areas, the search), for a page's own phone bar. */
export function useShellMenu(): () => void {
  return useContext(PageBarSlot).openMenu;
}

/** Puts a page's own actions at the top of the shell menu while the page is mounted. */
export function usePageMenuActions(actions: PageMenuAction[]): void {
  const { setPageActions } = useContext(PageBarSlot);
  const key = actions.map((a) => a.label).join("|");
  useEffect(() => {
    setPageActions(actions);
    return () => setPageActions([]);
    // the actions change only when their labels do
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPageActions, key]);
}
