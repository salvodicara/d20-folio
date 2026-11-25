/**
 * The new UI's confirm (#1230): the app's one confirm store (`useConfirmStore`), drawn
 * as a new-UI pane while the new shell is mounted, so a question asked on a new screen
 * (leave a half-made character, discard a level-up) looks like the rest of it. The
 * classic `ConfirmDialog` stands down meanwhile (`newHost`).
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useConfirmStore } from "@/stores/confirmStore";
import { Button, Dialog } from "@/ui";

export function NewConfirm() {
  const { t } = useTranslation();
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const respond = useConfirmStore((s) => s.respond);
  useEffect(() => {
    useConfirmStore.setState({ newHost: true });
    return () => useConfirmStore.setState({ newHost: false });
  }, []);
  if (!open || !options) return null;
  return (
    <Dialog
      open
      onClose={() => respond(false)}
      color="abi"
      title={options.title}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button onClick={() => respond(false)}>
            {options.cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            kind={options.tone === "danger" ? "danger" : "primary"}
            onClick={() => respond(true)}
          >
            {options.confirmLabel ?? t("common.confirm")}
          </Button>
        </>
      }
    >
      <p className="f-confirm-msg">{options.message}</p>
      {options.details && options.details.length > 0 && (
        <ul className="f-confirm-list">
          {options.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
