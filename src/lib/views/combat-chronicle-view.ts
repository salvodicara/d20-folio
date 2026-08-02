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
    case "attack-miss":
      return t("combatChronicle.missBy", {
        attacker: resolveName(event.attackerId),
        target: resolveName(event.targetId),
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
        return t("combatChronicle.multiHit", {
          attacker: resolveName(event.attackerId),
          targets: struck,
        });
      }
      const named = joinLocalizedList(event.targetIds.map(resolveName), t);
      return t("combatChronicle.multiMiss", {
        attacker: resolveName(event.attackerId),
        targets: named,
      });
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
        return t("combatChronicle.saveHitResisted", {
          attacker: resolveName(event.attackerId),
          targets: damaged,
          resisted,
        });
      }
      if (damaged) {
        return t("combatChronicle.saveHit", {
          attacker: resolveName(event.attackerId),
          targets: damaged,
        });
      }
      // Only reachable if every declared target resisted (reconcile emits this line
      // only once ≥1 target took a drop, so in practice `damaged` is non-empty).
      return t("combatChronicle.saveAllResisted", {
        attacker: resolveName(event.attackerId),
        targets: resisted,
      });
    }
    case "down":
      return t("combatChronicle.down", { target: resolveName(event.targetId) });
    case "condition-gain":
      // Credited to a caster when the reconciliation layer matched it to that action's
      // declared rider (Topple → Prone, a spell rider); a bare DM-booked condition has
      // no attacker.
      return event.attackerId
        ? t("combatChronicle.conditionGainBy", {
            attacker: resolveName(event.attackerId),
            target: resolveName(event.targetId),
            condition: resolveCondition(event.conditionId),
          })
        : t("combatChronicle.conditionGain", {
            target: resolveName(event.targetId),
            condition: resolveCondition(event.conditionId),
          });
    case "condition-loss":
      return t("combatChronicle.conditionLoss", {
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
