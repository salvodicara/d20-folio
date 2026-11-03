import type { ReactNode } from "react";

/** A chip: a single choice (pressed) or a state with its colour (concentration, condition, effect, a form). */
export function Chip({
  pressed,
  kind,
  disabled,
  title,
  onClick,
  children,
}: {
  pressed?: boolean;
  kind?: "conc" | "cond" | "buff" | "form";
  /** A choice that cannot be taken now (it stays visible, with `title` saying why). */
  disabled?: boolean;
  title?: string;
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
      aria-disabled={disabled || undefined}
      title={title}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </button>
  );
}
