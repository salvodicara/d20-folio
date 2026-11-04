import { useEffect, useRef, type ReactNode } from "react";
import { PanelHeader, type PanelColor } from "./Panel";
import { Icon } from "./Icon";

/** A modal: centred on laptop, a bottom sheet on phone. Uses the native <dialog> (focus trap, Esc, backdrop). */
export function Dialog({
  open,
  onClose,
  title,
  color = "act",
  closeLabel,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  color?: PanelColor;
  closeLabel: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal focuses the first control (the close button): a field that asked
      // for focus gets it back.
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="f-dlg"
      data-c={color}
      onClose={onClose}
      onCancel={onClose}
    >
      <PanelHeader
        title={title}
        aside={
          <button
            type="button"
            className="f-close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <Icon name="u-close" />
          </button>
        }
      />
      <div className="f-bd">{children}</div>
      {actions && <div className="f-pn-foot">{actions}</div>}
    </dialog>
  );
}
