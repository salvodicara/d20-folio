/**
 * combat-chronicle presenter — the Combat Chronicle feed's line for each session-log
 * event, the ranked "Who struck?" candidates, and the markdown chapter the DM saves at
 * the end of a fight. Pure: `t` and the name resolvers are injected, so the same log
 * renders fully in either language and a language switch re-localizes every line.
 *
 * The session log carries no HP totals (concealed monster HP must never leak), so the
 * "(4/12 HP)" readout is appended only when the caller passes it — the caller decides
 * who may see it.
 */

import type { PlayEvent } from "@/lib/session-log";
import type { LocText } from "@/lib/loc-text";
import type { ConcentrationRef } from "@/types/ids";
import type { EncounterOutcome } from "@/types/combat-chronicle";
import { localizePlayEvent } from "@/lib/views/session-report-view";

/** The i18next translator shape this presenter needs (structural, so no react-i18next
 *  import — the hook injects the real `t`). */
export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

/** Resolve a combatant id (`pc-<uid>` / `monster-<n>`) to its display name. Injected by
 *  the UI (which owns the fallback for an id no longer at the table). */
export type ResolveCombatantName = (combatantId: string) => string;
export type ResolveConditionName = (conditionId: string) => string;
export type ResolveActionName = (action: LocText) => string;

export interface FeedNames {
  name: ResolveCombatantName;
  condition: ResolveConditionName;
  action: ResolveActionName;
  spell: (ref: ConcentrationRef) => string;
  /** A status source id's display name (a feature, spell or item). */
  source?: (sourceId: string) => string;
}

/** The minimum a combatant row needs to be ranked as a candidate attacker. */
interface AttackerCandidate {
  id: string;
  kind: "pc" | "monster";
  side?: "ally" | "enemy";
}

const sideOf = (c: AttackerCandidate): "ally" | "enemy" =>
  c.kind === "pc" ? "ally" : (c.side ?? "enemy");

/**
 * Order the "Who struck?" candidates for a hit on `targetId`: the likely attacker
 * (`preselect`) first, then the target's opponents in roster order (`primary`); the
 * target's own side goes behind "More…" (`more`). The target is never offered. An
 * unknown target puts everyone in front.
 */
export function rankAttackers<T extends AttackerCandidate>(
  rows: ReadonlyArray<T>,
  targetId: string | null,
  preselect: string | null
): { primary: T[]; more: T[] } {
  const target = rows.find((r) => r.id === targetId);
  const lead = rows.find((r) => r.id === preselect && r !== target);
  const rest = rows.filter((r) => r !== target && r !== lead);
  const front = target ? rest.filter((r) => sideOf(r) !== sideOf(target)) : rest;
  const more = target ? rest.filter((r) => sideOf(r) === sideOf(target)) : [];
  return { primary: lead ? [lead, ...front] : front, more };
}

/** `["A","B","C"]` → "A, B and C" / "A, B e C". */
function joinLocalizedList(parts: readonly string[], t: TranslateFn): string {
  const [first, ...rest] = parts;
  if (first === undefined) return "";
  if (rest.length === 0) return first;
  const last = rest[rest.length - 1];
  const head = [first, ...rest.slice(0, -1)].join(", ");
  return `${head} ${t("common.and")} ${last}`;
}

/** One feed line. `hp` is the target's HP after the beat, when the viewer may see it. */
export function localizeFeedEvent(
  event: PlayEvent,
  t: TranslateFn,
  names: FeedNames,
  hp?: { current: number; max: number } | null
): string {
  const name = (id: string | undefined): string =>
    id === undefined ? t("combatChronicle.someone") : names.name(id);
  const action =
    "source" in event && event.source ? { action: names.action(event.source) } : null;
  const readout = (line: string): string =>
    hp ? `${line} ${t("combatChronicle.hpReadout", { ...hp })}` : line;

  switch (event.kind) {
    case "damage":
      return readout(
        event.actor
          ? t(action ? "combatChronicle.damageByAction" : "combatChronicle.damageBy", {
              attacker: name(event.actor),
              target: name(event.target),
              amount: event.amount,
              ...action,
            })
          : t("combatChronicle.damage", {
              target: name(event.target),
              amount: event.amount,
            })
      );
    case "heal":
      return readout(
        event.actor
          ? t(action ? "combatChronicle.healByAction" : "combatChronicle.healBy", {
              actor: name(event.actor),
              target: name(event.target),
              amount: event.amount,
              ...action,
            })
          : t("combatChronicle.heal", {
              target: name(event.target),
              amount: event.amount,
            })
      );
    case "action":
      if (event.outcome === "miss" && event.targets?.length) {
        return t(action ? "combatChronicle.missByAction" : "combatChronicle.missBy", {
          attacker: name(event.actor),
          target: joinLocalizedList(event.targets.map(name), t),
          ...action,
        });
      }
      break;
    case "condition":
      return t(
        event.gained ? "combatChronicle.conditionGain" : "combatChronicle.conditionLoss",
        {
          target: name(event.target),
          condition: names.condition(event.conditionId),
        }
      );
    case "down":
      return t("combatChronicle.down", { target: name(event.target) });
    case "stabilized":
      if (!event.actor) break;
      return t(
        action ? "combatChronicle.stabilizedByAction" : "combatChronicle.stabilizedBy",
        {
          actor: name(event.actor),
          target: name(event.target),
          ...action,
        }
      );
    case "resource-grant":
      return event.resource === "heroic-inspiration"
        ? t("combatChronicle.heroicInspirationGrant", {
            actor: name(event.actor),
            target: name(event.target),
          })
        : t("combatChronicle.bardicInspirationGrant", {
            actor: name(event.actor),
            target: name(event.target),
            value: event.value ?? "",
          });
    default:
      break;
  }
  return (
    localizePlayEvent(event, t, name, {
      pc: (id) => names.name(id),
      condition: names.condition,
      action: names.action,
      spell: names.spell,
      source: names.source,
    }) ?? ""
  );
}

/**
 * The markdown `## chapter` the DM appends to the Chronicle book at the end of a fight:
 * the title, the DM's note, each round's lines under a bold round marker, then the
 * outcome. `lines` are already localized and already the kept set, in feed order.
 */
export function buildEncounterChapter(
  args: {
    title: string;
    note: string;
    lines: ReadonlyArray<{ round?: number; text: string }>;
    outcome: EncounterOutcome;
  },
  t: TranslateFn
): string {
  const out: string[] = [`## ${args.title.trim()}`, ""];
  const note = args.note.trim();
  if (note) out.push(note, "");
  let currentRound: number | undefined | null = null;
  for (const line of args.lines) {
    if (line.round !== currentRound) {
      currentRound = line.round;
      if (out[out.length - 1] !== "") out.push("");
      if (currentRound !== undefined)
        out.push(`**${t("combatChronicle.round", { n: currentRound })}**`, "");
    }
    out.push(`- ${line.text}`);
  }
  out.push(
    "",
    `_${t(args.outcome === "victory" ? "combatChronicle.outcomeVictory" : "combatChronicle.outcomeEnded")}_`
  );
  return out.join("\n");
}
