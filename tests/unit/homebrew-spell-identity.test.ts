/**
 * A homebrew spell with structured mechanics goes through the same cast seams as a
 * catalogue spell, keyed by its own identity (homebrew audit, item 1): its priced
 * material component is charged, the weapon it names is bound, and the choices of its
 * state are cleared on a new cast. A catalogue spell keeps reading the catalogue.
 */
import { afterEach, describe, expect, it } from "vitest";

import { activateActionState } from "@/features/character/center/action-state-commit";
import { customInstanceId } from "./__helpers__/custom-items";
import { castMaterialCost } from "@/lib/play/material-cost";
import { spellDataOf, spellKeyOf } from "@/lib/play/spell-identity";
import { castStateChoiceKeys } from "@/lib/play/states";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc, CustomSpell } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const KEEN_EDGE: CustomSpell = {
  custom: true,
  name: "Keen Edge",
  level: 2,
  school: "transmutation",
  castingTime: "bonus action",
  range: "Touch",
  components: { v: true, s: true, m: true, material: "a whetstone worth 50 GP" },
  duration: "1 hour",
  concentration: false,
  description: "A weapon you touch gleams.",
  prepared: true,
  instanceId: customInstanceId("Keen Edge"),
  mechanics: {
    components: { costGp: 50, consumed: true },
    duration: { kind: "hours", amount: 1 },
    grants: [
      {
        type: "while-active",
        activeKey: "homebrew-keen-edge",
        grants: [
          { type: "weapon-binding", choiceKey: "homebrew-keen-edge:weapon", bonus: 1 },
        ],
      },
    ],
  },
};

function wizard(): CharacterDoc {
  return makeCharacterDoc({
    classId: "wizard",
    level: 5,
    spells: [KEEN_EDGE, { srdId: "magic-weapon", prepared: true }],
    weapons: [{ srdId: "dagger" }] as never,
    spellSlots: [{ level: 2, total: 3 }],
  });
}

const actionOf = (
  doc: CharacterDoc,
  test: (a: ResolvedAction) => boolean
): ResolvedAction => {
  const found = resolveActions(doc, "spellbook")
    .map((a) => localizeAction(a, "en") as unknown as ResolvedAction)
    .find(test);
  if (!found) throw new Error("action missing");
  return found;
};

afterEach(() => useCharacterStore.setState({ character: null }));

describe("a homebrew spell's own identity", () => {
  it("its data and key: the homebrew spell's, not a catalogue lookup", () => {
    const doc = wizard();
    const keen = actionOf(doc, (a) => a.customSpellInstanceId === KEEN_EDGE.instanceId);
    expect(spellKeyOf(keen)).toBe(`custom-spell-${KEEN_EDGE.instanceId}`);
    expect(spellDataOf(keen)?.components.costGp).toBe(50);
    const magic = actionOf(doc, (a) => a.spellId === "magic-weapon");
    expect(spellKeyOf(magic)).toBe("magic-weapon");
    expect(spellDataOf(magic)?.id).toBe("magic-weapon");
  });

  it("its priced component is charged like a catalogue one", () => {
    const keen = actionOf(
      wizard(),
      (a) => a.customSpellInstanceId === KEEN_EDGE.instanceId
    );
    expect(castMaterialCost(spellDataOf(keen))).toEqual({
      spellId: `custom-spell-${KEEN_EDGE.instanceId}`,
      gp: 50,
      consumed: true,
    });
  });

  it("the weapon its cast names is bound, and a new cast clears the pick", () => {
    const doc = wizard();
    useCharacterStore.setState({
      character: doc,
      readonly: false,
      loading: false,
      error: null,
    });
    const keen = actionOf(doc, (a) => a.customSpellInstanceId === KEEN_EDGE.instanceId);
    expect(castStateChoiceKeys(spellDataOf(keen), "homebrew-keen-edge")).toEqual([
      "homebrew-keen-edge:weapon",
    ]);
    activateActionState(keen, 2, { weapon: { kind: "srd", index: 0, srdId: "dagger" } });
    expect(
      useCharacterStore.getState().character?.session.grantBundleChoices?.[
        "homebrew-keen-edge:weapon"
      ]
    ).toBe("srd:0:dagger");
  });
});

describe("a structured homebrew spell's Concentration", () => {
  it("keys on its instanceId, like every homebrew spell", () => {
    const glow = {
      ...KEEN_EDGE,
      name: "Warding Glow",
      instanceId: customInstanceId("Warding Glow"),
      concentration: true,
      mechanics: { duration: { kind: "minutes", amount: 1 } },
    } as CustomSpell;
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 5,
      spells: [glow],
      spellSlots: [{ level: 2, total: 3 }],
    });
    const action = actionOf(doc, (a) => a.customSpellInstanceId === glow.instanceId);
    expect(action.homebrewSpell).toBeDefined();
  });
});
