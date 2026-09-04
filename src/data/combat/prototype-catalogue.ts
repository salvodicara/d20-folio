/**
 * Prototype catalogue — the test-only mechanics authored purely as data for the P2 vertical.
 * The ordinary actions every creature has live in `core-catalogue.ts` and are re-exported here
 * through `PROTOTYPE_MECHANICS` so a test catalogue always resolves `core:move` and friends.
 * Nothing in `src/lib/combat` names any of these ids; they reach the engine only through
 * `buildCatalogue`. Spec: docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md.
 */
import type { Mechanic } from "@/lib/combat/mechanic";
import type { MonsterStatBlock, SrdSpellData } from "@/data/types";
import { monsterMechanics } from "@/lib/combat/monster-adapter";
import { SRD_SPELLS_LEVEL3 } from "@/data/spells/level3";
import { CORE_MECHANICS } from "./core-catalogue";

/** The spell's PRINTED area, read from the SRD row rather than copied into this
 *  file: `SrdSpellData.areaShape` is the one home of "how big is a Fireball"
 *  (`tests/unit/spell-area-shape.guard.test.ts` pins it), and the projection
 *  compiles the same datum, so the prototype and a real cast can never drift. */
function srdAreaShape(id: string): NonNullable<SrdSpellData["areaShape"]> {
  const shape = SRD_SPELLS_LEVEL3.find((spell) => spell.id === id)?.areaShape;
  if (!shape) throw new Error(`prototype-catalogue: ${id} declares no areaShape`);
  return shape;
}

/** A ranger's longbow: Attack action, one visible target, d20 + DEX + PB vs AC, 1d8 piercing. */
export const longbow: Mechanic = {
  schema: 1,
  id: "srd:weapon:longbow",
  source: "srd",
  active: [
    {
      id: "attack",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "attack" }],
      targets: {
        count: 1,
        eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
      },
      inputs: [
        { id: "roll", kind: "d20", for: "attack" },
        { id: "damage", kind: "dice", formula: "1d8" },
      ],
      steps: [
        {
          id: "swing",
          kind: "attack",
          roll: "roll",
          bonus: { sum: [{ ability: "DEX" }, { stat: "proficiency" }] },
          damage: [{ dice: "damage", type: "piercing" }],
        },
      ],
    },
  ],
};

/** A goblin's scimitar, as the monster adapter would emit it: +4 to hit, 1d6 slashing. */
export const goblinScimitar: Mechanic = {
  schema: 1,
  id: "monster:goblin:scimitar",
  source: "monster",
  active: [
    {
      id: "attack",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "attack" }],
      targets: {
        count: 1,
        eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
      },
      inputs: [
        { id: "roll", kind: "d20", for: "attack" },
        { id: "damage", kind: "dice", formula: "1d6" },
      ],
      steps: [
        {
          id: "slash",
          kind: "attack",
          roll: "roll",
          bonus: 4,
          damage: [{ dice: "damage", type: "slashing" }],
        },
      ],
    },
  ],
};

/** Hunter's Mark: bonus action, slot 1+ with upcast durations, concentration, a per-target mark. */
export const huntersMark: Mechanic = {
  schema: 1,
  id: "srd:spell:hunters-mark",
  source: "srd",
  active: [
    {
      id: "cast",
      trigger: { kind: "invocation", economy: "bonus" },
      cost: [
        { kind: "turn", claim: "bonus" },
        { kind: "slot", level: 1, upcast: true },
        { kind: "concentration" },
      ],
      targets: {
        count: 1,
        eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
      },
      inputs: [],
      steps: [
        {
          id: "mark",
          kind: "effect-start",
          effect: {
            kind: "mark",
            to: "$target",
            concentration: true,
            lifetime: {
              kind: "seconds",
              remaining: { byLevel: { 1: 3600, 3: 28800, 5: 86400 } },
            },
            riders: [
              { dice: "1d6", type: "force", on: "weapon-hit", vs: { mark: "self" } },
            ],
            advantage: false,
          },
        },
      ],
    },
    {
      id: "move",
      trigger: {
        kind: "event",
        event: { kind: "hp-zero", of: { markedBy: "self" } },
        scope: "self",
        window: true,
      },
      cost: [{ kind: "turn", claim: "bonus" }],
      targets: {
        count: 1,
        eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
      },
      inputs: [],
      steps: [{ id: "move", kind: "move-mark", from: "$event.entity", to: "$target" }],
    },
  ],
};

/** Shield: reaction when attacked, +5 AC until the start of your next turn. */
export const shield: Mechanic = {
  schema: 1,
  id: "srd:spell:shield",
  source: "srd",
  active: [
    {
      id: "react",
      trigger: {
        kind: "event",
        event: { kind: "attack-declared", target: "self" },
        scope: "self",
        window: true,
      },
      cost: [
        { kind: "turn", claim: "reaction" },
        { kind: "slot", level: 1 },
      ],
      inputs: [],
      steps: [
        {
          id: "ward",
          kind: "effect-start",
          effect: {
            kind: "standing",
            to: "$self",
            acBonus: 5,
            lifetime: { kind: "turn-edge", entity: "$self", edge: "start" },
          },
        },
      ],
    },
  ],
};

/**
 * A save-gated concentration spell shaped like Hideous Laughter: WIS save negates;
 * on a failed save the target is prone and incapacitated while the caster concentrates.
 */
export const giggle: Mechanic = {
  schema: 1,
  id: "proto:spell:giggle",
  source: "homebrew",
  active: [
    {
      id: "cast",
      trigger: { kind: "invocation", economy: "action" },
      cost: [
        { kind: "turn", claim: "action" },
        { kind: "slot", level: 1 },
        { kind: "concentration" },
      ],
      targets: {
        count: 1,
        eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
      },
      inputs: [{ id: "save", kind: "d20", for: "save", ability: "WIS", perTarget: true }],
      steps: [
        {
          id: "resist",
          kind: "save",
          roll: "save",
          ability: "WIS",
          dc: "spell",
          onSuccess: "negate",
        },
        {
          id: "prone",
          kind: "condition",
          condition: "prone",
          to: "$target",
          lifetime: { kind: "manual" },
          concentration: true,
        },
        {
          id: "laughing",
          kind: "condition",
          condition: "incapacitated",
          to: "$target",
          lifetime: { kind: "manual" },
          concentration: true,
        },
      ],
    },
  ],
};

/** Fireball, at its base 3rd-level cast: the SRD sphere, DEX save for half, 8d6 fire.
 *  No upcast scaling for stage 3 (Marco's story is a beginner's first, base-level cast) — an
 *  upcast Fireball needs `Input.dice.formula` to grow a `byLevel` variant, deliberately out of
 *  scope until a story needs it. */
export const fireball: Mechanic = {
  schema: 1,
  id: "srd:spell:fireball",
  source: "srd",
  active: [
    {
      id: "cast",
      trigger: { kind: "invocation", economy: "action" },
      cost: [
        { kind: "turn", claim: "action" },
        { kind: "slot", level: 3 },
      ],
      targets: {
        count: "area",
        eligibility: { all: [] },
        area: {
          kind: "sphere",
          origin: "origin",
          radiusFt: srdAreaShape("fireball").sizeFt,
        },
      },
      inputs: [
        { id: "origin", kind: "position" },
        { id: "save", kind: "d20", for: "save", ability: "DEX", perTarget: true },
        { id: "damage", kind: "dice", formula: "8d6" },
      ],
      steps: [
        {
          id: "burn",
          kind: "save",
          roll: "save",
          ability: "DEX",
          dc: "spell",
          onSuccess: "half",
        },
        {
          id: "scorch",
          kind: "damage",
          parts: [{ dice: "damage", type: "fire" }],
          to: "$target",
        },
      ],
    },
  ],
};

/** A shortsword: a finesse melee attack plus the opportunity attack every melee wielder has. */
export const shortsword: Mechanic = {
  schema: 1,
  id: "srd:weapon:shortsword",
  source: "srd",
  active: [
    {
      id: "attack",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "attack" }],
      targets: {
        count: 1,
        eligibility: { relation: "adjacent", between: ["$self", "$target"] },
      },
      inputs: [
        { id: "roll", kind: "d20", for: "attack" },
        { id: "damage", kind: "dice", formula: "1d6" },
      ],
      steps: [
        {
          id: "stab",
          kind: "attack",
          roll: "roll",
          bonus: { sum: [{ ability: "DEX" }, { stat: "proficiency" }] },
          damage: [{ dice: "damage", type: "piercing" }],
        },
      ],
    },
    {
      id: "opportunity",
      trigger: {
        kind: "event",
        event: { kind: "entity-left-reach", of: "self" },
        scope: "self",
        window: true,
      },
      cost: [{ kind: "turn", claim: "reaction" }],
      targets: { count: 1, eligibility: { is: ["$target", "$event.entity"] } },
      inputs: [
        { id: "roll", kind: "d20", for: "attack" },
        { id: "damage", kind: "dice", formula: "1d6" },
      ],
      steps: [
        {
          id: "stab",
          kind: "attack",
          roll: "roll",
          bonus: { sum: [{ ability: "DEX" }, { stat: "proficiency" }] },
          damage: [{ dice: "damage", type: "piercing" }],
        },
      ],
    },
  ],
};

/** The real 2024 SRD Ogre (AC 11, HP 68, CR 2) — hand-copied from `src/data/monsters/n-p.ts`
 *  rather than imported, because that corpus is bundle-budget-guarded as lazy-only (its own
 *  header: "Nothing eager may import this module") and this catalogue is loaded eagerly by
 *  every combat test. Adapted through `monsterMechanics`, not hand-authored, so this is exactly
 *  what the real bestiary entry produces. Exported so `monster-adapter.test.ts` can prove the
 *  copy still equals the corpus entry — a test may import the corpus lazily; this module may not. */
export const ogreStatBlock: MonsterStatBlock = {
  id: "ogre",
  cr: 2,
  sizes: ["Large"],
  type: "giant",
  alignment: "chaotic-evil",
  ac: 11,
  hp: { average: 68, formula: "8d10+24" },
  speeds: { walk: 40 },
  abilityScores: { STR: 19, DEX: 8, CON: 16, INT: 5, WIS: 7, CHA: 7 },
  senses: { darkvisionFt: 60 },
  languages: { ids: ["common", "giant"] },
  gear: [{ id: "greatclub" }, { id: "javelin", qty: 3 }],
  actions: [
    {
      id: "greatclub",
      kind: "attack",
      attack: "melee",
      toHit: 6,
      reachFt: 5,
      damage: [{ dice: "2d8+4", damageType: "bludgeoning" }],
    },
    {
      id: "javelin",
      kind: "attack",
      attack: "melee-or-ranged",
      toHit: 6,
      reachFt: 5,
      rangeFt: { near: 30, far: 120 },
      damage: [{ dice: "2d6+4", damageType: "piercing" }],
    },
  ],
  source: "SRD",
};

export const ogre: Mechanic = monsterMechanics(ogreStatBlock);

/** A homebrew shortsword reskin for the golden replay's "the group's own custom weapon" case —
 *  a table-authored mechanic, not SRD; shape mirrors `shortsword` minus the opportunity-attack
 *  program (out of scope for this replay). */
export const homebrewBlade: Mechanic = {
  schema: 1,
  id: "homebrew:weapon:saras-blade",
  source: "homebrew",
  active: [
    {
      id: "attack",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "attack" }],
      targets: {
        count: 1,
        eligibility: { relation: "adjacent", between: ["$self", "$target"] },
      },
      inputs: [
        { id: "roll", kind: "d20", for: "attack" },
        { id: "damage", kind: "dice", formula: "1d6" },
      ],
      steps: [
        {
          id: "stab",
          kind: "attack",
          roll: "roll",
          bonus: { sum: [{ ability: "DEX" }, { stat: "proficiency" }] },
          damage: [{ dice: "damage", type: "slashing" }],
        },
      ],
    },
  ],
};

/** The test-only mechanics PLUS the `core:*` set every creature has (`core-catalogue.ts`) —
 *  one definition of `core:move`, so a test catalogue and a real table agree. */
export const PROTOTYPE_MECHANICS: readonly Mechanic[] = [
  shortsword,
  longbow,
  goblinScimitar,
  huntersMark,
  shield,
  giggle,
  fireball,
  ogre,
  homebrewBlade,
  ...CORE_MECHANICS,
];
