/**
 * Prototype catalogue — mechanics authored purely as data for the P2 vertical.
 * Nothing in `src/lib/combat` names any of these ids; they reach the engine only through
 * `buildCatalogue`. Spec: docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md.
 */
import type { Mechanic } from "@/lib/combat/mechanic";

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

/** Movement every creature has: no action/bonus/reaction cost, gated to your own turn, budgeted
 *  against speed by the `move` step itself. */
export const move: Mechanic = {
  schema: 1,
  id: "core:move",
  source: "srd",
  active: [
    {
      id: "move",
      trigger: { kind: "invocation", economy: "free" },
      inputs: [{ id: "to", kind: "position" }],
      steps: [{ id: "step", kind: "move", to: "to" }],
    },
  ],
};

export const PROTOTYPE_MECHANICS: readonly Mechanic[] = [
  shortsword,
  longbow,
  goblinScimitar,
  huntersMark,
  shield,
  giggle,
  move,
];
