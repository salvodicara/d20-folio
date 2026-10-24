/**
 * session-report presenter — renders the deterministic session report (outside play and
 * each encounter round by round) as markdown: the text a table copies into an AI for the
 * session summary. Pure: `t` and the name resolvers are injected, so the same log renders
 * in either language. Every optional field the log lacks is simply left out of the line.
 */

import type { LocText } from "@/lib/loc-text";
import type { Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import { riderEffectClause } from "@/lib/views/effect-rider-view";
import type { PlayEvent, ReportSection, SessionEntry } from "@/lib/session-log";
import type { ConcentrationRef } from "@/types/ids";

export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

export interface SessionReportNames {
  /** A party member's character name for a `pc-<uid>` id; `undefined` when unknown. */
  pc(id: string): string | undefined;
  condition(id: string): string;
  action(text: LocText): string;
  spell(ref: ConcentrationRef): string;
  /** A feature/spell/item id's display name (a status's source); the id when unknown. */
  source?(sourceId: string): string;
  /** The report's language: a speed stored in feet reads in its unit (IT: metres). */
  locale: Locale;
}

/** The results the report can say; another stored value is left out of the line. */
const OUTCOMES = new Set(["hit", "miss", "critical", "saved", "failed"]);
/** The stats this version can name; a newer app's stat reads as an unknown line. */
const KNOWN_STATS: ReadonlySet<string> = new Set(["ac", "speed"]);

export function localizePlayEvent(
  event: PlayEvent,
  t: TranslateFn,
  who: (id: string | undefined) => string,
  names: SessionReportNames
): string | null {
  const source = "source" in event && event.source ? names.action(event.source) : null;
  const withSource = (line: string): string =>
    source ? t("sessionReport.withSource", { line, source }) : line;
  switch (event.kind) {
    case "action": {
      const base = event.targets?.length
        ? t("sessionReport.actionOn", {
            actor: who(event.actor),
            source: source ?? t("sessionReport.somethingUsed"),
            targets: event.targets.map(who).join(", "),
          })
        : t("sessionReport.action", {
            actor: who(event.actor),
            source: source ?? t("sessionReport.somethingUsed"),
          });
      return event.outcome && OUTCOMES.has(event.outcome)
        ? `${base} — ${t(`sessionReport.outcome.${event.outcome}`)}`
        : base;
    }
    case "damage":
    case "heal":
    case "temp-hp": {
      // An attack's damage says its roll: "Aria: Longsword → Goblin: critical, 14".
      if (
        event.kind === "damage" &&
        event.actor &&
        source &&
        event.outcome &&
        OUTCOMES.has(event.outcome)
      )
        return t("sessionReport.attackDamage", {
          actor: who(event.actor),
          source,
          target: who(event.target),
          outcome: t(`sessionReport.outcome.${event.outcome}`),
          amount: event.amount,
        });
      const key =
        event.actor && event.kind !== "temp-hp" ? `${event.kind}By` : event.kind;
      return withSource(
        t(`sessionReport.${key === "temp-hp" ? "tempHp" : key}`, {
          actor: who(event.actor),
          target: who(event.target),
          amount: event.amount,
        })
      );
    }
    case "max-hp":
      return event.reduction > 0
        ? t("sessionReport.maxHpReduced", {
            target: who(event.target),
            reduction: event.reduction,
          })
        : t("sessionReport.maxHpRestored", { target: who(event.target) });
    case "condition":
      return withSource(
        t(event.gained ? "sessionReport.conditionGain" : "sessionReport.conditionLoss", {
          target: who(event.target),
          condition: names.condition(event.conditionId),
        })
      );
    case "concentration":
      return t(
        event.started
          ? "sessionReport.concentrationStart"
          : "sessionReport.concentrationEnd",
        { actor: who(event.actor), spell: names.spell(event.spell) }
      );
    case "status":
      return t(
        event.started && event.amount
          ? "sessionReport.statusPenalty"
          : event.started
            ? "sessionReport.statusStart"
            : "sessionReport.statusEnd",
        {
          actor: who(event.actor),
          source: names.source?.(event.sourceId) ?? event.sourceId,
          amount: event.amount ?? 0,
        }
      );
    case "rider":
      return withSource(
        t("sessionReport.rider", {
          target: who(event.target),
          effect: riderEffectClause(event.rider, t, names.locale),
        })
      );
    case "down":
      return t("sessionReport.down", { target: who(event.target) });
    case "stabilized":
      return withSource(
        t(event.actor ? "combatChronicle.stabilizedBy" : "sessionReport.stabilized", {
          actor: who(event.actor),
          target: who(event.target),
        })
      );
    case "resource-grant":
      return withSource(
        t("sessionReport.resourceGrant", {
          actor: who(event.actor),
          target: who(event.target),
          resource: t(`sessionReport.resource.${event.resource}`, {
            value: event.value ?? "",
          }),
        })
      );
    case "stat-change": {
      // A stat this version doesn't know (a newer app's) degrades like an unknown kind.
      if (!KNOWN_STATS.has(event.stat)) break;
      // Speeds are stored in feet and read in the report language's unit (IT: metres).
      const value = (n: number): string | number =>
        event.stat === "speed" ? localeDistance(n, names.locale) : n;
      // No value before (a hand-typed monster's unknown speed): only the new one.
      return event.from === undefined
        ? t(`sessionReport.statChange.${event.stat}Set`, {
            target: who(event.target),
            to: value(event.to),
          })
        : t(`sessionReport.statChange.${event.stat}`, {
            target: who(event.target),
            from: value(event.from),
            to: value(event.to),
          });
    }
    case "death-save":
      return t(`sessionReport.deathSave.${event.outcome}`, { actor: who(event.actor) });
    case "rest":
      return t(`sessionReport.rest.${event.rest}`, { actor: who(event.actor) });
    case "time-passes":
      // The same unit as the sheet's log line (golden rule 6).
      return t("combatLog.timePasses", { count: event.minutes });
    case "note":
      return event.actor ? `${who(event.actor)}: ${event.text}` : event.text;
    case "encounter-start":
    case "encounter-end":
    case "round-start":
      return null;
  }
  // A kind (or stat) written by a newer app version: a neutral line, never a blank row.
  return t("combatLog.unknownEvent");
}

/** Render the report as markdown under `title` (e.g. the session's date). */
export function renderSessionReport(
  sections: readonly ReportSection[],
  title: string,
  t: TranslateFn,
  names: SessionReportNames,
  /** The session page's free notes: they lead the copy, so the notes and the log reach
   *  an AI summary together. Left out when blank. */
  options: { notes?: string } = {}
): string {
  const out: string[] = [`# ${title}`];
  const notes = options.notes?.trim();
  if (notes) out.push("", `## ${t("sessionReport.notes")}`, "", notes);
  let encounters = 0;
  const lines = (
    entries: readonly SessionEntry[],
    named: Record<string, string>
  ): void => {
    const who = (id: string | undefined): string =>
      (id && (named[id] ?? names.pc(id))) || t("combatChronicle.someone");
    for (const entry of entries) {
      const line = localizePlayEvent(entry.event, t, who, names);
      if (line) out.push(`- ${line}`);
    }
  };
  for (const section of sections) {
    if (section.kind === "outside") {
      out.push("", `## ${t("sessionReport.outside")}`);
      lines(section.entries, {});
      continue;
    }
    encounters += 1;
    const heading = t("sessionReport.encounter", { n: encounters });
    const outcome = section.outcome
      ? ` — ${t(`sessionReport.result.${section.outcome}`)}`
      : "";
    out.push("", `## ${heading}${outcome}`);
    for (const round of section.rounds) {
      out.push(
        "",
        `### ${
          round.round === null
            ? t("sessionReport.beforeRounds")
            : t("combatChronicle.round", { n: round.round })
        }`
      );
      lines(round.entries, section.names);
    }
  }
  return out.join("\n");
}
