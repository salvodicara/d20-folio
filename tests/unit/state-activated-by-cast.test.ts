/**
 * `statesActivatedByCast`: the states a spell cast lights by itself.
 *
 * Oath of Devotion, Smite of Protection (SRD 5.2.1, Paladin 15): "Whenever you cast
 * Divine Smite, you and your allies have Half Cover while in your Aura of
 * Protection. The aura has this benefit until the start of your next turn."
 * The state is the feature's `while-active` grant; `activatedByCast` names the
 * spell that lights it.
 */
import { describe, expect, it } from "vitest";
import { classFeatureIndex } from "@/data/classes";
import { evaluateGrants } from "@/lib/grants";
import { statesActivatedByCast } from "@/lib/play/on-cast";
import { makeCharacterDoc } from "./_helpers";

const SMITE_OF_PROTECTION = "paladin-devotion-smite-of-protection";

const paladin = (level: number, features: string[]) =>
  makeCharacterDoc({
    classId: "paladin",
    subclassId: "oath-of-devotion",
    level,
    features: features.map((srdId) => ({ srdId })),
  });

describe("statesActivatedByCast", () => {
  it("a Devotion Paladin 15 casting Divine Smite lights Smite of Protection", () => {
    const doc = paladin(15, ["paladin-divine-smite", SMITE_OF_PROTECTION]);
    expect(statesActivatedByCast(doc, "divine-smite")).toEqual([SMITE_OF_PROTECTION]);
  });

  it("the lit state lasts until the start of the Paladin's next turn", () => {
    const grant = classFeatureIndex.get(SMITE_OF_PROTECTION)?.grants?.[0];
    if (grant?.type !== "while-active") throw new Error("expected while-active");
    expect(grant.duration).toEqual({
      kind: "turn-boundary",
      phase: "turn-start",
      turns: 1,
    });
  });

  it("re-casting over a still-lit state lights it again (the boundary re-arms)", () => {
    const doc = paladin(15, ["paladin-divine-smite", SMITE_OF_PROTECTION]);
    doc.session.activeFeatures = [SMITE_OF_PROTECTION];
    expect(statesActivatedByCast(doc, "divine-smite")).toEqual([SMITE_OF_PROTECTION]);
  });

  it("a Paladin without the feature lights nothing", () => {
    const doc = paladin(7, ["paladin-divine-smite"]);
    expect(statesActivatedByCast(doc, "divine-smite")).toEqual([]);
  });

  it("another spell lights nothing", () => {
    const doc = paladin(15, ["paladin-divine-smite", SMITE_OF_PROTECTION]);
    expect(statesActivatedByCast(doc, "bless")).toEqual([]);
  });

  it("a homebrew while-active carries the spells that light it on its toggle", () => {
    const agg = evaluateGrants([
      {
        id: "homebrew",
        grants: [
          {
            type: "while-active",
            activeKey: "homebrew-ward",
            activatedByCast: ["shield", "mage-armor"],
            grants: [{ type: "ac-bonus", amount: 1 }],
          },
        ],
      },
    ]);
    expect(agg.activatableGroups).toEqual([
      expect.objectContaining({
        key: "homebrew-ward",
        activatedByCast: ["shield", "mage-armor"],
      }),
    ]);
  });
});
