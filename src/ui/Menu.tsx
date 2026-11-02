import { useEffect, useRef, type ReactNode } from "react";

/**
 * A short list of commands: a popover under the top bar on laptop, a bottom sheet with
 * its title and a grab handle on phone. Uses the native <dialog> (focus trap, Esc);
 * a tap outside closes it.
 */
export function Menu({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="f-menu"
      onClose={onClose}
      onCancel={onClose}
      // A click on the dialog itself (not its content) is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="f-menu-head">{title}</div>
      {children}
    </dialog>
  );
}
