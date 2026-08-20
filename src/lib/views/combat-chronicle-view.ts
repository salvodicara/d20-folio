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
import type { LocText } from "@/lib/loc-text";

/** The i18next translator shape this presenter needs (structural, so no react-i18next
 *  import — the hook injects the real `t`). */
export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

/** Resolve a combatant id (`pc-<uid>` / `monster-<n>`) to its display name — the PC
 *  hero name or the monster's typed name. Injected by the UI (which owns the fallback
 *  for an id no longer at the table). */
export type ResolveCombatantName = (combatantId: string) => string;

/** Resolve a stable condition id to its localized name. Injected by the UI. */
export type ResolveConditionName = (conditionId: string) => string;
export type ResolveActionName = (action: LocText) => string;

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
 * Join a list of already-localized segments into a natural-language enumeration using
 * the locale's conjunction: `["A"]` → "A", `["A","B"]` → "A and B" / "A e B",
 * `["A","B","C"]` → "A, B and C" / "A, B e C". Pure — the conjunction word is the only
 * locale input (injected `t`), so the same list reads correctly in EN and IT. The
 * caller guarantees a non-empty list for a rendered line (an empty enumeration returns
 * the empty string rather than fabricating content).
 */
function joinLocalizedList(parts: readonly string[], t: TranslateFn): string {
  const [first, ...rest] = parts;
  if (first === undefined) return "";
  if (rest.length === 0) return first;
  const last = rest[rest.length - 1];
  const head = [first, ...rest.slice(0, -1)].join(", ");
  return `${head} ${t("common.and")} ${last}`;
}

/**
 * Localize one {@link CombatChronicleEvent} to its display LINE. Exhaustive over every
 * `kind` — the `string` return type makes a missing case a compile error (a fall-through
 * would return `undefined`), so a new kind cannot silently render blank.
 */
export function localizeChronicleEvent(
  event: CombatChronicleEvent,
  t: TranslateFn,
  resolveName: ResolveCombatantName,
  resolveCondition: ResolveConditionName,
  resolveAction: ResolveActionName = () => ""
): string {
  switch (event.kind) {
    case "hp-damage":
      return event.attackerId
        ? t(
            event.action ? "combatChronicle.damageByAction" : "combatChronicle.damageBy",
            {
              attacker: resolveName(event.attackerId),
              target: resolveName(event.targetId),
              amount: event.amount,
              current: event.current,
              max: event.max,
              ...(event.action ? { action: resolveAction(event.action) } : {}),
            }
          )
        : t("combatChronicle.damage", {
            target: resolveName(event.targetId),
            amount: event.amount,
            current: event.current,
            max: event.max,
          });
    case "hp-heal":
      return event.actorId
        ? t(event.action ? "combatChronicle.healByAction" : "combatChronicle.healBy", {
            actor: resolveName(event.actorId),
            target: resolveName(event.targetId),
            amount: event.amount,
            current: event.current,
            max: event.max,
            ...(event.action ? { action: resolveAction(event.action) } : {}),
          })
        : t("combatChronicle.heal", {
            target: resolveName(event.targetId),
            amount: event.amount,
            current: event.current,
            max: event.max,
          });
    case "stabilized":
      return t(
        event.action
          ? "combatChronicle.stabilizedByAction"
          : "combatChronicle.stabilizedBy",
        {
          actor: resolveName(event.actorId),
          target: resolveName(event.targetId),
          ...(event.action ? { action: resolveAction(event.action) } : {}),
        }
      );
    case "resource-grant":
      return event.resource === "heroic-inspiration"
        ? t("combatChronicle.heroicInspirationGrant", {
            actor: resolveName(event.actorId),
            target: resolveName(event.targetId),
            ...(event.action ? { action: resolveAction(event.action) } : {}),
          })
        : t("combatChronicle.bardicInspirationGrant", {
            actor: resolveName(event.actorId),
            target: resolveName(event.targetId),
            value: event.value ?? "",
            ...(event.action ? { action: resolveAction(event.action) } : {}),
          });
    case "attack-miss":
      return t(event.action ? "combatChronicle.missByAction" : "combatChronicle.missBy", {
        attacker: resolveName(event.attackerId),
        target: resolveName(event.targetId),
        ...(event.action ? { action: resolveAction(event.action) } : {}),
      });
    case "attack-multi": {
      // A HIT line (≥1 real drop) lists the struck targets with their DM amounts; an
      // empty `amounts` is the MISS line over the full declared set. Never fabricates a
      // per-target number — an un-dropped target is simply absent from `amounts`.
      if (event.amounts.length > 0) {
        const struck = joinLocalizedList(
          event.amounts.map((a) =>
            t("combatChronicle.multiTarget", {
              target: resolveName(a.targetId),
              amount: a.amount,
            })
          ),
          t
        );
        return t(
          event.action ? "combatChronicle.multiHitAction" : "combatChronicle.multiHit",
          {
            attacker: resolveName(event.attackerId),
            targets: struck,
            ...(event.action ? { action: resolveAction(event.action) } : {}),
          }
        );
      }
      const named = joinLocalizedList(event.targetIds.map(resolveName), t);
      return t(
        event.action ? "combatChronicle.multiMissAction" : "combatChronicle.multiMiss",
        {
          attacker: resolveName(event.attackerId),
          targets: named,
          ...(event.action ? { action: resolveAction(event.action) } : {}),
        }
      );
    }
    case "attack-save": {
      // An area save-for-half spell: the damaged targets carry the DM's real number
      // (half or full), the resisted targets took no damage (a full save). Never
      // fabricates a number — an un-dropped target only ever appears in `resisted`.
      const damaged =
        event.amounts.length > 0
          ? joinLocalizedList(
              event.amounts.map((a) =>
                t("combatChronicle.multiTarget", {
                  target: resolveName(a.targetId),
                  amount: a.amount,
                })
              ),
              t
            )
          : "";
      const resisted =
        event.resisted.length > 0
          ? joinLocalizedList(event.resisted.map(resolveName), t)
          : "";
      if (damaged && resisted) {
        return t(
          event.action
            ? "combatChronicle.saveHitResistedAction"
            : "combatChronicle.saveHitResisted",
          {
            attacker: resolveName(event.attackerId),
            targets: damaged,
            resisted,
            ...(event.action ? { action: resolveAction(event.action) } : {}),
          }
        );
      }
      if (damaged) {
        return t(
          event.action ? "combatChronicle.multiHitAction" : "combatChronicle.saveHit",
          {
            attacker: resolveName(event.attackerId),
            targets: damaged,
            ...(event.action ? { action: resolveAction(event.action) } : {}),
          }
        );
      }
      // Only reachable if every declared target resisted (reconcile emits this line
      // only once ≥1 target took a drop, so in practice `damaged` is non-empty).
      return t(
        event.action
          ? "combatChronicle.saveAllResistedAction"
          : "combatChronicle.saveAllResisted",
        {
          attacker: resolveName(event.attackerId),
          targets: resisted,
          ...(event.action ? { action: resolveAction(event.action) } : {}),
        }
      );
    }
    case "down":
      return t("combatChronicle.down", { target: resolveName(event.targetId) });
    case "condition-gain":
      // Credited to a caster when the reconciliation layer matched it to that action's
      // declared rider (Topple → Prone, a spell rider); a bare DM-booked condition has
      // no attacker.
      return event.attackerId
        ? t(
            event.action
              ? "combatChronicle.conditionGainByAction"
              : "combatChronicle.conditionGainBy",
            {
              attacker: resolveName(event.attackerId),
              target: resolveName(event.targetId),
              condition: resolveCondition(event.conditionId),
              ...(event.action ? { action: resolveAction(event.action) } : {}),
            }
          )
        : t("combatChronicle.conditionGain", {
            target: resolveName(event.targetId),
            condition: resolveCondition(event.conditionId),
          });
    case "condition-loss":
      return event.actorId
        ? t(
            event.action
              ? "combatChronicle.conditionLossByAction"
              : "combatChronicle.conditionLossBy",
            {
              actor: resolveName(event.actorId),
              target: resolveName(event.targetId),
              condition: resolveCondition(event.conditionId),
              ...(event.action ? { action: resolveAction(event.action) } : {}),
            }
          )
        : t("combatChronicle.conditionLoss", {
            target: resolveName(event.targetId),
            condition: resolveCondition(event.conditionId),
          });
  }
}

/** The localized outcome line (`victory` / neutral `ended`). */
function chronicleOutcomeLine(outcome: EncounterOutcome, t: TranslateFn): string {
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
  resolveCondition: ResolveConditionName,
  resolveAction: ResolveActionName = () => ""
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
    lines.push(
      `- ${localizeChronicleEvent(event, t, resolveName, resolveCondition, resolveAction)}`
    );
  }
  lines.push("", `_${chronicleOutcomeLine(args.outcome, t)}_`);
  return lines.join("\n");
}
