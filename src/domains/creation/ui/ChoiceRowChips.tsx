/**
 * Choice slots as titled questions: the trait that asks names the row, the rubric
 * («Scegli 2 trucchetti da Mago») carries a counter like D&D Beyond's builder
 * («Cantrips: 0/3»), and a tap toggles a pick. Shared by the creation Specie step and
 * the sheet's «Scelte da completare». A spell slot is the level-up's icon grid
 * (painted art, filters, the inspect card); skills, tools and languages stay chips.
 */
import type { ChoiceSlotRow } from "@/domains/creation/creation-view";
import { PickGrid } from "@/domains/spells/ui/PickGrid";
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
      <p className="f-help f-pick-title">
        {row.title}
        <span
          className="f-lvl-count"
          data-state={row.picked.length >= row.amount ? "done" : "owed"}
        >
          {`${String(row.picked.length)}/${String(row.amount)}`}
        </span>
      </p>
      {row.kind === "spell" ? (
        <PickGrid
          label={row.title}
          options={row.options}
          picked={row.picked}
          spells
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
