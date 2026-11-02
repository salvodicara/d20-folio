/**
 * One evening's automatic report as blocks (exploration, each fight with its rounds and
 * foes, each rest), each with its time, its lines and the notes signed by their player:
 * the Diario's session page and the sheet's «Resoconto» show an evening the same way.
 */
import { useTranslation } from "react-i18next";

import type { DiaryBlock } from "@/domains/chronicle/diary-view";
import { intlTag, type Locale } from "@/lib/locale";
import type { SessionEntry } from "@/lib/session-log";
import {
  localizePlayEvent,
  type SessionReportNames,
} from "@/lib/views/session-report-view";

export function ReportBlocks({
  blocks,
  names,
  players,
  locale,
}: {
  blocks: readonly DiaryBlock[];
  names: SessionReportNames;
  players: Record<string, string>;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const time = (at: number) =>
    new Date(at).toLocaleTimeString(intlTag(locale), {
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <>
      {blocks.map((block) => (
        <section key={`${block.kind}-${String(block.at)}`} className="f-tl-block">
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
    </>
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
