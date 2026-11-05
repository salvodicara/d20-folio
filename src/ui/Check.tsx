import type { ReactNode } from "react";

/** A tick that turns an option on or off (a filter: Level 1, Cleric, Ritual). */
export function Check({
  on,
  onChange,
  children,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      className="f-check"
      onClick={() => onChange(!on)}
    >
      <span className="f-check-box" aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}
