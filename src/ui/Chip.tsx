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
  // A chip that only shows a state is not a control (it may sit inside a link row).
  if (!onClick && pressed === undefined) {
    return (
      <span className="f-chip" data-kind={kind}>
        {children}
      </span>
    );
  }
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
