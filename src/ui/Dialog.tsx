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
  // The actions bar draws its rule only while the body scrolls under it: a list that
  // fits closes on the panel, with no divider under its last row.
  const bd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = bd.current;
    const d = ref.current;
    if (!open || !body || !d) return;
    const mark = () =>
      d.toggleAttribute("data-scrolls", body.scrollHeight > body.clientHeight + 1);
    mark();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(mark);
    ro.observe(body);
    for (const c of body.children) ro.observe(c);
    return () => ro.disconnect();
  }, [open, children]);
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
      <div ref={bd} className="f-bd">
        {children}
      </div>
      {actions && <div className="f-pn-foot">{actions}</div>}
    </dialog>
  );
}
