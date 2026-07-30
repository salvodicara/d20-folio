/**
 * ModalTabSwitcher — the shared tab strip every "Add-X" modal wears (spell ·
 * feature · item · the encounter picker). Generic modal chrome: it owns only the
 * button row, so it lives beside `ModalShell` rather than inside any one modal's
 * body (a consumer's chunk would otherwise drag the others in).
 *
 * `tabs` drives it — ANY number of tabs, each `{ id, label }`, the id generic over
 * the caller's own union so `onTabChange` stays typed. It replaced both the
 * hardcoded two-tab version and the `AddItemModal`'s private three-tab copy when the
 * homebrew Library tab made three of the four modals N-tab (golden rule 6 — one
 * idea, one component).
 */

import { cn } from "@/lib/utils";

export function ModalTabSwitcher<T extends string>({
  activeTab,
  onTabChange,
  tabs,
}: {
  activeTab: T;
  onTabChange: (tab: T) => void;
  tabs: ReadonlyArray<{ id: T; label: string }>;
}) {
  return (
    <div className="flex shrink-0 border-b border-border-subtle">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex-1 py-2 text-center text-[0.7rem] font-semibold transition-colors",
            activeTab === tab.id
              ? "border-b-2 border-accent text-accent"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
