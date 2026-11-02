/**
 * The campaign's Diario tab (approved prototype camp-diary, 2026-11-02): the sessions on
 * the left (a picker on phone), and for the chosen one its written chronicle and the
 * automatic report of the evening in blocks. «Tutta la cronaca» shows the campaign's
 * existing chronicle exactly as it is stored, read-only.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import {
  diaryBlocks,
  sessionNumbers,
  type DiaryBlock,
} from "@/domains/chronicle/diary-view";
import { listSessions } from "@/features/campaigns/campaign-io";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { useChronicleSubscription } from "@/features/campaigns/useChronicleSubscription";
import {
  useSessionReports,
  type SessionLog,
} from "@/features/campaigns/useSessionReports";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { intlTag, type Locale } from "@/lib/locale";
import { buildReport, foldSession, type SessionEntry } from "@/lib/session-log";
import { diagnosticsLog } from "@/lib/diagnostics";
import {
  localizePlayEvent,
  renderSessionReport,
  type SessionReportNames,
} from "@/lib/views/session-report-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { concentrationLabel, grantSourceLabel } from "@/lib/views/tracker-view";
import type { CampaignDoc, SessionLogDoc } from "@/types/campaign";
import { Button, Panel } from "@/ui";

const ALL = "all";

export function DiaryTab({
  campaign,
  locale,
  onToast,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionLogDoc[] | null>(null);
  // The picked session lives in the address (?session=…), so Back and a shared link work.
  const [params, setParams] = useSearchParams();
  const picked = params.get("session");
  const setPicked = (id: string) => {
    setParams((p) => {
      p.set("session", id);
      return p;
    });
  };
  const reports = useSessionReports(campaign.id);
  useChronicleSubscription(campaign.id);
  const chronicle = useChronicleStore((s) => s.chronicle?.text ?? "");

  useEffect(() => {
    listSessions(campaign.id)
      .then(setSessions)
      .catch((error: unknown) => {
        diagnosticsLog("warn", "diary.sessions-read-failed", { message: String(error) });
        setSessions([]);
      });
  }, [campaign.id]);

  const numbers = useMemo(() => sessionNumbers(sessions ?? []), [sessions]);
  if (!sessions) return <p role="status">{t("campaignScreen.loading")}</p>;

  // The newest session opens first; with none, the chronicle.
  const current = picked ?? sessions[0]?.id ?? ALL;
  const session = sessions.find((s) => s.id === current);
  const day = (d: Date) =>
    d.toLocaleDateString(intlTag(locale), { day: "numeric", month: "long" });
  const sessionTitle = (s: SessionLogDoc) =>
    t("campaignHub.sessionN", { n: numbers[s.id] ?? "" });
  const copy = (text: string, message: string) => {
    void navigator.clipboard.writeText(text).then(() => onToast(message));
  };

  return (
    <div className="f-split-l">
      <div className="f-show-m">
        <label className="f-field">
          <span className="f-lbl">{t("diary.pickSession")}</span>
          <select
            className="f-in"
            value={current}
            onChange={(e) => setPicked(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {[sessionTitle(s), s.label].filter(Boolean).join(" · ")}
              </option>
            ))}
            <option value={ALL}>{t("diary.allChronicle")}</option>
          </select>
        </label>
      </div>
      <Panel color="log" title={t("campaignHub.sessions")} className="f-hide-m f-sticky">
        <Link
          className="f-row f-pick"
          to={`?session=${ALL}`}
          aria-current={current === ALL ? "page" : undefined}
        >
          <span className="f-row-main">
            <span className="f-row-t">{t("diary.allChronicle")}</span>
            <span className="f-row-s">
              {t("diary.sessionCount", { count: sessions.length })}
            </span>
          </span>
        </Link>
        {sessions.map((s) => (
          <Link
            key={s.id}
            className="f-row f-pick"
            to={`?session=${encodeURIComponent(s.id)}`}
            aria-current={current === s.id ? "page" : undefined}
          >
            <span className="f-row-main">
              <span className="f-row-t">{sessionTitle(s)}</span>
              <span className="f-row-s">
                {[day(s.date), s.label].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
        ))}
      </Panel>
      {session ? (
        <SessionPage
          key={session.id}
          session={session}
          title={sessionTitle(session)}
          dayLabel={day(session.date)}
          logs={reports.logsOn(session.date)}
          campaign={campaign}
          locale={locale}
          onCopy={copy}
        />
      ) : (
        <Panel
          color="log"
          title={t("diary.allChronicle")}
          aside={
            chronicle.trim() && (
              <Button
                kind="primary"
                icon="u-copy"
                onClick={() => copy(chronicle, t("diary.copied"))}
              >
                {t("diary.copyAll")}
              </Button>
            )
          }
        >
          {chronicle.trim() ? (
            <div data-user-text="">
              <BlockMarkdown className="f-prose" text={chronicle} />
            </div>
          ) : (
            <p className="f-quiet">
              {t(sessions.length ? "diary.chronicleEmpty" : "diary.noSessions")}
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

function SessionPage({
  session,
  title,
  dayLabel,
  logs,
  campaign,
  locale,
  onCopy,
}: {
  session: SessionLogDoc;
  title: string;
  dayLabel: string;
  logs: SessionLog[];
  campaign: CampaignDoc;
  locale: Locale;
  onCopy: (text: string, message: string) => void;
}) {
  const { t } = useTranslation();
  const names = useReportNames(campaign, locale);
  const entries = useMemo(
    () => logs.flatMap((log) => foldSession(log.items, { dmUid: campaign.dmUid })),
    [logs, campaign.dmUid]
  );
  const sections = useMemo(() => buildReport(entries), [entries]);
  const blocks = useMemo(() => diaryBlocks(sections), [sections]);
  const notes = session.notes.trim();
  const players = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(campaign.memberDetails).map(([uid, m]) => [uid, m.displayName])
      ),
    [campaign.memberDetails]
  );
  const heading = [title, session.label, dayLabel].filter(Boolean).join(" · ");
  const report = () =>
    renderSessionReport(sections, heading, t, names, { notes: session.notes });
  const time = (at: number) =>
    new Date(at).toLocaleTimeString(intlTag(locale), {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Panel
      color="log"
      title={title}
      aside={
        <Button
          kind="primary"
          icon="u-copy"
          onClick={() => onCopy(report(), t("sessionReport.copied"))}
        >
          {t("common.copy")}
        </Button>
      }
    >
      <h3 className="f-sub">{[session.label, dayLabel].filter(Boolean).join(" · ")}</h3>
      <div className="f-lbl f-lbl-gap">{t("diary.sessionChronicle")}</div>
      {notes ? (
        <div data-user-text="">
          <BlockMarkdown className="f-prose" text={notes} />
        </div>
      ) : (
        <div className="f-empty">
          <b>{t("diary.storyTitle")}</b>
          <p>{t("diary.storyHelp")}</p>
          <Button
            icon="u-copy"
            onClick={() => onCopy(report(), t("sessionReport.copied"))}
          >
            {t("diary.copyReport")}
          </Button>
        </div>
      )}
      <div className="f-lbl f-lbl-rule">{t("diary.autoReport")}</div>
      {blocks.length === 0 && <p className="f-quiet">{t("diary.noReport")}</p>}
      {blocks.map((block) => (
        <section key={`${block.kind}-${block.at}`} className="f-tl-block">
          <h4 className="f-lbl">
            {
              // the separator never starts a line
              [blockTitle(block, t), ...blockMeta(block, t), time(block.at)].join(
                "\u00a0· "
              )
            }
          </h4>
          {block.entries.map((entry) => (
            <TimelineLine
              key={entry.id}
              entry={entry}
              names={names}
              foes={block.kind === "fight" ? block.names : {}}
              players={players}
            />
          ))}
        </section>
      ))}
    </Panel>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

function blockTitle(block: DiaryBlock, t: T): string {
  if (block.kind === "explore") return t("diary.explore");
  if (block.kind === "rest") return t("character.rest");
  return block.foes.length
    ? t("diary.fightWith", { foes: block.foes.join(", ") })
    : t("campaignScreen.tabFight");
}

function blockMeta(block: DiaryBlock, t: T): string[] {
  return block.kind === "fight" && block.rounds > 0
    ? [t("diary.rounds", { count: block.rounds })]
    : [];
}

function TimelineLine({
  entry,
  names,
  foes,
  players,
}: {
  entry: SessionEntry;
  names: SessionReportNames;
  foes: Record<string, string>;
  players: Record<string, string>;
}) {
  const { t } = useTranslation();
  const who = (id: string | undefined): string =>
    (id && (foes[id] ?? names.pc(id))) || t("combatChronicle.someone");
  // A note is signed by the player who wrote it, as at the table.
  const writer = (id: string): string => players[id.replace(/^pc-/, "")] ?? who(id);
  const { event } = entry;
  if (event.kind === "note") {
    return (
      <p className="f-tl" data-note="">
        <span>
          <i>{event.text}</i>
          {event.actor && (
            <span className="f-tl-by">{`\u00a0—\u00a0${t("diary.noteBy", { name: writer(event.actor) })}`}</span>
          )}
        </span>
      </p>
    );
  }
  const text = localizePlayEvent(event, t, who, names);
  if (!text) return null;
  return (
    <p className="f-tl">
      <span>{text}</span>
    </p>
  );
}

/** How the report names people, conditions, spells and sources, in the reader's language. */
function useReportNames(campaign: CampaignDoc, locale: Locale): SessionReportNames {
  return useMemo(
    () => ({
      pc: (id) => {
        const member = campaign.memberDetails[id.replace(/^pc-/, "")];
        return member?.character?.name || member?.displayName || undefined;
      },
      condition: (id) =>
        hasSrd("condition", id, "name", locale)
          ? localizeSrd("condition", id, "name", locale)
          : id,
      action: (text) => localizeText(text, locale),
      spell: (ref) => concentrationLabel(ref, locale),
      source: (id) => grantSourceLabel(id, locale),
      locale,
    }),
    [campaign.memberDetails, locale]
  );
}
