/**
 * The initiative strip — top-centre, the whole table in turn order (UI spec rule 28).
 *
 * Every seated creature is one cell: portrait (or its initial), a health bar underneath, its
 * condition badges top-left. The acting creature's cell is the taller one with the cyan ring;
 * creatures that have already acted this round are dimmed; the round divider carries the round
 * number, exactly where the order wraps.
 *
 * It shows what the VIEWER may see: the cells come from a list the caller has already filtered
 * through `mapView`'s rules, so a hidden token is not silently announced by the strip.
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { EntityId } from "@/lib/combat/ids";

export interface StripCell {
  readonly id: EntityId;
  readonly name: string;
  readonly portrait: string | null;
  /** 0..1 of the maximum — the bar everyone sees (rule 33). */
  readonly hpRatio: number;
  readonly foe: boolean;
  readonly current: boolean;
  /** Already acted this round. */
  readonly done: boolean;
  readonly hidden: boolean;
  readonly conditions: number;
  readonly initiative: number | null;
}

export interface InitiativeStripProps {
  readonly cells: readonly StripCell[];
  readonly round: number;
  readonly selected: EntityId | null;
  readonly onSelect: (entity: EntityId) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function InitiativeStrip({
  cells,
  round,
  selected,
  onSelect,
}: InitiativeStripProps) {
  const { t } = useTranslation();
  if (cells.length === 0) return null;
  // The divider sits before the creature that opens the round — the top of the order.
  const wrapAt = cells.findIndex((cell) => cell.current);
  return (
    <div
      className="pl-float pl-initbar pl-panel pl-panel--framed"
      data-testid="pl-initiative"
    >
      <span className="pl-brackets" />
      <ol className="pl-strip" aria-label={t("play.initiative.aria")}>
        {cells.map((cell, index) => (
          <li key={cell.id} style={{ display: "contents" }}>
            {index === wrapAt && index > 0 ? (
              <span className="pl-round-divider" aria-hidden="true">
                <b>{t("play.initiative.roundMark", { round })}</b>
              </span>
            ) : null}
            <button
              type="button"
              className={cn(
                "pl-cell",
                cell.foe && "pl-cell--foe",
                cell.current && "pl-cell--current",
                cell.done && "pl-cell--done"
              )}
              aria-current={cell.current ? "step" : undefined}
              aria-pressed={selected === cell.id}
              onClick={() => onSelect(cell.id)}
              data-testid={`pl-cell-${cell.id}`}
              title={
                cell.initiative === null
                  ? cell.name
                  : t("play.initiative.cellTitle", {
                      name: cell.name,
                      value: cell.initiative,
                    })
              }
            >
              <span className="pl-cell__pic">
                {cell.portrait ? (
                  <img src={cell.portrait} alt="" />
                ) : (
                  <span className="pl-cell__initial">{initials(cell.name)}</span>
                )}
                {cell.conditions > 0 ? (
                  <span className="pl-cell__badges" aria-hidden="true">
                    {Array.from({ length: Math.min(cell.conditions, 3) }, (_, n) => (
                      <i key={n} />
                    ))}
                  </span>
                ) : null}
              </span>
              <span className="pl-cell__hp">
                <i style={{ width: `${Math.round(cell.hpRatio * 100)}%` }} />
              </span>
              {cell.current ? (
                <span className="pl-cell__name">
                  {cell.name}
                  {cell.initiative === null ? "" : ` · ${cell.initiative}`}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
