/**
 * combat-chronicle presenter — the campaign-chronicle localization seam (the
 * table-wide sibling of `combat-log-view.ts`).
 *
 * The DM's tracker emits structured {@link CombatChronicleEvent}s (ids + numbers);
 * this presenter resolves each to its prose LINE at render — the i18n template via
 * `kind`, and the combatant / condition ids via injected name resolvers. Pure
 * presentation glue: `t` + the resolvers are passed in, so this module imports no
 * React, no store, no i18next (`lib/views/` is the ONLY engine-side layer permitted
 * to localize, and even here `t`/name-resolvers are injected). The SAME stored feed
 * therefore renders fully in the active language and a language switch re-localizes
 * every line.
 *
 * The end-of-fight {@link buildChronicleChapter} assembles the kept lines into ONE
 * markdown `## chapter` (round-grouped, the DM's narrative note on top, the outcome
 * below) — the text the DM appends to the Chronicle at close.
 */

import type { CombatChronicleEvent, EncounterOutcome } from "@/types/combat-chronicle";

/** The i18next translator shape this presenter needs (structural, so no react-i18next
 *  import — the hook injects the real `t`). */
export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

/** Resolve a combatant id (`pc-<uid>` / `monster-<n>`) to its display name — the PC
 *  hero name or the monster's typed name. Injected by the UI (which owns the fallback
 *  for an id no longer at the table). */
export type ResolveCombatantName = (combatantId: string) => string;

/** Resolve a stable condition id to its localized name. Injected by the UI. */
export type ResolveConditionName = (conditionId: string) => string;

/**
 * Whether a damage event's attacker is still PENDING attribution — the feed shows the
 * one-tap picker for exactly these (unattributed AND not yet skipped). The app NEVER
 * guesses: attribution is set only by an explicit tap.
 */
export function chronicleNeedsAttribution(event: CombatChronicleEvent): boolean {
  return (
    event.kind === "hp-damage" &&
    event.attackerId === undefined &&
    event.attackerSkipped !== true
  );
}

/**
 * Localize one {@link CombatChronicleEvent} to its display LINE. Exhaustive over every
 * `kind` (a new kind is a compile error via the `never`-typed default).
 */
export function localizeChronicleEvent(
  event: CombatChronicleEvent,
  t: TranslateFn,
  resolveName: ResolveCombatantName,
  resolveCondition: ResolveConditionName
): string {
  switch (event.kind) {
    case "hp-damage":
      return event.attackerId
        ? t("combatChronicle.damageBy", {
            attacker: resolveName(event.attackerId),
            target: resolveName(event.targetId),
            amount: event.amount,
            current: event.current,
            max: event.max,
          })
        : t("combatChronicle.damage", {
            target: resolveName(event.targetId),
            amount: event.amount,
            current: event.current,
            max: event.max,
          });
    case "hp-heal":
      return t("combatChronicle.heal", {
        target: resolveName(event.targetId),
        amount: event.amount,
        current: event.current,
        max: event.max,
      });
    case "down":
      return t("combatChronicle.down", { target: resolveName(event.targetId) });
    case "condition-gain":
      return t("combatChronicle.conditionGain", {
        target: resolveName(event.targetId),
        condition: resolveCondition(event.conditionId),
      });
    case "condition-loss":
      return t("combatChronicle.conditionLoss", {
        target: resolveName(event.targetId),
        condition: resolveCondition(event.conditionId),
      });
    case "attack-miss":
      return t("combatChronicle.miss", {
        attacker: resolveName(event.attackerId),
        target: resolveName(event.targetId),
      });
    case "turn-pass":
      return t("combatChronicle.turnPass", { actor: resolveName(event.actorId) });
  }
}

/** A fully render-ready feed row: its localized line + the pending-attribution flag
 *  (so the live feed shows the one-tap picker on exactly the unattributed hits). */
export interface ChronicleFeedRow {
  id: string;
  round: number;
  text: string;
  kind: CombatChronicleEvent["kind"];
  /** This damage event still needs a "who" (the one-tap picker shows). */
  needsAttribution: boolean;
}

/** Localize a whole feed to render-ready rows (one presenter call per event). */
export function localizeChronicleFeed(
  events: ReadonlyArray<CombatChronicleEvent>,
  t: TranslateFn,
  resolveName: ResolveCombatantName,
  resolveCondition: ResolveConditionName
): ChronicleFeedRow[] {
  return events.map((event) => ({
    id: event.id,
    round: event.round,
    kind: event.kind,
    text: localizeChronicleEvent(event, t, resolveName, resolveCondition),
    needsAttribution: chronicleNeedsAttribution(event),
  }));
}

/** The localized outcome line (`victory` / neutral `ended`). */
export function chronicleOutcomeLine(outcome: EncounterOutcome, t: TranslateFn): string {
  return t(
    outcome === "victory"
      ? "combatChronicle.outcomeVictory"
      : "combatChronicle.outcomeEnded"
  );
}

/**
 * Assemble the KEPT events into ONE markdown `## chapter` — the text the DM appends to
 * the Chronicle at close. Structure: the `## {title}` heading, the DM's optional
 * narrative note, then each round's beats grouped under a bold `**Round N**` marker,
 * then the italic outcome line. `events` are ALREADY the kept set (the entry editor's
 * deletions applied), in feed order. Pure — every line localized through the injected
 * `t` + resolvers.
 */
export function buildChronicleChapter(
  args: {
    title: string;
    note: string;
    events: ReadonlyArray<CombatChronicleEvent>;
    outcome: EncounterOutcome;
  },
  t: TranslateFn,
  resolveName: ResolveCombatantName,
  resolveCondition: ResolveConditionName
): string {
  const lines: string[] = [`## ${args.title.trim()}`, ""];
  const note = args.note.trim();
  if (note) {
    lines.push(note, "");
  }
  let currentRound: number | null = null;
  for (const event of args.events) {
    if (event.round !== currentRound) {
      currentRound = event.round;
      if (lines[lines.length - 1] !== "") lines.push("");
      lines.push(`**${t("combatChronicle.round", { n: currentRound })}**`, "");
    }
    lines.push(`- ${localizeChronicleEvent(event, t, resolveName, resolveCondition)}`);
  }
  lines.push("", `_${chronicleOutcomeLine(args.outcome, t)}_`);
  return lines.join("\n");
}
