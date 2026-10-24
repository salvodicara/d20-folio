/**
 * The stat-block print parser, second batch: a Multiattack's routine, how an
 * entry moves the monster, and what it breathes. Every case is a real SRD 5.2.1
 * print (src/i18n/en/srd/monsters.json); the corpus guard
 * (monster-print-corpus.guard.test.ts) pins the bestiary data to these readings.
 */
import { describe, expect, it } from "vitest";

import {
  printedBreathing,
  printedMovement,
  printedMultiattack,
  type PrintedEntryName,
} from "@/lib/activities/monster-print";

/** A block's entry names, compact: [section, entryId, printed name, kind]. */
const block = (
  ...rows: ReadonlyArray<
    readonly [PrintedEntryName["section"], string, string, PrintedEntryName["kind"]]
  >
): PrintedEntryName[] =>
  rows.map(([section, entryId, name, kind]) => ({ section, entryId, name, kind }));

const MULTI = ["actions", "multiattack", "Multiattack", "narrative"] as const;

describe("printedMultiattack — the routine a Multiattack prints", () => {
  const owlbear = block(MULTI, ["actions", "rend", "Rend", "attack"]);
  const redDragon = block(
    MULTI,
    ["actions", "rend", "Rend", "attack"],
    ["actions", "fire-breath", "Fire Breath", "save"],
    ["actions", "spellcasting", "Spellcasting", "spellcasting"]
  );
  const brassDragon = block(
    MULTI,
    ["actions", "rend", "Rend", "attack"],
    ["actions", "sleep-breath", "Sleep Breath", "save"],
    ["actions", "spellcasting", "Spellcasting", "spellcasting"]
  );
  const goldDragon = block(
    MULTI,
    ["actions", "rend", "Rend", "attack"],
    ["actions", "spellcasting", "Spellcasting", "spellcasting"],
    ["actions", "weakening-breath", "Weakening Breath", "save"]
  );
  const banditCaptain = block(
    MULTI,
    ["actions", "scimitar", "Scimitar", "attack"],
    ["actions", "pistol", "Pistol", "attack"],
    ["reactions", "parry", "Parry", "narrative"]
  );
  const vampire = block(
    ["traits", "spider-climb", "Spider Climb", "narrative"],
    ["actions", "multiattack", "Multiattack (Vampire Form Only)", "narrative"],
    ["actions", "grave-strike", "Grave Strike (Vampire Form Only)", "attack"],
    ["actions", "bite", "Bite (Bat or Vampire Form Only)", "save"],
    ["bonusActions", "charm", "Charm", "narrative"]
  );
  const chimera = block(
    MULTI,
    ["actions", "bite", "Bite", "attack"],
    ["actions", "claw", "Claw", "attack"],
    ["actions", "ram", "Ram", "attack"],
    ["actions", "fire-breath", "Fire Breath", "save"]
  );
  const medusa = block(
    MULTI,
    ["actions", "claw", "Claw", "attack"],
    ["actions", "snake-hair", "Snake Hair", "attack"],
    ["actions", "poison-ray", "Poison Ray", "attack"]
  );
  const planetar = block(
    MULTI,
    ["actions", "radiant-sword", "Radiant Sword", "attack"],
    ["actions", "holy-burst", "Holy Burst", "save"]
  );
  const aboleth = block(
    MULTI,
    ["actions", "tentacle", "Tentacle", "attack"],
    ["actions", "consume-memories", "Consume Memories", "save"],
    ["actions", "dominate-mind", "Dominate Mind", "save"]
  );
  const tarrasque = block(
    MULTI,
    ["actions", "bite", "Bite", "attack"],
    ["actions", "claw", "Claw", "attack"],
    ["actions", "tail", "Tail", "attack"]
  );
  const roper = block(
    MULTI,
    ["actions", "bite", "Bite", "attack"],
    ["actions", "tentacle", "Tentacle", "narrative"],
    ["actions", "reel", "Reel", "narrative"]
  );
  const werebear = block(
    MULTI,
    ["actions", "bite", "Bite (Bear or Hybrid Form Only)", "attack"],
    ["actions", "handaxe", "Handaxe (Humanoid or Hybrid Form Only)", "attack"],
    ["actions", "rend", "Rend (Bear or Hybrid Form Only)", "attack"]
  );
  const rustMonster = block(
    MULTI,
    ["actions", "bite", "Bite", "attack"],
    ["actions", "antennae", "Antennae", "save"]
  );
  const dryad = block(
    MULTI,
    ["actions", "vine-lash", "Vine Lash", "attack"],
    ["actions", "thorn-burst", "Thorn Burst", "attack"],
    ["actions", "spellcasting", "Spellcasting", "spellcasting"]
  );
  const kraken = block(
    MULTI,
    ["actions", "tentacle", "Tentacle", "attack"],
    ["actions", "fling", "Fling", "save"],
    ["actions", "lightning-strike", "Lightning Strike", "save"],
    ["actions", "swallow", "Swallow", "save"]
  );
  const guardianNaga = block(
    MULTI,
    ["actions", "bite", "Bite", "attack"],
    ["actions", "poisonous-spittle", "Poisonous Spittle", "save"]
  );
  const hellHound = block(MULTI, ["actions", "bite", "Bite", "attack"]);
  const clayGolem = block(
    MULTI,
    ["actions", "slam", "Slam", "attack"],
    ["bonusActions", "hasten", "Hasten", "narrative"]
  );

  it.each([
    [
      "owlbear: two of one attack",
      "The owlbear makes two Rend attacks.",
      owlbear,
      { steps: [{ count: 2, use: ["rend"] }] },
    ],
    [
      "hell hound: two Bites",
      "The hound makes two Bite attacks.",
      hellHound,
      { steps: [{ count: 2, use: ["bite"] }] },
    ],
    [
      "half-dragon: a hyphenated subject",
      "The half-dragon makes two Claw attacks.",
      block(MULTI, ["actions", "claw", "Claw", "attack"]),
      { steps: [{ count: 2, use: ["claw"] }] },
    ],
    [
      "adult red dragon: one attack can become a spell",
      "The dragon makes three Rend attacks. It can replace one attack with a use of Spellcasting to cast Scorching Ray.",
      redDragon,
      {
        steps: [{ count: 3, use: ["rend"] }],
        replace: { count: 1, use: ["spellcasting"] },
      },
    ],
    [
      "adult brass dragon: an (A)/(B) replacement keeps both",
      "The dragon makes three Rend attacks. It can replace one attack with a use of (A) Sleep Breath or (B) Spellcasting to cast Scorching Ray.",
      brassDragon,
      {
        steps: [{ count: 3, use: ["rend"] }],
        replace: { count: 1, use: ["sleep-breath", "spellcasting"] },
      },
    ],
    [
      "adult gold dragon: the spell first, an upcast note",
      "The dragon makes three Rend attacks. It can replace one attack with a use of (A) Spellcasting to cast Guiding Bolt (level 2 version) or (B) Weakening Breath.",
      goldDragon,
      {
        steps: [{ count: 3, use: ["rend"] }],
        replace: { count: 1, use: ["spellcasting", "weakening-breath"] },
      },
    ],
    [
      "young brass dragon: two attacks for one breath",
      "The dragon makes three Rend attacks. It can replace two attacks with a use of Sleep Breath.",
      brassDragon,
      {
        steps: [{ count: 3, use: ["rend"] }],
        replace: { count: 2, use: ["sleep-breath"] },
      },
    ],
    [
      "bandit captain: any combination of two attacks",
      "The bandit makes two attacks, using Scimitar and Pistol in any combination.",
      banditCaptain,
      { steps: [{ count: 2, use: ["scimitar", "pistol"] }] },
    ],
    [
      "vampire: two Grave Strikes, then Bite (a save)",
      "The vampire makes two Grave Strike attacks and uses Bite.",
      vampire,
      {
        steps: [
          { count: 2, use: ["grave-strike"] },
          { count: 1, use: ["bite"] },
        ],
      },
    ],
    [
      "chimera: three attacks, the Claw can become Fire Breath",
      "The chimera makes one Ram attack, one Bite attack, and one Claw attack. It can replace the Claw attack with a use of Fire Breath if available.",
      chimera,
      {
        steps: [
          { count: 1, use: ["ram"] },
          { count: 1, use: ["bite"] },
          { count: 1, use: ["claw"] },
        ],
        replace: { count: 1, use: ["fire-breath"], of: "claw" },
      },
    ],
    [
      "medusa: an alternative routine",
      "The medusa makes two Claw attacks and one Snake Hair attack, or it makes three Poison Ray attacks.",
      medusa,
      {
        steps: [
          { count: 2, use: ["claw"] },
          { count: 1, use: ["snake-hair"] },
        ],
        or: [{ count: 3, use: ["poison-ray"] }],
      },
    ],
    [
      "planetar: 'or uses Holy Burst twice'",
      "The planetar makes three Radiant Sword attacks or uses Holy Burst twice.",
      planetar,
      {
        steps: [{ count: 3, use: ["radiant-sword"] }],
        or: [{ count: 2, use: ["holy-burst"] }],
      },
    ],
    [
      "aboleth: a use 'if available' is optional",
      "The aboleth makes two Tentacle attacks and uses either Consume Memories or Dominate Mind if available.",
      aboleth,
      {
        steps: [
          { count: 2, use: ["tentacle"] },
          { count: 1, use: ["consume-memories", "dominate-mind"], optional: true },
        ],
      },
    ],
    [
      "tarrasque: one Bite and three others",
      "The tarrasque makes one Bite attack and three other attacks, using Claw or Tail in any combination.",
      tarrasque,
      {
        steps: [
          { count: 1, use: ["bite"] },
          { count: 3, use: ["claw", "tail"] },
        ],
      },
    ],
    [
      "roper: attacks, a use, attacks",
      "The roper makes two Tentacle attacks, uses Reel, and makes two Bite attacks.",
      roper,
      {
        steps: [
          { count: 2, use: ["tentacle"] },
          { count: 1, use: ["reel"] },
          { count: 2, use: ["bite"] },
        ],
      },
    ],
    [
      "werebear: form-tagged names and a Bite swap",
      "The werebear makes two attacks, using Handaxe or Rend in any combination. It can replace one attack with a Bite attack.",
      werebear,
      {
        steps: [{ count: 2, use: ["handaxe", "rend"] }],
        replace: { count: 1, use: ["bite"] },
      },
    ],
    [
      "rust monster: 'uses Antennae twice'",
      "The rust monster makes one Bite attack and uses Antennae twice.",
      rustMonster,
      {
        steps: [
          { count: 1, use: ["bite"] },
          { count: 2, use: ["antennae"] },
        ],
      },
    ],
    [
      "dryad: a choice of attack, and 'can use' Spellcasting",
      "The dryad makes one Vine Lash or Thorn Burst attack, and it can use Spellcasting to cast Charm Monster.",
      dryad,
      {
        steps: [
          { count: 1, use: ["vine-lash", "thorn-burst"] },
          { count: 1, use: ["spellcasting"], optional: true },
        ],
      },
    ],
    [
      "kraken: one of three uses",
      "The kraken makes two Tentacle attacks and uses Fling, Lightning Strike, or Swallow.",
      kraken,
      {
        steps: [
          { count: 2, use: ["tentacle"] },
          { count: 1, use: ["fling", "lightning-strike", "swallow"] },
        ],
      },
    ],
    [
      "guardian naga: any attack can be the spittle",
      "The naga makes two Bite attacks. It can replace any attack with a use of Poisonous Spittle.",
      guardianNaga,
      {
        steps: [{ count: 2, use: ["bite"] }],
        replace: { count: "any", use: ["poisonous-spittle"] },
      },
    ],
  ] as const)("%s", (_label, text, names, expected) => {
    expect(printedMultiattack(text, names)).toEqual(expected);
  });

  it("reads nothing it cannot pin to a fixed routine of the block's entries", () => {
    // A count that depends on the table.
    expect(
      printedMultiattack(
        "The hydra makes as many Bite attacks as it has heads.",
        hellHound
      )
    ).toBeUndefined();
    // A routine gated on an earlier turn.
    expect(
      printedMultiattack(
        "The golem makes two Slam attacks, or it makes three Slam attacks if it used Hasten this turn.",
        clayGolem
      )
    ).toBeUndefined();
    // A name that is no entry of this block.
    expect(
      printedMultiattack("The owlbear makes two Claw attacks.", owlbear)
    ).toBeUndefined();
    // Not a Multiattack at all.
    expect(
      printedMultiattack("The dragon moves up to half its Speed.", owlbear)
    ).toBeUndefined();
  });
});

describe("printedMovement — how far and how an entry moves the monster", () => {
  it.each([
    [
      "blink dog teleport",
      "The dog teleports up to 40 feet to an unoccupied space it can see.",
      { kind: "teleport", feet: 40 },
    ],
    [
      "balor teleport, a willing demon along",
      "The balor teleports itself or a willing demon within 10 feet of itself up to 60 feet to an unoccupied space the balor can see.",
      { kind: "teleport", feet: 60 },
    ],
    [
      "bulette leap",
      "The bulette jumps up to 30 feet by spending 10 feet of movement.",
      { kind: "leap", feet: 30, costFt: 10 },
    ],
    [
      "frog standing leap",
      "The frog's Long Jump is up to 10 feet and its High Jump is up to 5 feet with or without a running start.",
      { kind: "long-jump", feet: 10, highFt: 5 },
    ],
    [
      "lion running leap",
      "With a 10-foot running start, the lion can Long Jump up to 25 feet.",
      { kind: "long-jump", feet: 25, runningStartFt: 10 },
    ],
    [
      "troll charge",
      "The troll moves up to half its Speed straight toward an enemy it can see.",
      { kind: "move", speeds: ["walk"], half: true, towardEnemy: true },
    ],
    [
      "adult red dragon pounce (it also makes one Rend attack)",
      "The dragon moves up to half its Speed, and it makes one Rend attack.",
      { kind: "move", speeds: ["walk"], half: true },
    ],
    [
      "xorn charge: Speed or Burrow Speed",
      "The xorn moves up to its Speed or Burrow Speed straight toward an enemy it can sense.",
      { kind: "move", speeds: ["walk", "burrow"], towardEnemy: true },
    ],
    [
      "roc swoop: a gated fly with no Opportunity Attacks",
      "If the roc has a creature Grappled, the roc flies up to half its Fly Speed without provoking Opportunity Attacks and drops that creature.",
      {
        kind: "move",
        speeds: ["fly"],
        half: true,
        noOpportunityAttacks: true,
        gated: true,
      },
    ],
    [
      "adult blue dragon cloaked flight",
      "The dragon uses Spellcasting to cast Invisibility on itself, and it can fly up to half its Fly Speed. The dragon can't take this action again until the start of its next turn.",
      { kind: "move", speeds: ["fly"], half: true },
    ],
    [
      "sahuagin aquatic charge",
      "The sahuagin swims up to its Swim Speed straight toward an enemy it can see.",
      { kind: "move", speeds: ["swim"], towardEnemy: true },
    ],
    [
      "assassin cunning action: one of three",
      "The assassin takes the Dash, Disengage, or Hide action.",
      { kind: "take-action", actions: ["dash", "disengage", "hide"], pickOne: true },
    ],
    [
      "clay golem hasten: both",
      "The golem takes the Dash and Disengage actions.",
      { kind: "take-action", actions: ["dash", "disengage"] },
    ],
    [
      "shadow stealth: a gated Hide",
      "While in Dim Light or Darkness, the shadow takes the Hide action.",
      { kind: "take-action", actions: ["hide"], gated: true },
    ],
    [
      "vampire spider climb",
      "The vampire can climb difficult surfaces, including along ceilings, without needing to make an ability check.",
      { kind: "spider-climb" },
    ],
    [
      "swarm of insects spider climb, gated on a Climb Speed",
      "If the swarm has a Climb Speed, the swarm can climb difficult surfaces, including along ceilings, without needing to make an ability check.",
      { kind: "spider-climb", gated: true },
    ],
    [
      "purple worm tunneler",
      "The worm can burrow through solid rock at half its Burrow Speed and leaves a 10-foot-diameter tunnel in its wake.",
      { kind: "burrow-through", material: "solid-rock", half: true },
    ],
    [
      "xorn earth glide",
      "The xorn can burrow through nonmagical, unworked earth and stone. While doing so, the xorn doesn't disturb the material it moves through.",
      { kind: "burrow-through", material: "earth-and-stone" },
    ],
  ] as const)("%s", (_label, text, expected) => {
    expect(printedMovement(text)).toEqual(expected);
  });

  it("reads no move the print does not state", () => {
    // A plane shift has no distance.
    expect(
      printedMovement(
        "The spider teleports from the Material Plane to the Ethereal Plane or vice versa."
      )
    ).toBeUndefined();
    // A Speed change is not a move.
    expect(
      printedMovement(
        "If the elemental takes Cold damage, its Speed decreases by 20 feet until the end of its next turn."
      )
    ).toBeUndefined();
    // Another creature's move is not the monster's.
    expect(
      printedMovement(
        "Trigger: Another creature the nalfeshnee can see ends its move within 120 feet of the nalfeshnee. Response: The nalfeshnee uses Teleport, but its destination space must be within 10 feet of the triggering creature."
      )
    ).toBeUndefined();
  });
});

describe("printedBreathing — what a monster can breathe", () => {
  it.each([
    ["aboleth amphibious", "The aboleth can breathe air and water.", "air-and-water"],
    ["hunter shark", "The shark can breathe only underwater.", "water-only"],
    [
      "giant octopus, a held breath too",
      "The octopus can breathe only underwater. It can hold its breath for 1 hour outside water.",
      "water-only",
    ],
    [
      "sahuagin: amphibious with a limit stays text",
      "The sahuagin can breathe air and water, but it must be submerged at least once every 4 hours to avoid suffocating outside water.",
      undefined,
    ],
  ] as const)("%s", (_label, text, expected) => {
    expect(printedBreathing(text)).toBe(expected);
  });
});
