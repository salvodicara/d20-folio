/**
 * SessionDayReport — the automatic, deterministic report of one played evening (nobody
 * writes it), shown under a session page's notes: a quiet disclosure opening to the
 * round-by-round report with a Copy button.
 */

import { useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, ChevronDown } from "lucide-react";

import { CopyButton } from "@/components/shared/CopyButton";
import { Icon } from "@/components/ui/icon";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { SessionLog } from "@/features/campaigns/useSessionReports";
import { buildReport, foldSession } from "@/lib/session-log";
import { localizeClassName, localizeText } from "@/lib/views/srd-i18n";
import { snapshotClasses } from "@/features/campaigns/member-snapshot";
import {
  renderSessionReport,
  type SessionReportNames,
} from "@/lib/views/session-report-view";
import { concentrationLabel, grantSourceLabel } from "@/lib/views/tracker-view";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";

const MARKERS = new Set([
  "encounter-start",
  "encounter-end",
  "round-start",
  "scene-start",
]);

/** The automatic report of one logged sitting, behind a quiet disclosure. */
export function SessionDayReport({
  log,
  date,
  notes,
  onOpen,
}: {
  log: SessionLog;
  date: Date;
  /** The session page's notes: shown above on the page, and leading the copy. */
  notes?: string;
  /** Called on open, so the caller can refresh the logs. */
  onOpen?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { language } = useLocale();
  const campaign = useCampaignStore((s) => s.campaign);
  const [open, setOpen] = useState(false);

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
      source: (id) => grantSourceLabel(id, language),
      time: (at) =>
        new Date(at).toLocaleTimeString(language, {
          hour: "2-digit",
          minute: "2-digit",
        }),
    }),
    [campaign?.memberDetails, language]
  );
  // The party for the copy's cast line: each member's character, with class and level.
  const party = useMemo(
    () =>
      Object.values(campaign?.memberDetails ?? {}).flatMap((member) =>
        member.character
          ? [
              {
                name: member.character.name,
                classes: snapshotClasses(member.character)
                  .map(
                    (entry) =>
                      `${localizeClassName(entry.classId, language)} ${entry.level}`
                  )
                  .join(" / "),
              },
            ]
          : []
      ),
    [campaign?.memberDetails, language]
  );
  const entries = useMemo(
    () => foldSession(log.items, { dmUid: campaign?.dmUid }),
    [log.items, campaign?.dmUid]
  );
  const lines = entries.filter((e) => !MARKERS.has(e.event.kind)).length;
  const title = t("sessionReport.title", {
    date: date.toLocaleDateString(i18n.language),
  });
  const markdown = open ? renderSessionReport(buildReport(entries), title, t, names) : "";
  // The copy carries the page's notes too: one paste gives an AI the whole evening.
  const copied = open
    ? renderSessionReport(buildReport(entries), title, t, names, { notes, party })
    : "";

  return (
    <div className="sess-report-block" data-open={open || undefined}>
      <button
        type="button"
        className="sess-report-toggle"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((v) => !v);
        }}
      >
        <Icon as={BookOpenText} size="sm" decorative />
        <span>{t("sessionReport.automatic")}</span>
        <span className="sess-report-count">
          {t("sessionReport.entries", { count: lines })}
        </span>
        <Icon as={ChevronDown} size="sm" decorative className="sess-chevron" />
      </button>
      {open && (
        <div className="sess-report">
          <ReportBody markdown={markdown} />
          <CopyButton
            value={copied}
            toastMessage={t("sessionReport.copied")}
            label={t("common.copy")}
            variant="ghost"
            size="sm"
            className="self-start"
          />
        </div>
      )}
    </div>
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
