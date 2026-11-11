/**
 * Wizard Scholar (SRD 5.2.1, Wizard level 2): Expertise in ONE of Arcana, History,
 * Investigation, Medicine, Nature or Religion, among the skills you are proficient
 * in. The slot carries that pool; a feat's open Expertise (Skill Expert) does not.
 */
import { describe, it, expect } from "vitest";
import { getClassFeatures } from "@/data/classes";
import {
  expertiseSlotOptions,
  pendingExpertiseSlotsForFeat,
} from "@/lib/feat-expertise-choices";

const SCHOLAR_POOL = [
  "arcana",
  "history",
  "investigation",
  "medicine",
  "nature",
  "religion",
];

describe("Wizard Scholar's Expertise pool", () => {
  const scholar = getClassFeatures("wizard").find((f) => f.id === "wizard-scholar");

  it("offers only the six Scholar skills the wizard is proficient in", () => {
    const [slot] = pendingExpertiseSlotsForFeat(scholar ?? {});
    if (!slot) throw new Error("Scholar has no Expertise slot");
    const proficient = new Set(["arcana", "history", "insight", "perception"]);
    expect(expertiseSlotOptions(slot, proficient)).toEqual(["arcana", "history"]);
    expect(slot.options).toEqual(SCHOLAR_POOL);
  });

  it("an open Expertise slot still offers every proficient skill", () => {
    const [slot] = pendingExpertiseSlotsForFeat({
      grants: [{ type: "choice-expertise", amount: 2 }],
    });
    if (!slot) throw new Error("no slot");
    const proficient = new Set(["insight", "perception"]);
    expect(expertiseSlotOptions(slot, proficient)).toEqual(["insight", "perception"]);
  });
});
