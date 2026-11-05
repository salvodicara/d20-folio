/**
 * Choice slots as titled rows of chips: the trait that asks names the row, the
 * rubric («Scegli 1 abilità») reads in text figures, and a tap toggles a pick.
 * Shared by the creation Specie step and the sheet's «Scelte da completare».
 * A spell slot lists its spells as rows that say what each one is.
 */
import type { ChoiceSlotRow } from "@/domains/creation/creation-view";
import { SpellPickList } from "@/domains/spells/ui/SpellPickList";
import { useLocale } from "@/hooks/useLocale";
import { asLocale } from "@/lib/locale";
import { Chip } from "@/ui";

export function ChoiceRowChips({
  rows,
  onToggle,
}: {
  rows: readonly ChoiceSlotRow[];
  onToggle: (row: ChoiceSlotRow, id: string) => void;
}) {
  const locale = asLocale(useLocale().language);
  return rows.map((row) => (
    <div key={row.slotId} className="f-ask">
      {row.source && <span className="f-lbl">{row.source}</span>}
      <p className="f-help">{row.title}</p>
      {row.kind === "spell" ? (
        <SpellPickList
          ids={row.options.map((o) => o.id)}
          picked={row.picked}
          locale={locale}
          onToggle={(id) => onToggle(row, id)}
        />
      ) : (
        <div className="f-chips">
          {row.options.map((o) => (
            <Chip
              key={o.id}
              pressed={row.picked.includes(o.id)}
              onClick={() => onToggle(row, o.id)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  ));
}
