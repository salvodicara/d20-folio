/**
 * «Su quale arma?» on the classic sheet: an action whose state or spell binds one
 * weapon (Basic Poison's coat, Brew Poison, Magic Weapon, Shillelagh) asks which
 * weapon when there is a choice, binds the only one when there is not, and asks
 * nothing for every other action.
 */
import { describe, expect, it } from "vitest";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { resolveActions } from "@/lib/smart-tracker";
import { boundWeaponNames, weaponPickStep } from "@/domains/play/weapon-pick-view";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { activatableToggles } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";

const rogue = (): CharacterDoc => {
  const doc = buildDevScenario("scn-basic-poison");
  if (!doc) throw new Error("scenario missing");
  return doc;
};
const action = (doc: CharacterDoc, prefix: string) => {
  const found = resolveActions(doc).find((a) => a.id.startsWith(prefix));
  if (!found) throw new Error(`no ${prefix}`);
  return found;
};

describe("weaponPickStep", () => {
  it("two weapons: asks, naming each", () => {
    const doc = rogue();
    const step = weaponPickStep(doc, action(doc, "equipment-action-poison-basic"), "en");
    expect(step.kind).toBe("ask");
    if (step.kind !== "ask") return;
    expect(step.picks.map((p) => p.name)).toEqual(["Dagger", "Shortbow"]);
  });

  it("one weapon: binds it without asking", () => {
    const base = rogue();
    const doc: CharacterDoc = {
      ...base,
      character: { ...base.character, weapons: [{ srdId: "dagger", quantity: 1 }] },
    };
    expect(
      weaponPickStep(doc, action(doc, "equipment-action-poison-basic"), "en")
    ).toEqual({
      kind: "bind",
      weapon: { kind: "srd", index: 0, srdId: "dagger" },
    });
  });

  it("an action that binds nothing asks nothing", () => {
    const doc = rogue();
    const dash = resolveActions(doc).find((a) => a.type === "bonus" && !a.activatesKey);
    if (!dash) throw new Error("no dash");
    expect(weaponPickStep(doc, dash, "en")).toEqual({ kind: "none" });
  });

  it("the lit coat names the weapon it is bound to", () => {
    const base = rogue();
    const doc: CharacterDoc = {
      ...base,
      session: {
        ...base.session,
        activeFeatures: ["item-poison-basic"],
        grantBundleChoices: { "poison-basic-coated-weapon": "srd:0:dagger" },
      },
    };
    const aggregate = aggregateCharacterGrants(doc.character, doc.session);
    const names = boundWeaponNames(doc, aggregate.weaponBindings, "en");
    expect(names).toEqual({ "item-poison-basic": "Dagger" });
    const coat = activatableToggles(
      aggregate.activatableGroups,
      "en",
      {},
      false,
      names
    ).find((toggle) => toggle.key === "item-poison-basic");
    expect(coat?.label).toBe("Poisoned weapon · Dagger");
  });

  it("Magic Weapon asks the same question at its cast", () => {
    const base = buildDevScenario("scn-devotion-paladin");
    if (!base) throw new Error("scenario missing");
    const doc: CharacterDoc = {
      ...base,
      character: {
        ...base.character,
        weapons: [
          { srdId: "longsword", quantity: 1 },
          { srdId: "dagger", quantity: 1 },
        ],
        spells: [...base.character.spells, { srdId: "magic-weapon", prepared: true }],
      },
    };
    const cast = resolveActions(doc).find((a) => a.spellId === "magic-weapon");
    if (!cast) throw new Error("no Magic Weapon row");
    const step = weaponPickStep(doc, cast, "en");
    expect(step.kind === "ask" && step.picks.map((p) => p.name)).toEqual([
      "Longsword",
      "Dagger",
    ]);
  });
});
