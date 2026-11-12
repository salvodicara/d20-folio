/**
 * A line completed where it is shown: a small labelled group of chips under the line
 * ("Who struck?" in the fight feed, an attack's result on the sheet's row just used).
 * One look for both (`line-pick.css`).
 */
import type { ReactNode } from "react";

import "./line-pick.css";

export function LinePick({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="encounter-feed-pick" role="group" aria-label={label}>
      <span className="encounter-feed-pick-label">{label}</span>
      {children}
    </div>
  );
}

export function LineChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected ? "" : undefined}
      className="encounter-feed-chip"
    >
      {label}
    </button>
  );
}

/** The group's quiet way out ("skip", "more"). */
export function LineQuiet({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="encounter-feed-pick-quiet" onClick={onClick}>
      {label}
    </button>
  );
}
