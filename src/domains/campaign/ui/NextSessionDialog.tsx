/**
 * The DM sets, changes or clears the next session's date and time from the campaign
 * header (the classic «Ultima volta» editor, in a dialog). Saved in local time.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Dialog, Field } from "@/ui";

/** `datetime-local` value (local time, minute precision) ↔ epoch ms. */
function toLocalInput(at: number): string {
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
}

export function NextSessionDialog({
  at,
  onSave,
  onClose,
}: {
  at: number | null;
  onSave: (at: number | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(at === null ? "" : toLocalInput(at));
  const next = fromLocalInput(text);
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={t("campaignHub.nextSession")}
      closeLabel={t("common.close")}
      actions={
        <>
          {at !== null && (
            <Button
              onClick={() => {
                onSave(null);
                onClose();
              }}
            >
              {t("campaignHub.nextSessionClear")}
            </Button>
          )}
          <Button
            kind="primary"
            disabled={next === null || next === at}
            onClick={() => {
              if (next === null) return;
              onSave(next);
              onClose();
            }}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <Field
          label={t("campaignHub.nextSessionInput")}
          type="datetime-local"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
