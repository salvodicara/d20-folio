import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icon-names";

type Kind = "primary" | "ghost" | "quiet" | "danger";

/** The two button kinds (primary, ghost) plus quiet text actions and the danger confirm. */
export function Button({
  kind = "ghost",
  icon,
  wide,
  disabled,
  busy,
  onClick,
  children,
  ...rest
}: {
  kind?: Kind;
  icon?: IconName;
  wide?: boolean;
  /** Working on the press (a wait the player caused): a spinner, no second press. */
  busy?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={wide ? "f-btn f-wide" : "f-btn"}
      data-kind={kind}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      // an icon button keeps its name when a narrow screen hides the label
      aria-label={icon && typeof children === "string" ? children : undefined}
      {...rest}
      onClick={disabled || busy ? undefined : onClick}
    >
      {icon && <Icon name={icon} />}
      {icon ? <span className="f-btn-lab">{children}</span> : children}
    </button>
  );
}
