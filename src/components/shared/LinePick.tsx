/**
 * A line completed where it is shown: a small labelled group of chips under the line
 * ("Who struck?" in the fight feed, an attack's result on the sheet's row just used).
 * The feed keeps its quiet chips (a log's weight); the sheet's action row uses the
 * situation chips' toggle style (`status-badge sb-toggle`), at the weight of the
 * actions around it.
 */
import type { ReactNode } from "react";

import "./line-pick.css";

type Weight = "quiet" | "status";

export function LinePick({
  label,
  weight = "quiet",
  children,
}: {
  label: string;
  weight?: Weight;
  children: ReactNode;
}) {
  return (
    <div
      className="encounter-feed-pick"
      data-weight={weight}
      role="group"
      aria-label={label}
    >
      <span className="encounter-feed-pick-label">{label}</span>
      {children}
    </div>
  );
}

export function LineChip({
  label,
  selected,
  weight = "quiet",
  onClick,
}: {
  label: string;
  selected?: boolean;
  weight?: Weight;
  onClick: () => void;
}) {
  if (weight === "status")
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected ?? false}
        data-kind={selected ? "active" : undefined}
        className="status-badge sb-toggle line-chip-status"
      >
        {label}
      </button>
    );
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
