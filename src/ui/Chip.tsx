import type { ReactNode } from "react";

/** A chip: a single choice (pressed) or a state with its colour (concentration, condition, effect). */
export function Chip({
  pressed,
  kind,
  onClick,
  children,
}: {
  pressed?: boolean;
  kind?: "conc" | "cond" | "buff";
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="f-chip"
      data-kind={kind}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
