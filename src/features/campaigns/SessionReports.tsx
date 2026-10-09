/**
 * SessionReports — the automatic, deterministic report of each play session, built from
 * the campaign's session log (nobody writes it). One row per session, newest first; a
 * row opens to the round-by-round chronicle with a Copy button. A one-shot read on open,
 * like Sessions (no standing listener). Wears the Sessions row vocabulary (`sess-*`).
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, ChevronDown } from "lucide-react";

import { CopyButton } from "@/components/shared/CopyButton";
import { Icon } from "@/components/ui/icon";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { sessionLogStoreFor } from "@/features/campaigns/session-log-source";
import { diagnosticsLog } from "@/lib/diagnostics";
import { buildReport, foldSession, type LogItem } from "@/lib/session-log";
import { localizeText } from "@/lib/views/srd-i18n";
import {
  renderSessionReport,
  type SessionReportNames,
} from "@/lib/views/session-report-view";
import { concentrationLabel } from "@/lib/views/tracker-view";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";

const RECENT_SESSIONS = 10;

interface SessionLog {
  id: string;
  lastAt: number;
  items: LogItem[];
}

const MARKERS = new Set(["encounter-start", "encounter-end", "round-start"]);

/** The report's own line count: effective lines, without the fight markers. */
function lineCount(items: LogItem[], dmUid: string | undefined): number {
  return foldSession(items, { dmUid }).filter((e) => !MARKERS.has(e.event.kind)).length;
}

/** `2026-10-08` / `2026-10-08-2` → the local date of that session day. */
function dayOf(sessionId: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(sessionId);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function SessionReports({
  campaignId,
  visible = true,
}: {
  campaignId: string;
  /** Re-read each time the panel is shown (the hub keeps hidden tabs mounted). */
  visible?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { language } = useLocale();
  const campaign = useCampaignStore((s) => s.campaign);
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // One-shot reads (no standing listener): on open, and again whenever a report is
  // opened, so a session played since the page loaded shows its latest lines.
  const load = useCallback((): void => {
    sessionLogStoreFor(campaignId)
      .recent(RECENT_SESSIONS)
      .then((recent) => setSessions(recent.filter((s) => s.items.length > 0)))
      .catch((error: unknown) =>
        diagnosticsLog("warn", "session-log.report-read-failed", {
          message: String(error),
        })
      );
  }, [campaignId]);
  useEffect(() => {
    if (visible) load();
  }, [load, visible]);
  const toggle = (id: string): void => {
    setOpenId((current) => (current === id ? null : id));
    load();
  };

  const names = useMemo<SessionReportNames>(
    () => ({
      pc: (id) => {
        const member = campaign?.memberDetails[id.replace(/^pc-/, "")];
        return member?.character?.name || member?.displayName || undefined;
      },
      condition: (id) =>
        hasSrd("condition", id, "name", language)
          ? localizeSrd("condition", id, "name", language)
          : id,
      action: (text) => localizeText(text, language),
      spell: (ref) => concentrationLabel(ref, language),
    }),
    [campaign?.memberDetails, language]
  );

  const reportOf = useCallback(
    (session: SessionLog): string => {
      const day = dayOf(session.id);
      const title = t("sessionReport.title", {
        date: day ? day.toLocaleDateString(i18n.language) : session.id,
      });
      const entries = foldSession(session.items, { dmUid: campaign?.dmUid });
      return renderSessionReport(buildReport(entries), title, t, names);
    },
    [campaign?.dmUid, i18n.language, names, t]
  );

  function renderRow(session: SessionLog): ReactElement {
    const open = openId === session.id;
    const day = dayOf(session.id);
    const markdown = open ? reportOf(session) : "";
    return (
      <li key={session.id} className="sess-item" data-open={open || undefined}>
        <div className="sess-summary" onClick={() => toggle(session.id)}>
          <button
            type="button"
            className="sess-toggle"
            aria-expanded={open}
            aria-label={t("sessionReport.toggle")}
            onClick={(e) => {
              e.stopPropagation();
              toggle(session.id);
            }}
          >
            <Icon as={ChevronDown} size="sm" decorative className="sess-chevron" />
          </button>
          <div className="sess-head">
            <Icon as={BookOpenText} size="sm" decorative className="sess-ico" />
            <span className="sess-label">
              {day ? day.toLocaleDateString(i18n.language) : session.id}
            </span>
            <span className="sess-date">
              {t("sessionReport.entries", {
                count: lineCount(session.items, campaign?.dmUid),
              })}
            </span>
          </div>
        </div>
        <div className="sess-bodywrap">
          <div className="sess-body">
            {open && (
              <div className="sess-report">
                <ReportBody markdown={markdown} />
                <CopyButton
                  value={markdown}
                  toastMessage={t("sessionReport.copied")}
                  label={t("common.copy")}
                  variant="ghost"
                  size="sm"
                  className="self-start"
                />
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <SectionPanel
      sectionId="session-reports"
      title={t("sessionReport.panelTitle")}
      count={sessions.length || undefined}
      framed
    >
      {sessions.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("sessionReport.empty")}</p>
      ) : (
        <ul className="sess-list">{sessions.map(renderRow)}</ul>
      )}
    </SectionPanel>
  );
}

/** The report's own markdown as readable blocks (it only ever emits #, ##, ### and -). */
function ReportBody({ markdown }: { markdown: string }) {
  const blocks: ReactElement[] = [];
  let items: string[] = [];
  const flush = (): void => {
    if (items.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="sess-report-lines">
        {items.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    );
    items = [];
  };
  for (const line of markdown.split("\n")) {
    if (line.startsWith("- ")) {
      items.push(line.slice(2));
      continue;
    }
    flush();
    if (line.startsWith("### ")) {
      blocks.push(
        <h5 key={blocks.length} className="sess-report-round">
          {line.slice(4)}
        </h5>
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h4 key={blocks.length} className="sess-report-section">
          {line.slice(3)}
        </h4>
      );
    }
  }
  flush();
  return <div className="sess-report-body">{blocks}</div>;
}
