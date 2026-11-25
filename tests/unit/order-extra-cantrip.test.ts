/**
 * Divine Order «Thaumaturge. You know one extra cantrip from the Cleric spell list»
 * and Primal Order «Magician. You know one extra cantrip from the Druid spell list»
 * (SRD 5.2.1): choosing that order at creation asks the extra cantrip; the other
 * order (Protector / Warden) asks none.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  missingCreationRequirements,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { creationChoiceSlots } from "@/lib/creation-choices";

const base = {
  level: 1,
  subclassId: "",
  backgroundId: "acolyte",
  humanFeat: "",
  bgFeat: "",
  raceId: "",
};

const cantripSlots = (classId: string, bundleChoices: Record<string, string>) =>
  creationChoiceSlots({ ...base, classId, bundleChoices }).spell.filter(
    (s) => s.kind === "cantrip" && s.classSpellList === classId
  );

describe("the order's extra cantrip", () => {
  it("Thaumaturge asks one extra Cleric cantrip; Protector none", () => {
    expect(cantripSlots("cleric", { "cleric-divine-order": "thaumaturge" })).toHaveLength(
      1
    );
    expect(cantripSlots("cleric", { "cleric-divine-order": "protector" })).toHaveLength(
      0
    );
  });

  it("Magician asks one extra Druid cantrip; Warden none", () => {
    expect(cantripSlots("druid", { "druid-primal-order": "magician" })).toHaveLength(1);
    expect(cantripSlots("druid", { "druid-primal-order": "warden" })).toHaveLength(0);
  });
});

describe("a Thaumaturge Cleric built through creation", () => {
  const apply = (d: CreationDraft, ...actions: CreationDraftAction[]) =>
    actions.reduce(creationDraftReducer, d);
  const draft = (order: string) =>
    apply(
      initialCreationDraft(),
      { type: "setName", name: "Audit" },
      { type: "setAlignment", alignment: "neutral" },
      { type: "selectClass", classId: "cleric" },
      { type: "selectRace", raceId: "halfling" },
      { type: "setLineageChoice", bundleKey: "cleric-divine-order", optionId: order },
      { type: "fillReadyMade" }
    );
  const cantrips = (order: string) => {
    const d = draft(order);
    expect(missingCreationRequirements(d, creationFacts(d))).toEqual([]);
    const built = buildNewCharacter(d, { displayName: null });
    if (!built.ok) throw new Error(built.error);
    return built.payload.character.spells.filter(
      (s) => "srdId" in s && getSpellById(s.srdId)?.level === 0
    ).length;
  };

  it("knows one cantrip more than a Protector (3 + 1 at level 1)", () => {
    expect(cantrips("protector")).toBe(3);
    expect(cantrips("thaumaturge")).toBe(4);
  });
});
