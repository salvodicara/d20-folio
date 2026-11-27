/**
 * Guard: every Grant kind reaches the one Grant compiler (`compileGrant`).
 *
 * The kinds come from the Grant schema itself (`GRANT_SCHEMA.variants`), never from a
 * hand-kept list, so a new kind is seen the moment it is added to the schema. A kind
 * is "compiled" when `compileGrant` has a case for it (only its `default` returns
 * `null`).
 *
 * `NOT_COMPILED_YET` lists the kinds that still go through bespoke readers today.
 * The list only shrinks: the test asserts it is EXACTLY the set of uncompiled kinds,
 * so it fails when
 * - a new kind is added without a compiler case (add the case, not an entry here);
 * - a listed kind gains a compiler case (remove its entry);
 * - a listed kind no longer exists in the schema.
 */
import { describe, expect, it } from "vitest";

import { GRANT_SCHEMA, type Grant } from "@/lib/grant-schema";
import { compileGrant } from "@/lib/rules";

type GrantKind = Grant["type"];

/**
 * Kinds without a compiler case today (2026-11-27: 98 of 161). Each one is still read by
 * bespoke code (`AggregatedGrants` fields, choice collectors, actions, resources,
 * statuses). This list may only shrink: never add a kind here, give it a case in
 * `compileGrant` instead. A trailing comment says why a classified kind is still here:
 * `grammar` (today's Rule cannot hold its value), `context` (it needs more than the
 * grant), `per-item`, or `active` (an Activity, not a passive Rule).
 */
const NOT_COMPILED_YET = [
  "ability-check-bonus",
  "ac-formula", // grammar: a candidate formula record, highest wins (#1431)
  "action-outcome-rider",
  "advantage-on",
  "always-prepared-spell",
  "at-will-cast-spell",
  "at-zero-hp-interrupt",
  "aura",
  "cantrip-damage-bonus",
  "cantrip-effect-rider",
  "cantrip-range-bonus",
  "choice-ability-score",
  "choice-cantrip",
  "choice-expertise",
  "choice-feat",
  "choice-grant-bundle",
  "choice-language",
  "choice-resistance",
  "choice-skill-or-tool-proficiency",
  "choice-skill-proficiency",
  "choice-spell",
  "choice-tool-proficiency",
  "companion-mod",
  "component-waiver",
  "concentration-damage-proof",
  "copy-to-2nd-target",
  "cunning-strike-option",
  "d20-reroll",
  "damage-absorb-pool",
  "damage-die-modifier",
  "damage-die-reduction",
  "damage-penetration",
  "damage-retaliation",
  "damage-rider",
  "damage-transfer",
  "defense-note", // grammar: prose per grant (#1431)
  "disadvantage-on",
  "ends-concentration",
  "extra-action",
  "familiar-enhancement",
  "familiar-forms",
  "flat-damage-reduction", // grammar: a proficiency-bonus amount on a type list (#1431)
  "form-attack",
  "form-casting",
  "free-cast-from-list",
  "free-cast-spell",
  "granted-action",
  "heal-bonus",
  "hit-die-floor", // grammar: a paired floor-below and floor-to (#1431)
  "hp-flat", // context: the cast level or the world's exact delta (#1431)
  "incoming-attack-advantage",
  "incoming-attack-disadvantage",
  "incoming-damage-scale", // active: exists only under a lit toggle (#1431)
  "initiative-tracker-topup",
  "item-bound-bonus", // per-item: rides only its own weapon (#1431)
  "item-bound-damage-rider",
  "manifested-weapon",
  "maximize-spell-healing",
  "medium-armor-dex-cap", // grammar: a paired cap and minimum DEX (#1431)
  "metamagic-per-spell",
  "on-crit-movement-rider",
  "pact-weapon",
  "pact-weapon-rider",
  "permanent-ability-increase", // active: a one-time write when the book is studied (#1431)
  "regen-at-turn-start",
  "replace-attack-with-cast",
  "resource",
  "resource-conversion",
  "rest-expertise",
  "ritual-casting",
  "ritual-casting-any",
  "roll-die-adjustment",
  "roll-floor",
  "round1-damage-double",
  "save-damage-rule",
  "scoped-extra-spell-slot",
  "skill-ability-option",
  "self-heal-on-other",
  "spell-damage-bonus",
  "spell-damage-outcome",
  "spell-damage-type-override",
  "spell-die-augment",
  "spell-slot-tracker-recovery",
  "state-condition",
  "temp-hp",
  "tracker-alt-recovery",
  "trigger",
  "unarmed-strike-die", // grammar: a record (die, damage type, abilities) (#1431)
  "upkeep-waiver",
  "weapon-attack-ability", // grammar: a record (scope, magic only, die upgrade) (#1431)
  "weapon-attack-bonus", // context: the breakdown marks its toggle (#1431)
  "weapon-attack-cantrip",
  "weapon-binding",
  "weapon-bonus-attack",
  "weapon-damage-bonus", // context: the toggle marker, a proficiency-bonus amount (#1431)
  "weapon-reach-bonus", // grammar: a record (which weapons, extra masteries) (#1431)
  "while-active",
  "zero-hp-floor",
] as const satisfies readonly GrantKind[];

const SCHEMA_KINDS = Object.keys(GRANT_SCHEMA.variants) as GrantKind[];

/** A bare stub of the kind: enough to reach its `case`, since only `default` is null. */
function hasCompilerCase(kind: GrantKind): boolean {
  return compileGrant({ type: kind } as unknown as Grant) !== null;
}

describe("Grant compiler coverage", () => {
  it("reads the kinds from the schema", () => {
    expect(SCHEMA_KINDS.length).toBeGreaterThan(100);
    expect(new Set(SCHEMA_KINDS).size).toBe(SCHEMA_KINDS.length);
  });

  it("compiles every kind except the shrinking NOT_COMPILED_YET list", () => {
    const uncompiled = SCHEMA_KINDS.filter((kind) => !hasCompilerCase(kind)).sort();
    expect(uncompiled).toEqual([...NOT_COMPILED_YET].sort());
  });
});
