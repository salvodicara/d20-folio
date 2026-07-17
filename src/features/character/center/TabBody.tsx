/**
 * TabBody — the cockpit's single primary scroll surface: the `role=tabpanel`s,
 * one per tab, with only the active panel's content MOUNTED (the others stay as
 * empty, ARIA-resolvable panels so each tab's `aria-controls` always points at a
 * real node).
 *
 * Reads the shared tab state from `useTabs()` (the scoped `TabsProvider`), so it
 * renders below `TabStrip` in the content column and a switch re-renders only
 * these two consumers, never the cockpit root or the persistent rails (§7.2).
 *
 * Stability (#8): the panels are a single-cell GRID STACK — every panel occupies
 * the same `grid-area`, so the container height is the active panel's height with
 * a `min-h` floor (a short tab can't collapse the layout / bounce the scroll).
 * On a switch the incoming panel fades from `opacity-0`→`opacity-100` via a
 * `transition-opacity`, gated by `motion-safe:` (and silenced by the global
 * `[data-motion]` kill-switch) so reduced-motion users get an instant swap.
 * Inactive panels are `inert` (out of focus + the a11y tree).
 *
 * Item j — a DM viewing a member's sheet EXPLORES it: the active panel is NEVER
 * inert, so expanding feature/spell/item cards, switching tabs, and tooltips all
 * work. Only the MUTATING affordances (steppers / toggles / edit / spend / rest /
 * level-up) are suppressed — each surface hides or disables them off
 * `useSheetReadonly()`, and the `readonly` store flag is the write backstop at the
 * `patchCharacter` seam. (Previously the whole panel went `inert`, so a DM could
 * read the at-a-glance rows but couldn't open a single card to see its detail.)
 */

import { useTabs, tabDomId, panelDomId } from "./useTabs";
import { TAB_DEFS } from "./tab-defs";
import { cn } from "@/lib/utils";

export function TabBody() {
  const { activeTab, uid } = useTabs();

  return (
    // D50 — a consistent, deliberate gap below the tab strip so each tab's toolbar
    // (the search lens, filter chips, Add buttons) breathes instead of sitting glued
    // to the tabs. One place → every tab inherits the same top spacing. The matching
    // `pb-6` gives the LAST list row/group breathing room so no tab (spells, features,
    // …) ends abruptly flush — kept modest (the shell already adds footer clearance)
    // so it's consistent without over-padding the shorter tabs.
    <div className="mt-5 grid min-h-[24rem] min-w-0 pb-6">
      {TAB_DEFS.map((tab) => {
        const Panel = tab.Panel;
        const active = tab.id === activeTab;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelDomId(uid, tab.id)}
            aria-labelledby={tabDomId(uid, tab.id)}
            tabIndex={active ? 0 : -1}
            inert={!active}
            // `min-w-0` so the single grid cell can't be forced wider than its
            // track by intrinsic-min-width content (the dense combat meter / wide
            // cards); without it the whole center column overflows the mobile
            // viewport. Internal over-wide rows then clip/scroll WITHIN the panel
            // (the pre-existing `.conc-banner` viewport-vs-column case stays #9).
            className={cn(
              "min-w-0 [grid-area:1/1] transition-opacity motion-safe:duration-150 focus-visible:outline-none",
              active ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            {active && <Panel />}
          </div>
        );
      })}
    </div>
  );
}
