/**
 * TabStrip — the cockpit primary tab bar (Combat · Spells · Inventory · Features ·
 * Bio): the `role=tablist` of buttons that select the active center panel.
 *
 * Reads the shared tab state from `useTabs()` (the scoped `TabsProvider`), so it
 * can sit in the command zone at the TOP of the content while its `TabBody`
 * sibling renders below — a switch re-renders only these two, never the cockpit
 * root or the persistent rails (§7.2). An ARIA tablist with roving tabindex +
 * arrow / Home / End keyboard support.
 *
 * Overflow cue: the strip scrolls horizontally when the column is narrower than
 * the five tabs (phones; the tightest IT desktop bands). A tab hidden past the
 * edge with no signal is a discoverability hole — the `.tabstrip-shell` wrapper
 * paints a soft `--input-fill` fade over whichever edge still has content
 * (`data-fade` ∈ l/r/lr, kept current by scroll + resize observers), so the cut
 * always reads as "more this way", never as the end of the strip.
 */

import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useActiveTabScroll } from "@/hooks/useActiveTabScroll";
import { useOverflowFade } from "@/hooks/useOverflowFade";
import { useTabs, tabDomId, panelDomId } from "./useTabs";
import { TAB_DEFS } from "./tab-defs";

export function TabStrip() {
  const { t } = useTranslation();
  const { activeTab, selectTab, uid } = useTabs();
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the selected tab revealed inside the strip's OWN scroller (never by moving
  // the page) whenever the active tab changes — the shared ribbon anti-jump seam.
  useActiveTabScroll(stripRef, activeTab);

  // The edge-fade "more this way" cue, kept current on scroll + resize (the shared
  // seam reused by the compendium type ribbon).
  const fade = useOverflowFade(stripRef);

  function onTabKeyDown(e: KeyboardEvent, index: number): void {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (index + 1) % TAB_DEFS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (index - 1 + TAB_DEFS.length) % TAB_DEFS.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = TAB_DEFS.length - 1;
    }
    const next = nextIndex != null ? TAB_DEFS[nextIndex] : undefined;
    if (next) {
      e.preventDefault();
      selectTab(next.id);
      // preventScroll: a roving-tabindex focus must never scroll the PAGE to the
      // next tab (the Class-C page jump); the strip reveals it horizontally itself.
      document.getElementById(tabDomId(uid, next.id))?.focus({ preventScroll: true });
    }
  }

  return (
    <div className="tabstrip-shell" data-fade={fade || undefined}>
      <div
        ref={stripRef}
        role="tablist"
        aria-label={t("character.tabs.label")}
        className="tabstrip flex items-center gap-1 overflow-x-auto p-1"
      >
        {TAB_DEFS.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabDomId(uid, tab.id)}
              aria-selected={selected}
              aria-controls={panelDomId(uid, tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
              className={cn(
                "inline-flex flex-shrink-0 items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
                selected ? "font-semibold" : "font-medium text-text-secondary"
              )}
            >
              <Icon as={tab.icon} size="sm" decorative />
              {t(tab.labelKey, tab.defaultLabel)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
