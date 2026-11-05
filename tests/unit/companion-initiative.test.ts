/**
 * Where a companion acts (edge-case M19), from its source's SRD 5.2.1 text: the
 * familiar "rolls its own Initiative and acts on its own turn" (Find Familiar); Find
 * Steed's steed acts right after you; Bigby's Hand has no turn of its own (you move it
 * on yours); a summon whose text says nothing rolls its own.
 */
import { describe, expect, it } from "vitest";

import { companionInitiative } from "@/lib/play/companions";
import { sharesPlane } from "@/lib/familiar";

describe("where a companion acts", () => {
  it("follows its source's text", () => {
    expect(companionInitiative("find-familiar")).toBe("own");
    expect(companionInitiative("find-steed")).toBe("after-caster");
    expect(companionInitiative("bigbys-hand")).toBe("caster-turn");
    expect(companionInitiative("animate-dead")).toBe("own");
  });
});

/**
 * The familiar's link works on the same plane (Find Familiar: telepathy "while it is
 * within 100 feet of you"; dismissing it to a pocket dimension puts it on none). An
 * extradimensional space (a Bag of Holding, Rope Trick) is on no plane: a creature
 * inside it shares a plane only with one inside the same space. Untagged creatures
 * keep today's behaviour: they share one.
 */
describe("sharing a plane", () => {
  it("untagged creatures share one", () => {
    expect(sharesPlane(undefined, undefined)).toBe(true);
    expect(sharesPlane({ plane: "material" }, undefined)).toBe(true);
  });

  it("different planes don't", () => {
    expect(sharesPlane({ plane: "material" }, { plane: "material" })).toBe(true);
    expect(sharesPlane({ plane: "material" }, { plane: "feywild" })).toBe(false);
  });

  it("inside an extradimensional space: only with the same space", () => {
    const bag = { inside: "bag-of-holding-1" };
    expect(sharesPlane(bag, { plane: "material" })).toBe(false);
    expect(sharesPlane(bag, undefined)).toBe(false);
    expect(sharesPlane(bag, { inside: "bag-of-holding-1" })).toBe(true);
    expect(sharesPlane(bag, { inside: "rope-trick-1" })).toBe(false);
  });
});
