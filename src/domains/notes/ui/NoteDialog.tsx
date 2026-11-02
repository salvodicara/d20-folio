import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { SharedNote } from "@/types/campaign";
import { Button, Chip, Dialog, Field, TextArea } from "@/ui";

/** Write or edit a note: title, text (with @people and #places), important, and, for
 *  the DM only, hidden from the players. */
export function NoteDialog({
  note,
  isDm,
  onClose,
  onSave,
  onDelete,
}: {
  note: SharedNote | null;
  isDm: boolean;
  onClose: () => void;
  onSave: (draft: {
    title: string;
    content: string;
    pinned: boolean;
    dmOnly: boolean;
  }) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [dmOnly, setDmOnly] = useState(note?.dmOnly ?? false);
  const empty = !title.trim() && !content.trim();
  return (
    <Dialog
      open
      onClose={onClose}
      color="log"
      title={t(note ? "campaignHub.editNote" : "campaignNotes.newNote")}
      closeLabel={t("common.close")}
      actions={
        <>
          {onDelete && (
            <Button kind="danger" icon="u-delete" onClick={onDelete}>
              {t("common.delete")}
            </Button>
          )}
          <Button kind="quiet" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={empty}
            onClick={() =>
              onSave({ title: title.trim(), content: content.trim(), pinned, dmOnly })
            }
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="f-stack">
        <Field
          label={t("campaignHub.noteTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextArea
          label={t("campaignNotes.text")}
          value={content}
          rows={6}
          onChange={(e) => setContent(e.target.value)}
        />
        <p className="f-help">{t("campaignNotes.textHelp")}</p>
        <div className="f-chips">
          <Chip pressed={pinned} onClick={() => setPinned(!pinned)}>
            {t("campaignNotes.kind.important")}
          </Chip>
          {isDm && (
            <Chip pressed={dmOnly} onClick={() => setDmOnly(!dmOnly)}>
              {t("campaignHub.hideNote")}
            </Chip>
          )}
        </div>
      </div>
    </Dialog>
  );
}
