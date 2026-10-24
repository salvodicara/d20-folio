/**
 * The stat-block print parser: what a monster entry's English text says a DM can
 * apply in one tap. Every case is a real SRD 5.2.1 print (src/i18n/en/srd/monsters.json);
 * the corpus guard (monster-print-corpus.guard.test.ts) pins the bestiary data to
 * these readings.
 */
import { describe, expect, it } from "vitest";

import {
  printedAutomaticDamage,
  printedHitConditions,
  printedPerformedEntry,
  type PrintedEntryName,
} from "@/lib/activities/monster-print";

describe("printedHitConditions — the conditions an attack's Hit clause gives", () => {
  it.each([
    [
      "kraken tentacle: two conditions, no gate",
      "Melee Attack Roll: +17, reach 30 ft. Hit: 24 (4d6 + 10) Bludgeoning damage. The target has the Grappled condition (escape DC 20) from one of ten tentacles, and it has the Restrained condition until the grapple ends.",
      { conditions: ["grappled", "restrained"] },
    ],
    [
      "storm giant thunderbolt: 'the Blinded and Deafened conditions'",
      "Ranged Attack Roll: +14, range 500 ft. Hit: 22 (2d12 + 9) Lightning damage, and the target has the Blinded and Deafened conditions until the start of the giant's next turn.",
      { conditions: ["blinded", "deafened"] },
    ],
    [
      "giant crab claw: a size gate offers it off",
      "Melee Attack Roll: +3, reach 5 ft. Hit: 4 (1d6 + 1) Bludgeoning damage. If the target is a Medium or smaller creature, it has the Grappled condition (escape DC 11) from one of two claws.",
      { conditions: ["grappled"], gated: true },
    ],
    [
      "crocodile bite: a 'While Grappled' sentence adds nothing",
      "Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Piercing damage. If the target is a Medium or smaller creature, it has the Grappled condition (escape DC 12). While Grappled, the target has the Restrained condition.",
      { conditions: ["grappled"], gated: true },
    ],
    [
      "boar gore: the charge gate, 'and has the Prone condition'",
      "Melee Attack Roll: +3, reach 5 ft. Hit: 4 (1d6 + 1) Piercing damage. If the target is a Medium or smaller creature and the boar moved 20+ feet straight toward it immediately before the hit, the target takes an extra 3 (1d6) Piercing damage and has the Prone condition.",
      { conditions: ["prone"], gated: true },
    ],
    [
      "ghoul claw: the condition rides the save the hit forces",
      "Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Slashing damage. If the target is a creature that isn't an Undead or elf, it is subjected to the following effect. Constitution Saving Throw: DC 10. Failure: The target has the Paralyzed condition until the end of its next turn.",
      { conditions: ["paralyzed"], save: { save: "CON", dc: 10 } },
    ],
    [
      "cockatrice bite: only the first failure's condition",
      "Melee Attack Roll: +3, reach 5 ft. Hit: 3 (1d4 + 1) Piercing damage. If the target is a creature, it is subjected to the following effect. Constitution Saving Throw: DC 11. First Failure: The target has the Restrained condition. The target repeats the save at the end of its next turn if it is still Restrained, ending the effect on itself on a success. Second Failure: The target has the Petrified condition, instead of the Restrained condition, for 24 hours.",
      { conditions: ["restrained"], save: { save: "CON", dc: 11 } },
    ],
    [
      "homunculus bite: the Failure clause, not the later stage nor the While line",
      "Melee Attack Roll: +4, reach 5 ft. Hit: 1 Piercing damage, and the target is subjected to the following effect. Constitution Saving Throw: DC 12. Failure: The target has the Poisoned condition until the end of the homunculus's next turn. Failure by 5 or More: The target has the Poisoned condition for 1 minute. While Poisoned, the target has the Unconscious condition, which ends early if the target takes any damage.",
      { conditions: ["poisoned"], save: { save: "CON", dc: 12 } },
    ],
    [
      "otyugh bite: a save on a later Long Rest is not the hit's",
      "Melee Attack Roll: +6, reach 5 ft. Hit: 12 (2d8 + 3) Piercing damage, and the target has the Poisoned condition. Whenever the Poisoned target finishes a Long Rest, it is subjected to the following effect. Constitution Saving Throw: DC 15. Failure: The target's Hit Point maximum decreases by 5 (1d10) and doesn't return to normal until the Poisoned condition ends on the target. Success: The Poisoned condition ends.",
      { conditions: ["poisoned"] },
    ],
  ])("%s", (_name, text, expected) => {
    expect(printedHitConditions(text)).toEqual(expected);
  });

  it.each([
    [
      "rug of smothering: 'can give it' is a choice instead of damage",
      "Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Bludgeoning damage. If the target is a Medium or smaller creature, the rug can give it the Grappled condition (escape DC 13) instead of dealing damage. Until the grapple ends, the target has the Blinded and Restrained conditions, is suffocating, and takes 10 (2d6 + 3) Bludgeoning damage at the start of each of its turns.",
    ],
    [
      "cloaker attach: a 'While the cloaker is attached' sentence",
      "Melee Attack Roll: +6, reach 5 ft. Hit: 13 (3d6 + 3) Piercing damage. If the target is a Large or smaller creature, the cloaker attaches to it. While the cloaker is attached, the target has the Blinded condition, and the cloaker can't make Attach attacks against other targets.",
    ],
    [
      "wolf bite without a condition",
      "Melee Attack Roll: +4, reach 5 ft. Hit: 7 (1d10 + 2) Piercing damage.",
    ],
  ])("%s gives none", (_name, text) => {
    expect(printedHitConditions(text)).toBeUndefined();
  });
});

describe("printedAutomaticDamage — damage a trait deals to other creatures, no roll", () => {
  it.each([
    [
      "azer fire aura",
      "At the end of each of the azer's turns, each creature of the azer's choice in a 5-foot Emanation originating from the azer takes 5 (1d10) Fire damage unless the azer has the Incapacitated condition.",
      [{ dice: "1d10", damageType: "fire" }],
    ],
    [
      "black pudding corrosive form: whoever hits it",
      "A creature that hits the pudding with a melee attack roll takes 4 (1d8) Acid damage. Nonmagical ammunition is destroyed immediately after hitting the pudding and dealing any damage.",
      [{ dice: "1d8", damageType: "acid" }],
    ],
    [
      "barbed devil barbed hide: 'deals … to any creature'",
      "At the start of each of its turns, the devil deals 5 (1d10) Piercing damage to any creature it is grappling or any creature grappling it.",
      [{ dice: "1d10", damageType: "piercing" }],
    ],
    [
      "fire elemental fire form: 'that creature takes'",
      "The elemental can move through a space as narrow as 1 inch without expending extra movement to do so, and it can enter a creature's space and stop there. The first time it enters a creature's space on a turn, that creature takes 5 (1d10) Fire damage.",
      [{ dice: "1d10", damageType: "fire" }],
    ],
    [
      "giant frog swallow: the swallowed target",
      "The frog swallows a Small or smaller target it is grappling. At the end of the frog's next turn, the swallowed target takes 5 (2d4) Acid damage. If that damage doesn't kill it, the frog disgorges it, causing it to exit Prone.",
      [{ dice: "2d4", damageType: "acid" }],
    ],
    [
      "remorhaz heat aura",
      "At the end of each of the remorhaz's turns, each creature in a 5-foot Emanation originating from the remorhaz takes 16 (3d10) Fire damage.",
      [{ dice: "3d10", damageType: "fire" }],
    ],
  ])("%s", (_name, text, expected) => {
    expect(printedAutomaticDamage(text)).toEqual(expected);
  });

  it.each([
    [
      "specter incorporeal movement: it damages itself",
      "The specter can move through other creatures and objects as if they were Difficult Terrain. It takes 5 (1d10) Force damage if it ends its turn inside an object.",
    ],
    [
      "gelatinous cube: the puller's own choice, after a comma",
      "As an action, a creature within 5 feet of the cube can pull a creature or an object out of the cube by succeeding on a DC 12 Strength (Athletics) check, and the puller takes 10 (3d6) Acid damage.",
    ],
    [
      "sea hag death glare: damage a save decides is the save's",
      "Wisdom Saving Throw: DC 11, one Frightened creature the hag can see within 30 feet. Failure: If the target has 20 Hit Points or fewer, it drops to 0 Hit Points. Otherwise, the target takes 13 (3d8) Psychic damage.",
    ],
    [
      "fire elemental water susceptibility",
      "The elemental takes 3 (1d6) Cold damage for every 5 feet the elemental moves in water or for every gallon of water splashed on it.",
    ],
  ])("%s deals none", (_name, text) => {
    expect(printedAutomaticDamage(text)).toEqual([]);
  });
});

describe("printedPerformedEntry — an entry that uses another attack or save", () => {
  const dragon: PrintedEntryName[] = [
    {
      section: "actions",
      entryId: "multiattack",
      name: "Multiattack",
      kind: "narrative",
    },
    { section: "actions", entryId: "rend", name: "Rend", kind: "attack" },
    { section: "actions", entryId: "fire-breath", name: "Fire Breath", kind: "save" },
    {
      section: "actions",
      entryId: "spellcasting",
      name: "Spellcasting",
      kind: "spellcasting",
    },
  ];
  const mummy: PrintedEntryName[] = [
    { section: "actions", entryId: "rotting-fist", name: "Rotting Fist", kind: "attack" },
    {
      section: "actions",
      entryId: "channel-negative-energy",
      name: "Channel Negative Energy",
      kind: "attack",
    },
    {
      section: "actions",
      entryId: "dreadful-glare",
      name: "Dreadful Glare",
      kind: "save",
    },
  ];
  const vampire: PrintedEntryName[] = [
    {
      section: "actions",
      entryId: "grave-strike-vampire-form-only",
      name: "Grave Strike (Vampire Form Only)",
      kind: "attack",
    },
  ];

  it("reads 'makes one X attack' and 'uses X'", () => {
    expect(
      printedPerformedEntry(
        "The dragon moves up to half its Speed, and it makes one Rend attack.",
        dragon
      )
    ).toEqual({ section: "actions", entryId: "rend" });
    expect(
      printedPerformedEntry(
        "The mummy uses Dreadful Glare. The mummy can't take this action again until the start of its next turn.",
        mummy
      )
    ).toEqual({ section: "actions", entryId: "dreadful-glare" });
    expect(
      printedPerformedEntry(
        "The vampire moves up to half its Speed, and it makes one Grave Strike attack.",
        vampire
      )
    ).toEqual({ section: "actions", entryId: "grave-strike-vampire-form-only" });
  });

  it("names nothing it cannot resolve to one attack or save", () => {
    // A choice of two attacks.
    expect(
      printedPerformedEntry(
        "The mummy makes one Rotting Fist or Channel Negative Energy attack.",
        mummy
      )
    ).toBeUndefined();
    // A spell list, not an attack or save.
    expect(
      printedPerformedEntry(
        "The dragon uses Spellcasting to cast Fear. The dragon can't take this action again until the start of its next turn.",
        dragon
      )
    ).toBeUndefined();
    // Will-o'-wisp Vanish: the entry it names only ends the effect.
    expect(
      printedPerformedEntry(
        "The wisp and its light have the Invisible condition until the wisp's Concentration ends on this effect, which ends early immediately after the wisp makes an attack roll or uses Consume Life.",
        [
          {
            section: "bonusActions",
            entryId: "consume-life",
            name: "Consume Life",
            kind: "save",
          },
        ]
      )
    ).toBeUndefined();
    // Multiattack makes several attacks.
    expect(
      printedPerformedEntry("The dragon makes three Rend attacks.", dragon)
    ).toBeUndefined();
  });
});
