/**
 * The campaign's Diario tab (approved prototype camp-diary, 2026-11-02): the evenings on
 * the left (a picker on phone), and for the chosen one its written chronicle and the
 * automatic report in blocks. An evening is its play log (`sessionLogs/{id}`): the report
 * and the text both come from that one record, keyed by its id. The old session pages
 * (`sessions/*`, legacy) only lend their title and, when the evening has no text of its
 * own, their text read-only, matched by day. «Tutta la cronaca» shows the campaign's
 * existing chronicle exactly as it is stored, read-only.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import {
  diaryBlocks,
  oldPageTitle,
  sessionNumbers,
  type DiaryBlock,
} from "@/domains/chronicle/diary-view";
import { SessionStory } from "@/domains/chronicle/ui/SessionStory";
import { useReportNames } from "@/domains/chronicle/ui/report-names";
import { listSessions } from "@/features/campaigns/campaign-io";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { useChronicleSubscription } from "@/features/campaigns/useChronicleSubscription";
import {
  dayKey,
  dayOfLog,
  useSessionReports,
  type SessionLog,
} from "@/features/campaigns/useSessionReports";
import { intlTag, type Locale } from "@/lib/locale";
import { buildReport, foldSession, type SessionEntry } from "@/lib/session-log";
import { diagnosticsLog } from "@/lib/diagnostics";
import {
  localizePlayEvent,
  renderSessionReport,
  type SessionReportNames,
} from "@/lib/views/session-report-view";
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
  const [legacy, setLegacy] = useState<SessionLogDoc[] | null>(null);
  // The picked evening lives in the address (?session=…), so Back and a shared link work.
  const [params, setParams] = useSearchParams();
  const picked = params.get("session");
  const setPicked = (id: string) => {
    setParams((p) => {
      p.set("session", id);
      return p;
    });
  };
  const reports = useSessionReports(campaign.id);
  const evenings = reports.logs;
  useChronicleSubscription(campaign.id);
  const chronicle = useChronicleStore((s) => s.chronicle?.text ?? "");

  useEffect(() => {
    listSessions(campaign.id)
      .then(setLegacy)
      .catch((error: unknown) => {
        diagnosticsLog("warn", "diary.sessions-read-failed", { message: String(error) });
        setLegacy([]);
      });
  }, [campaign.id]);

  const numbers = useMemo(() => sessionNumbers(evenings.map((e) => e.id)), [evenings]);
  // An old session page lends its title and text to the evening played on its day.
  const legacyByDay = useMemo(() => {
    const out = new Map<string, SessionLogDoc>();
    for (const s of legacy ?? [])
      if (!out.has(dayKey(s.date))) out.set(dayKey(s.date), s);
    return out;
  }, [legacy]);
  if (!legacy) return <p role="status">{t("campaignScreen.loading")}</p>;

  // The newest evening opens first; with none, the chronicle.
  const current = picked ?? evenings[0]?.id ?? ALL;
  const evening = evenings.find((e) => e.id === current);
  const dayOf = (log: SessionLog) => dayOfLog(log.id) ?? new Date(log.lastAt);
  const day = (d: Date) =>
    d.toLocaleDateString(intlTag(locale), { day: "numeric", month: "long" });
  const titleOf = (log: SessionLog) =>
    t("campaignHub.sessionN", { n: numbers[log.id] ?? "" });
  const oldPage = (log: SessionLog) => legacyByDay.get(dayKey(dayOf(log)));
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
            {evenings.map((e) => (
              <option key={e.id} value={e.id}>
                {[titleOf(e), day(dayOf(e))].join(" · ")}
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
              {t("diary.sessionCount", { count: evenings.length })}
            </span>
          </span>
        </Link>
        {evenings.map((e) => (
          <Link
            key={e.id}
            className="f-row f-pick"
            to={`?session=${encodeURIComponent(e.id)}`}
            aria-current={current === e.id ? "page" : undefined}
          >
            <span className="f-row-main">
              <span className="f-row-t">{titleOf(e)}</span>
              <span className="f-row-s">
                {[day(dayOf(e)), oldPageTitle(oldPage(e)?.label ?? "")]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </Link>
        ))}
      </Panel>
      {evening ? (
        <SessionPage
          key={evening.id}
          log={evening}
          legacy={oldPage(evening)}
          title={titleOf(evening)}
          dayLabel={day(dayOf(evening))}
          campaign={campaign}
          locale={locale}
          onCopy={copy}
          onSaved={() => {
            reports.reload();
            onToast(t("diary.saved"));
          }}
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
              {t(evenings.length ? "diary.chronicleEmpty" : "diary.noSessions")}
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

function SessionPage({
  log,
  legacy,
  title,
  dayLabel,
  campaign,
  locale,
  onCopy,
  onSaved,
}: {
  log: SessionLog;
  legacy?: SessionLogDoc;
  title: string;
  dayLabel: string;
  campaign: CampaignDoc;
  locale: Locale;
  onCopy: (text: string, message: string) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const names = useReportNames(campaign, locale);
  const entries = useMemo(
    () => foldSession(log.items, { dmUid: campaign.dmUid }),
    [log.items, campaign.dmUid]
  );
  const sections = useMemo(() => buildReport(entries), [entries]);
  const blocks = useMemo(() => diaryBlocks(sections), [sections]);
  // The evening's own text; an old evening falls back to its old page's, read-only.
  const [story, setStory] = useState(log.notes ?? legacy?.notes);
  const players = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(campaign.memberDetails).map(([uid, m]) => [uid, m.displayName])
      ),
    [campaign.memberDetails]
  );
  const subtitle = [oldPageTitle(legacy?.label ?? ""), dayLabel]
    .filter(Boolean)
    .join(" · ");
  const report = () =>
    renderSessionReport(sections, `${title} · ${subtitle}`, t, names, { notes: story });
  const copyReport = () => onCopy(report(), t("sessionReport.copied"));
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
        <Button kind="primary" icon="u-copy" onClick={copyReport}>
          {t("common.copy")}
        </Button>
      }
    >
      <h3 className="f-sub">{subtitle}</h3>
      <div className="f-lbl f-lbl-gap">{t("diary.sessionChronicle")}</div>
      <SessionStory
        campaignId={campaign.id}
        logId={log.id}
        notes={log.notes}
        legacy={legacy?.notes}
        onCopyReport={copyReport}
        onSaved={(text) => {
          setStory(text);
          onSaved();
        }}
      />
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
