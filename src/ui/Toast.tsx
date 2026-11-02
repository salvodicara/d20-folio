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
      <span>{children}</span>
      {action && (
        <button type="button" className="f-btn" data-kind="quiet" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
