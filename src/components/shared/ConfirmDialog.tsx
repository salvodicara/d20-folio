/**
 * ConfirmDialog — the single folio confirm modal, driven by confirmStore.
 *
 * Mount this once near the app root. It renders nothing until a caller invokes
 * `useConfirmStore.getState().confirm({...})`, at which point it shows a small
 * `ModalShell` with a message and Cancel / Confirm actions. The dialog resolves
 * the awaiting promise via `respond` — dismiss (scrim/close) resolves false.
 *
 * Danger-tone prompts paint the confirm button as destructive brass.
 *
 * Usage (once, at the app root):
 *   <ConfirmDialog />
 */

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/shared/ModalShell";
import { useConfirmStore } from "@/stores/confirmStore";

export function ConfirmDialog() {
  const { t } = useTranslation();
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const respond = useConfirmStore((s) => s.respond);

  if (!open || !options) return null;

  return (
    <ModalShell
      open
      compact
      backDismiss={false}
      onClose={() => respond(false)}
      rubric={t("common.confirm")}
      title={options.title}
      size="sm"
    >
      <div className="modal-body confirm-body">
        <p className="confirm-msg">{options.message}</p>
        {options.details && options.details.length > 0 && (
          <ul className="confirm-details">
            {options.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        <div className="confirm-actions">
          <Button variant="ghost" size="sm" onClick={() => respond(false)}>
            {options.cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            size="sm"
            variant={options.tone === "danger" ? "destructive" : "primary"}
            onClick={() => respond(true)}
            autoFocus
          >
            {options.confirmLabel ?? t("common.confirm")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
