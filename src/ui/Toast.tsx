import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** A short notice at the bottom; the undo action lives here. */
export function Toast({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="f-toast" role="status">
      <Icon name="u-check" size={20} />
      {/* the last two words together: a toast never ends on one alone */}
      <span>
        {typeof children === "string"
          ? children.replace(/ (\S+)$/, "\u00a0$1")
          : children}
      </span>
      {action && (
        <button type="button" className="f-btn" data-kind="quiet" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
