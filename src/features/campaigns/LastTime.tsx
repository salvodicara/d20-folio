/**
 * LastTime — the Live tab's "Last time…" card: when the table meets next (the DM sets
 * it; everyone sees it while it is upcoming) and the newest session's notes as rendered
 * prose (clamped), so the table can pick up where it stopped without leaving the fight
 * view. Notes are read-only here: writing happens on the session's page in the Journal,
 * one tap away. A one-shot read each time the tab is shown (no standing listener).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarClock } from "lucide-react";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { NoteClamp } from "@/components/shared/NoteClamp";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { listSessions, setNextSession } from "@/features/campaigns/campaign-io";
import type { SessionLogDoc } from "@/types/campaign";

/** The evening stays "next" for a few hours after it starts (people are playing). */
const STILL_TONIGHT_MS = 6 * 3_600_000;

/** `datetime-local` value (local time, minute precision) ↔ epoch ms. */
function toLocalInput(at: number): string {
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LastTime({
  campaignId,
  visible,
  canManage,
  onOpenJournal,
}: {
  campaignId: string;
  /** Re-read whenever the tab is shown (the hub keeps hidden tabs mounted). */
  visible: boolean;
  /** The DM sets the next session; players only read it. */
  canManage: boolean;
  onOpenJournal: () => void;
}) {
  const { t, i18n } = useTranslation();
  const campaign = useCampaignStore((s) => s.campaign);
  const setCampaign = useCampaignStore((s) => s.setCampaign);
  const [latest, setLatest] = useState<SessionLogDoc | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // "Now" is read when the tab is shown, not on every render (render stays pure).
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void listSessions(campaignId)
      .then((sessions) => {
        if (cancelled) return;
        setLatest(sessions[0] ?? null);
        setNow(Date.now());
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
  const nextAt = campaign?.nextSessionAt ?? null;
  const upcoming = nextAt !== null && nextAt + STILL_TONIGHT_MS > now;

  function saveNext(at: number | null): void {
    setEditing(false);
    if (!campaign) return;
    setCampaign({ ...campaign, nextSessionAt: at });
    void setNextSession(campaignId, at);
  }

  const nextRow = editing ? (
    <form
      className="last-time-next is-editing"
      onSubmit={(e) => {
        e.preventDefault();
        const at = new Date(draft).getTime();
        if (Number.isFinite(at)) saveNext(at);
      }}
    >
      <Input
        type="datetime-local"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={t("campaignHub.nextSessionInput")}
        required
      />
      <Button type="submit" variant="secondary" size="sm">
        {t("common.save")}
      </Button>
      {nextAt !== null && (
        <Button type="button" variant="ghost" size="sm" onClick={() => saveNext(null)}>
          {t("campaignHub.nextSessionClear")}
        </Button>
      )}
    </form>
  ) : upcoming ? (
    <p className="last-time-next">
      <Icon as={CalendarClock} size="sm" decorative />
      <span className="last-time-next-label">{t("campaignHub.nextSession")}</span>
      <span className="last-time-next-when">
        {new Date(nextAt).toLocaleString(i18n.language, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      {canManage && (
        <Button
          variant="ghost"
          size="sm"
          className="last-time-next-edit"
          onClick={() => {
            setDraft(toLocalInput(nextAt));
            setEditing(true);
          }}
        >
          {t("campaignHub.nextSessionChange")}
        </Button>
      )}
    </p>
  ) : canManage ? (
    <Button
      variant="ghost"
      size="sm"
      className="self-start"
      onClick={() => {
        setDraft("");
        setEditing(true);
      }}
    >
      <Icon as={CalendarClock} size="sm" decorative />
      {t("campaignHub.nextSessionSet")}
    </Button>
  ) : null;

  return (
    <SectionPanel sectionId="last-time" title={t("campaignHub.lastTime")} framed>
      <div className="last-time">
        {nextRow}
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
