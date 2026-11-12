/**
 * «Cronaca della sessione»: the evening told as a story. It lives on the evening's play
 * log and is saved there with an explicit Save (the whole text, last writer wins). An old
 * evening without it shows the legacy session page's text, read-only until edited: the
 * edit is saved to the play log, never back to the old page.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { saveSessionNotes } from "@/features/campaigns/session-log-source";
import { diagnosticsLog } from "@/lib/diagnostics";
import { Button, TextArea } from "@/ui";

export function SessionStory({
  campaignId,
  logId,
  notes,
  legacy,
  onSaved,
  onCopyReport,
}: {
  campaignId: string;
  /** The evening's play log id (`2026-10-23`, `2026-10-23-2`). */
  logId: string;
  /** The text saved on the play log, if any. */
  notes?: string;
  /** The old session page's text for the same day, shown only without `notes`. */
  legacy?: string;
  onSaved: (text: string) => void;
  onCopyReport: () => void;
}) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const text = (saved ?? notes ?? legacy ?? "").trim();

  const save = () => {
    if (draft === null || saving) return;
    setSaving(true);
    setFailed(false);
    saveSessionNotes(campaignId, logId, draft)
      .then(() => {
        setSaved(draft);
        setDraft(null);
        onSaved(draft);
      })
      .catch((error: unknown) => {
        diagnosticsLog("warn", "diary.notes-save-failed", { message: String(error) });
        setFailed(true);
      })
      .finally(() => setSaving(false));
  };

  if (draft !== null) {
    return (
      <div className="f-stack">
        <TextArea
          label={t("diary.sessionChronicle")}
          hideLabel
          value={draft}
          rows={10}
          onChange={(e) => setDraft(e.target.value)}
          error={failed ? t("diary.saveFailed") : undefined}
        />
        <div className="f-acts">
          <Button kind="primary" icon="u-check" onClick={save} disabled={saving}>
            {t("common.save")}
          </Button>
          <Button
            kind="quiet"
            onClick={() => {
              setDraft(null);
              setFailed(false);
            }}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  if (!text) {
    return (
      <div className="f-empty">
        <b>{t("diary.storyTitle")}</b>
        <p>{t("diary.storyHelp")}</p>
        <div className="f-acts">
          <Button icon="u-copy" onClick={onCopyReport}>
            {t("diary.copyReport")}
          </Button>
          <Button kind="primary" icon="u-edit" onClick={() => setDraft("")}>
            {t("diary.pasteChronicle")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="f-stack">
      <div data-user-text="">
        <BlockMarkdown className="f-prose" text={text} softBreaks />
      </div>
      <div>
        <Button kind="quiet" icon="u-edit" onClick={() => setDraft(text)}>
          {t("common.edit")}
        </Button>
      </div>
    </div>
  );
}
