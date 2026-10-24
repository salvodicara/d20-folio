/**
 * The generic riders a monster print states (`printedRiders`), read from a Hit or
 * Failure clause — the same reader for the SRD bestiary (pinned by the corpus guard)
 * and a DM's homebrew monster written as text.
 */
import { describe, expect, it } from "vitest";
import {
  printedAttack,
  printedRiders,
  printedSave,
} from "@/lib/activities/monster-print";

describe("printedRiders", () => {
  it("a push and a pull", () => {
    expect(
      printedRiders("The target is pushed up to 60 feet straight away from the dragon.")
    ).toEqual({ forcedMovement: { direction: "push", feet: 60 } });
    expect(
      printedRiders("The target is pulled up to 10 feet toward the kraken.")
    ).toEqual({ forcedMovement: { direction: "pull", feet: 10 } });
  });

  it("a Speed loss and whose turn it lasts to", () => {
    expect(
      printedRiders(
        "the target's Speed decreases by 10 feet until the end of its next turn."
      )
    ).toEqual({
      speedReduction: { feet: 10, until: { phase: "turn-end", anchor: "target" } },
    });
    expect(
      printedRiders(
        "the target's Speed is reduced by 15 feet until the start of the mephit's next turn."
      )
    ).toEqual({
      speedReduction: { feet: 15, until: { phase: "turn-start", anchor: "actor" } },
    });
    expect(
      printedRiders(
        "Until the end of its next turn, the target can't take a Reaction, its Speed decreases by 10 feet."
      )
    ).toEqual({
      speedReduction: { feet: 10, until: { phase: "turn-end", anchor: "target" } },
    });
    expect(printedRiders("Its Speed decreases by 10 feet.")).toEqual({
      speedReduction: { feet: 10 },
    });
  });

  it("a drain by the damage taken, of a type when the print names one", () => {
    expect(
      printedRiders(
        "its Hit Point maximum decreases by an amount equal to the damage taken."
      )
    ).toEqual({ hpMaxReduction: {} });
    expect(
      printedRiders(
        "The target's Hit Point maximum decreases by an amount equal to the Necrotic damage taken."
      )
    ).toEqual({ hpMaxReduction: { damageType: "necrotic" } });
  });

  it("a drain over days is no immediate drain", () => {
    expect(
      printedRiders(
        "its Hit Point maximum decreases by 10 (3d6) every 24 hours that elapse."
      )
    ).toEqual({});
  });

  it("a swallow with its damage each turn", () => {
    expect(
      printedRiders(
        "The behir swallows the target. While swallowed, a creature has the Blinded and Restrained conditions, has Total Cover against attacks and other effects outside the behir, and takes 21 (6d6) Acid damage at the start of each of the behir's turns."
      )
    ).toEqual({ swallows: { damage: { dice: "6d6", damageType: "acid" } } });
  });

  it("two damage clauses leave the damage to the text; other conditions are no swallow", () => {
    expect(
      printedRiders(
        "A swallowed creature has the Blinded and Restrained conditions, it has Total Cover against attacks and other effects outside the remorhaz, and it takes 10 (3d6) Acid damage plus 10 (3d6) Fire damage at the start of each of the remorhaz's turns."
      )
    ).toEqual({ swallows: {} });
    expect(
      printedRiders(
        "A swallowed creature has the Restrained condition, has Total Cover against attacks and other effects outside the kraken."
      )
    ).toEqual({});
  });

  it("a homebrew print gets its riders through the attack and save readers", () => {
    expect(
      printedAttack(
        "Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Bludgeoning damage, and the target is pushed up to 10 feet straight away from the ogre."
      )
    ).toMatchObject({ forcedMovement: { direction: "push", feet: 10 } });
    expect(
      printedSave(
        "Constitution Saving Throw: DC 13, one creature within 5 feet. Failure: 6 (1d8 + 2) Necrotic damage, and the target's Hit Point maximum decreases by an amount equal to the damage taken."
      )
    ).toMatchObject({ hpMaxReduction: {} });
  });
});
