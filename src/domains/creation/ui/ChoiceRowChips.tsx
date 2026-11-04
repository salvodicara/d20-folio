/**
 * Choice slots as titled rows of chips: the trait that asks names the row, the
 * rubric («Scegli 1 abilità») reads in text figures, and a tap toggles a pick.
 * Shared by the creation Specie step and the sheet's «Scelte da completare».
 */
import type { ChoiceSlotRow } from "@/domains/creation/creation-view";
import { Chip } from "@/ui";

export function ChoiceRowChips({
  rows,
  onToggle,
}: {
  rows: readonly ChoiceSlotRow[];
  onToggle: (row: ChoiceSlotRow, id: string) => void;
}) {
  return rows.map((row) => (
    <div key={row.slotId} className="f-ask">
      {row.source && <span className="f-lbl">{row.source}</span>}
      <p className="f-help">{row.title}</p>
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
    </div>
  ));
}
