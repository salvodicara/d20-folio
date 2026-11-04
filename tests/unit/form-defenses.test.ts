/**
 * A form's own defenses are yours while you hold it (edge-case family M2): a
 * badger's Poison resistance, an iron golem's Fire immunity; they end with the form,
 * and a bestiary form's stored block keeps them across a reload.
 */
import { describe, expect, it } from "vitest";

import { getBeast } from "@/data/beasts";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  parsePersistedPlayStateV1,
  sessionToPlayStateV1,
} from "@/lib/session-state-codec";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const inForm = (beastId: string, statBlock?: object): CharacterDoc =>
  makeCharacterDoc(
    { classId: "druid", level: 5 },
    {
      activeForm: {
        sourceId: "druid-wild-shape",
        beastId,
        tempHpBefore: 0,
        ...(statBlock ? { statBlock: statBlock as never } : {}),
      },
    }
  );

const defenses = (doc: CharacterDoc) =>
  aggregateCharacterGrants(doc.character, doc.session);

describe("a form's defenses", () => {
  it("a Beast form gives its resistances while held, and none after", () => {
    expect(defenses(inForm("badger")).damageResistances.has("poison")).toBe(true);
    expect(
      defenses(makeCharacterDoc({ classId: "druid", level: 5 })).damageResistances.has(
        "poison"
      )
    ).toBe(false);
  });

  it("a bestiary form's stored block gives its immunities, and survives the codec", () => {
    const badger = getBeast("badger");
    if (!badger) throw new Error("no badger");
    const golem = {
      ...badger,
      id: "iron-golem",
      damageImmunities: ["fire", "poison"],
      conditionImmunities: ["poisoned"],
    };
    const doc = inForm("iron-golem", golem);
    expect(defenses(doc).damageImmunities.has("fire")).toBe(true);
    const parsed = parsePersistedPlayStateV1(sessionToPlayStateV1(doc.session));
    if (!parsed.ok) throw new Error("did not parse");
    expect(parsed.session.activeForm?.statBlock).toMatchObject({
      damageImmunities: ["fire", "poison"],
      conditionImmunities: ["poisoned"],
    });
  });
});
