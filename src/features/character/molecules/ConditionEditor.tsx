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
 *   • ENCOUNTER — `PcCombatEditor` writes a typed condition effect via
 *     `writeCampaignCombatEffect` against `(uid, charId)`.
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
import { GlossaryTip, type GlossaryTermId } from "@/components/shared/GlossaryTip";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";
import { condColor, condInkColor } from "@/lib/condition-color";
import { conditionChips, conditionOptions } from "@/lib/views/tracker-view";

/** A lasting status the same control lights and ends beside the conditions (a
 *  fading D20 Test penalty — Raise Dead). Cockpit-only. */
export interface StatusOptionVM {
  id: string;
  /** The picker row ("Raise Dead (−4 to d20 Tests)"). */
  option: string;
  /** The chip while it runs ("−4 to d20 Tests"); absent when it does not run. */
  chip?: string;
  /** The hover gloss: what it is and how it ends. */
  hint: string;
}

export function ConditionEditor({
  conditions,
  onToggle,
  emptyLabel,
  hiddenDc,
  immunities,
  statuses = [],
  onToggleStatus,
}: {
  conditions: string[];
  /** Condition ids the creature is immune to: never offered in the picker
   *  (the stat block already lists the immunity). */
  immunities?: ReadonlySet<string>;
  onToggle: (conditionId: string) => void;
  /** When set, an empty list is announced to assistive tech via a visually-hidden
   *  label ("No conditions") — nothing renders visibly (no placeholder dash), just
   *  the add affordance; the denser encounter / monster surfaces omit even the
   *  announcement. */
  emptyLabel?: string;
  /** RA-12 — the Hide action's remembered find-DC (`session.hiddenDc`): shown as a
   *  quiet " · DC N" suffix on the Invisible chip so the check total the SRD makes
   *  the DC to find you never evaporates with its toast. Cockpit-only (the
   *  encounter/monster bindings omit it). */
  hiddenDc?: number;
  /** Lasting statuses offered in the same picker, shown as chips while they run. */
  statuses?: ReadonlyArray<StatusOptionVM>;
  onToggleStatus?: (statusId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { language: locale } = useLocale();
  const active = new Set(conditions);
  // Beginner glossary: an SRD condition id IS its glossary term id, so its
  // plain-language line rides the chip (tap) and the picker row (hover gloss).
  const hasGloss = (id: string): boolean => i18n.exists(`glossary.term.${id}`);
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
          title={
            chip.impliedBy
              ? t("character.impliedCondition", { source: chip.impliedBy })
              : undefined
          }
        >
          {hasGloss(chip.id) ? (
            <GlossaryTip term={chip.id as GlossaryTermId} rubric={chip.label} />
          ) : (
            chip.label
          )}
          {/* RA-12 — the find-DC rides the Invisible chip (SRD "Hide": your check
              total is the DC to find you); reuses the one `stats.dc` label. */}
          {chip.id === "invisible" && hiddenDc != null
            ? ` · ${t("stats.dc")} ${hiddenDc}`
            : ""}
          {/* An implied chip (Prone from Unconscious) has no ×: removing it
              alone would change nothing while its source holds. */}
          {!chip.impliedBy && (
            <button
              type="button"
              className="co-x"
              aria-label={`${t("common.remove")} ${chip.label}`}
              onClick={() => onToggle(chip.id)}
            >
              <Icon as={X} size="sm" decorative />
            </button>
          )}
        </span>
      ))}
      {statuses.map((status) =>
        status.chip ? (
          <span
            key={status.id}
            className="co-chip"
            style={{
              ["--co" as string]: condColor("exhaustion"),
              ["--co-ink" as string]: condInkColor("exhaustion"),
            }}
            title={status.hint}
          >
            {status.chip}
            {onToggleStatus && (
              <button
                type="button"
                className="co-x"
                aria-label={`${t("common.remove")} ${status.option}`}
                onClick={() => onToggleStatus(status.id)}
              >
                <Icon as={X} size="sm" decorative />
              </button>
            )}
          </span>
        ) : null
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="co-add">
            <Icon as={Plus} size="xs" decorative />
            {t("character.addCondition")}
          </button>
        </PopoverTrigger>
        <PopoverContent
          rubric={t("character.addCondition")}
          className="max-w-[15rem]"
          collisionPadding={12}
        >
          {/* Capped to the room Radix measured, so every option (the statuses come
              last) stays reachable when the list would run off the screen. */}
          <div
            role="listbox"
            aria-label={t("character.addCondition")}
            className="max-h-[calc(var(--radix-popover-content-available-height)-4rem)] overflow-y-auto"
          >
            {conditionOptions(locale).map((c) => {
              // The Picker Doctrine: a condition the creature is immune to is not
              // a choice, so it is not offered (an already-active one stays, so
              // it can still be removed from here as well as from its chip).
              if (!active.has(c.id) && immunities?.has(c.id)) return null;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  data-condition={c.id}
                  aria-selected={active.has(c.id)}
                  title={hasGloss(c.id) ? t(`glossary.term.${c.id}`) : undefined}
                  className={cn("co-pick-item", active.has(c.id) && "active")}
                  onClick={() => onToggle(c.id)}
                >
                  {c.label}
                </button>
              );
            })}
            {onToggleStatus &&
              statuses.map((status) => (
                <button
                  key={status.id}
                  type="button"
                  role="option"
                  aria-selected={status.chip !== undefined}
                  title={status.hint}
                  className={cn("co-pick-item", status.chip !== undefined && "active")}
                  onClick={() => {
                    onToggleStatus(status.id);
                    setOpen(false);
                  }}
                >
                  {status.option}
                </button>
              ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
