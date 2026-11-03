import type { SrdSpellData } from "../types";
import { timedSpellDuration } from "./duration";

export const SRD_SPELLS_LEVEL9: SrdSpellData[] = [
  {
    id: "astral-projection",
    level: 9,
    school: "necromancy",
    classes: ["cleric", "warlock", "wizard"],
    castingTime: "1 hour",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 1000,
      consumed: true,
    },
    concentration: false,
    duration: { kind: "until-dispelled" },
    source: "SRD",
  },
  {
    id: "foresight",
    level: 9,
    school: "divination",
    classes: ["bard", "druid", "warlock", "wizard"],
    castingTime: "1 minute",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
    },
    concentration: false,
    duration: { kind: "hours", amount: 8 },
    targeting: { affinity: "ally", maxTargets: 1 },
    grants: [
      // PROSE-SWEPT 2026-06-10 — Advantage on D20 Tests for the duration
      // (attackers' Disadvantage is an enemy-roll effect — descriptive).
      {
        type: "while-active",
        activeKey: "spell-foresight",
        duration: timedSpellDuration(480),
        recipient: "selected",
        grants: [
          { type: "advantage-on", rollType: "check", vs: "foresight" },
          { type: "advantage-on", rollType: "save", vs: "foresight" },
          { type: "advantage-on", rollType: "attack", vs: "foresight", scope: "all" },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "gate",
    level: 9,
    school: "conjuration",
    classes: ["cleric", "sorcerer", "warlock", "wizard"],
    castingTime: "action",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 5000,
    },
    concentration: true,
    duration: { kind: "minutes", amount: 1 },
    // Any creature named through the portal.
    bestiaryPick: {},
    source: "SRD",
  },
  {
    id: "imprisonment",
    level: 9,
    school: "abjuration",
    classes: ["warlock", "wizard"],
    castingTime: "1 minute",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 5000,
    },
    concentration: false,
    duration: { kind: "until-dispelled" },
    saveAbility: "WIS",
    source: "SRD",
  },
  {
    id: "mass-heal",
    level: 9,
    school: "abjuration",
    classes: ["cleric"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: false,
    duration: { kind: "instantaneous" },
    instantaneous: true,
    healDice: "700",
    effectTag: "heal",
    conditionRemoval: { options: ["blinded", "deafened"] },
    targeting: { affinity: "ally" },
    healingPool: 700,
    source: "SRD",
  },
  {
    id: "meteor-swarm",
    level: 9,
    school: "evocation",
    classes: ["sorcerer", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: false,
    duration: { kind: "instantaneous" },
    instantaneous: true,
    // 2024 (spell:meteor-swarm): 20d6 Fire + 20d6 Bludgeoning on a DEX save (40d6
    // total). No upcast scaling (a 9th-level spell).
    damageType: "fire",
    damageDice: "20d6",
    secondaryDamage: { dice: "20d6", damageType: "bludgeoning" },
    saveAbility: "DEX",
    area: true,
    damageOnSave: "half",
    source: "SRD",
  },
  {
    id: "power-word-kill",
    level: 9,
    school: "enchantment",
    classes: ["bard", "sorcerer", "warlock", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: false, m: false },
    concentration: false,
    duration: { kind: "instantaneous" },
    instantaneous: true,
    // SRD 5.2.1: "If the target has 100 Hit Points or fewer, it dies. Otherwise, it
    // takes 12d12 Psychic damage."
    targeting: { affinity: "enemy", maxTargets: 1 },
    damageType: "psychic",
    damageDice: "12d12",
    hitPointThreshold: { max: 100, atOrBelow: "dies" },
    source: "SRD",
  },
  {
    id: "prismatic-wall",
    // The canonical-runtime authored program: the
    // cast raises the ten-minute wall; seven layer registers hold each sheet's
    // state (0 active, 1 destroyed). Table-declared pulses adjudicate the wall:
    // "proximity" (CON save or blinded for a minute), "cross-<color>" per
    // layer (DEX save; red-blue deal 12d6 of their element half-on-save,
    // indigo restrains, violet blinds), "violet-fate" (the next-turn WIS save
    // — sight returns, failure is a plane transfer), and "destroy-<color>"
    // events that mark a layer destroyed in strict front-to-back order. The
    // destroy qualifications (damage thresholds, daylight, dispel) and the
    // indigo petrification save-series stay table-adjudicated — the latter
    // needs per-target counters the program vocabulary does not have.
    level: 9,
    school: "abjuration",
    classes: ["bard", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: false,
    duration: { kind: "minutes", amount: 10 },
    // Five damaging layers (red/orange/yellow/green/blue); indigo & violet are
    // condition layers. Passing through deals each layer's type — simultaneous.
    damageTypes: ["fire", "acid", "lightning", "poison", "cold"],
    damageDice: "12d6",
    saveAbility: "CON",
    source: "SRD",
  },
  {
    id: "shapechange",
    formRule: {
      // You keep INT, WIS, CHA, Hit Points and Hit Point Dice; Temporary HP from the
      // first form only, and running out of them does not end the spell.
      pool: "bestiary",
      keepsMind: true,
      reshift: true,
      endsWithoutTempHp: false,
      excludedTypes: ["construct", "undead"],
      selfOnly: true,
    },
    level: 9,
    school: "transmutation",
    classes: ["druid", "wizard"],
    castingTime: "action",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 1500,
    },
    concentration: true,
    duration: { kind: "hours", amount: 1 },
    source: "SRD",
  },
  {
    id: "time-stop",
    level: 9,
    school: "transmutation",
    classes: ["sorcerer", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: false, m: false },
    concentration: false,
    duration: { kind: "instantaneous" },
    instantaneous: true,
    source: "SRD",
  },
  {
    id: "true-resurrection",
    level: 9,
    school: "necromancy",
    classes: ["cleric", "druid"],
    castingTime: "1 hour",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
      costGp: 25000,
      consumed: true,
    },
    concentration: false,
    duration: { kind: "instantaneous" },
    instantaneous: true,
    // SRD 5.2.1: "The creature is revived with all its Hit Points."
    revives: { hitPoints: "all" },
    source: "SRD",
  },
  {
    id: "storm-of-vengeance",
    // The canonical-runtime authored program: the
    // cast is the arrival round — CON save or 2d6 thunder and deafened while
    // the storm lasts — under concentration; the later rounds are
    // table-declared pulses on the sourced legacy cadence: "acid-rain" (4d6
    // acid, round 2), "lightning-bolts" (up to six targets, DEX save, 10d6
    // half-on-save, round 3), "hailstones" (2d6 bludgeoning, round 4), and
    // "freezing-rain" (1d6 cold, rounds 5-10, once per round).
    level: 9,
    school: "conjuration",
    classes: ["druid"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: true,
    duration: { kind: "minutes", amount: 1 },
    // The storm cycles through five elements over its rounds: Thunder (round 1),
    // Acid (2), Lightning (3), Bludgeoning (4), Cold (5-10) — all simultaneous.
    damageTypes: ["thunder", "acid", "lightning", "bludgeoning", "cold"],
    damageDice: "2d6",
    saveAbility: "CON",
    source: "SRD",
  },
  {
    id: "true-polymorph",
    formRule: {
      pool: "bestiary",
      keepsMind: false,
      reshift: false,
      endsWithoutTempHp: true,
    },
    level: 9,
    school: "transmutation",
    classes: ["bard", "warlock", "wizard"],
    castingTime: "action",
    ritual: false,
    components: {
      v: true,
      s: true,
      m: true,
    },
    concentration: true,
    duration: { kind: "hours", amount: 1 },
    saveAbility: "WIS",
    source: "SRD",
  },
  {
    id: "weird",
    // The canonical-runtime authored program: the
    // cast forces every caught creature's WIS save against 10d10 psychic (half
    // on a success) and leaves the failures frightened while concentration
    // holds; each frightened creature's turn-end is a table-declared "pulse" —
    // repeat WIS save, 5d10 psychic on a failure, and a success frees that
    // creature (the spell keeps running for the rest).
    level: 9,
    school: "illusion",
    classes: ["warlock", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: true, m: false },
    concentration: true,
    duration: { kind: "minutes", amount: 1 },
    damageType: "psychic",
    damageDice: "10d10",
    saveAbility: "WIS",
    conditionApplication: {
      options: ["frightened"],
      on: "failed-save",
      lifetime: { kind: "source" },
    },
    area: true,
    grants: [
      {
        type: "while-active",
        activeKey: "spell-weird",
        duration: timedSpellDuration(1),
        grants: [],
      },
    ],
    damageOnSave: "half",
    source: "SRD",
  },
  {
    id: "wish",
    level: 9,
    school: "conjuration",
    classes: ["sorcerer", "wizard"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: false, m: false },
    concentration: false,
    duration: { kind: "instantaneous" },
    instantaneous: true,
    source: "SRD",
  },
  {
    id: "power-word-heal",
    level: 9,
    school: "enchantment",
    classes: ["bard", "cleric"],
    castingTime: "action",
    ritual: false,
    components: { v: true, s: false, m: false },
    concentration: false,
    duration: { kind: "instantaneous" },
    instantaneous: true,
    effectTag: "heal",
    healingMode: "full",
    conditionRemoval: {
      options: ["charmed", "frightened", "paralyzed", "poisoned", "stunned"],
    },
    source: "SRD",
  },
];
