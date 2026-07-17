/**
 * ConditionEditor — the ONE condition control, shared across the cockpit rail, the
 * in-hub encounter PC card, and the monster row (golden rule 10 — no parallel
 * condition editor).
 *
 * A CONTROLLED, store-agnostic presentational widget: active conditions render as
 * removable `.co-chip`s; an "Add condition" trigger opens a Radix Popover listbox
 * of the SRD conditions (already-active ones marked, still tappable to toggle off).
 * Every interaction is a single `onToggle(conditionId)` — the caller binds it:
 *
 *   • COCKPIT   — `ConditionStrip` toggles the active character's `addCondition` /
 *     `removeCondition` store actions.
 *   • ENCOUNTER — `PcCombatEditor` toggles `setCombatCondition` against `(uid, charId)`.
 *   • MONSTER   — `MonsterCard` toggles the encounter reducer's `toggleCondition`.
 *
 * IDs only (golden rule 7): condition ids resolve to localized chips/options
 * through the shared view-models at the render edge — never new keys.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import { useReportEditorOpen } from "@/components/shared/card-editor-scope";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";
import { conditionChips, conditionOptions } from "@/lib/views/tracker-view";

export function ConditionEditor({
  conditions,
  onToggle,
  emptyLabel,
}: {
  conditions: string[];
  onToggle: (conditionId: string) => void;
  /** When set, an empty list is announced to assistive tech via a visually-hidden
   *  label ("No conditions") — nothing renders visibly (no placeholder dash), just
   *  the add affordance; the denser encounter / monster surfaces omit even the
   *  announcement. */
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const active = new Set(conditions);
  // Controlled so a host combatant card learns when this PORTALED listbox is open and a
  // dismissing surface click only closes it, never ALSO toggling the card (no-op elsewhere).
  const [open, setOpen] = useState(false);
  useReportEditorOpen(open);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {conditions.length === 0 && emptyLabel && (
        <span className="sr-only">{emptyLabel}</span>
      )}
      {conditionChips(conditions, locale).map((chip) => (
        <span
          key={chip.id}
          className="co-chip"
          style={{ ["--co" as string]: chip.color, ["--co-ink" as string]: chip.ink }}
        >
          {chip.label}
          <button
            type="button"
            className="co-x"
            aria-label={`${t("common.remove")} ${chip.label}`}
            onClick={() => onToggle(chip.id)}
          >
            <Icon as={X} size="sm" decorative />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="co-add">
            <Icon as={Plus} size="xs" decorative />
            {t("character.addCondition")}
          </button>
        </PopoverTrigger>
        <PopoverContent rubric={t("character.addCondition")} className="max-w-[15rem]">
          <div role="listbox" aria-label={t("character.addCondition")}>
            {conditionOptions(locale).map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={active.has(c.id)}
                className={cn("co-pick-item", active.has(c.id) && "active")}
                onClick={() => onToggle(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
