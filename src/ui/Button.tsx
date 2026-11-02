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
  onClick,
  children,
  ...rest
}: {
  kind?: Kind;
  icon?: IconName;
  wide?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={wide ? "f-btn f-wide" : "f-btn"}
      data-kind={kind}
      aria-disabled={disabled || undefined}
      {...rest}
      onClick={disabled ? undefined : onClick}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
