import type { ReactNode } from "react";
import type { PanelColor } from "./Panel";

/**
 * One option of a pick-one question (a slot level, a way to pay, a spell): a bordered
 * tile that lights up in its colour when chosen. `tile` stacks it as a short column
 * (the slot tiles of the cast dialog); otherwise it is a full-width row.
 */
export function Choice({
  on,
  disabled,
  color = "res",
  tile,
  onClick,
  children,
}: {
  on?: boolean;
  disabled?: boolean;
  color?: PanelColor;
  tile?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="f-choice"
      data-c={color}
      data-tile={tile || undefined}
      aria-pressed={on ?? false}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </button>
  );
}
