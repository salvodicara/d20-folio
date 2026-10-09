/**
 * LastTime — the Live tab's "Last time…" card: the newest session's notes as rendered
 * prose (clamped), so the table can pick up where it stopped without leaving the fight
 * view. Read-only: writing happens on the session's page in the Journal, one tap away.
 * A one-shot read each time the tab is shown (no standing listener), like Sessions.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { NoteClamp } from "@/components/shared/NoteClamp";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { listSessions } from "@/features/campaigns/campaign-io";
import type { SessionLogDoc } from "@/types/campaign";

export function LastTime({
  campaignId,
  visible,
  onOpenJournal,
}: {
  campaignId: string;
  /** Re-read whenever the tab is shown (the hub keeps hidden tabs mounted). */
  visible: boolean;
  onOpenJournal: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [latest, setLatest] = useState<SessionLogDoc | null | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void listSessions(campaignId)
      .then((sessions) => {
        if (!cancelled) setLatest(sessions[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLatest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, visible]);

  if (latest === undefined) return null;
  const notes = latest?.notes.trim() ?? "";

  return (
    <SectionPanel sectionId="last-time" title={t("campaignHub.lastTime")} framed>
      <div className="last-time">
        {latest ? (
          <>
            <p className="last-time-meta">
              <span className="last-time-label">{latest.label}</span>
              <span>{latest.date.toLocaleDateString(i18n.language)}</span>
            </p>
            {notes ? (
              <NoteClamp variant="reading">
                <BlockMarkdown text={notes} className="chronicle-prose" />
              </NoteClamp>
            ) : (
              <p className="last-time-empty">{t("campaignHub.lastTimeNoNotes")}</p>
            )}
          </>
        ) : (
          <p className="last-time-empty">{t("campaignHub.sessionsEmpty")}</p>
        )}
        <Button variant="ghost" size="sm" className="self-start" onClick={onOpenJournal}>
          {t("campaignHub.lastTimeOpen")}
          <Icon as={ArrowRight} size="sm" decorative />
        </Button>
      </div>
    </SectionPanel>
  );
}
