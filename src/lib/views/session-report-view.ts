/**
 * session-report presenter — renders the deterministic session report (outside play and
 * each encounter round by round) as markdown: the text a table copies into an AI for the
 * session summary. Pure: `t` and the name resolvers are injected, so the same log renders
 * in either language. Every optional field the log lacks is simply left out of the line.
 */

import type { LocText } from "@/lib/loc-text";
import type { PlayEvent, ReportSection, SessionEntry } from "@/lib/session-log";
import type { ConcentrationRef } from "@/types/ids";

export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

export interface SessionReportNames {
  /** A party member's character name for a `pc-<uid>` id; `undefined` when unknown. */
  pc(id: string): string | undefined;
  condition(id: string): string;
  action(text: LocText): string;
  spell(ref: ConcentrationRef): string;
}

function lineFor(
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
      return event.outcome
        ? `${base} — ${t(`sessionReport.outcome.${event.outcome}`)}`
        : base;
    }
    case "damage":
    case "heal":
    case "temp-hp": {
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
    case "death-save":
      return t(`sessionReport.deathSave.${event.outcome}`, { actor: who(event.actor) });
    case "rest":
      return t(`sessionReport.rest.${event.rest}`, { actor: who(event.actor) });
    case "note":
      return event.actor ? `${who(event.actor)}: ${event.text}` : event.text;
    case "encounter-start":
    case "encounter-end":
    case "round-start":
      return null;
  }
}

/** Render the report as markdown under `title` (e.g. the session's date). */
export function renderSessionReport(
  sections: readonly ReportSection[],
  title: string,
  t: TranslateFn,
  names: SessionReportNames
): string {
  const out: string[] = [`# ${title}`];
  let encounters = 0;
  const lines = (
    entries: readonly SessionEntry[],
    named: Record<string, string>
  ): void => {
    const who = (id: string | undefined): string =>
      (id && (named[id] ?? names.pc(id))) || t("combatChronicle.someone");
    for (const entry of entries) {
      const line = lineFor(entry.event, t, who, names);
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
