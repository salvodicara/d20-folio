/**
 * High Elf (SRD 5.2.1 Elven Lineage): "You know the Prestidigitation cantrip.
 * Whenever you finish a Long Rest, you can replace that cantrip with a different
 * cantrip from the Wizard spell list." The pick lives in the session's option
 * choices under the grant's key (nothing new stored); absent, it is Prestidigitation.
 * Swapping drops a stored copy of the old cantrip the creation wrote.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import {
  applyRestCantripSwap,
  HIGH_ELF_CANTRIP_KEY,
  restCantripSwaps,
} from "@/lib/rest-cantrip-swap";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { asRaceId } from "@/data/srd-names";

const elf = (lineage: string, stored = true): CharacterDoc =>
  makeCharacterDoc(
    {
      race: asRaceId("elf"),
      classes: [{ classId: "fighter", level: 3 }],
      spells: stored
        ? [{ srdId: "prestidigitation", prepared: true, alwaysPrepared: true }]
        : [],
    },
    { grantBundleChoices: { "elf-lineage": lineage } }
  );

const ids = (doc: CharacterDoc) =>
  resolveEffectiveSpells(doc.character, doc.session).flatMap((s) =>
    "custom" in s ? [] : [s.srdId]
  );

describe("the High Elf's cantrip, replaced after a Long Rest", () => {
  it("a High Elf has one swap row: Prestidigitation now, any other Wizard cantrip", () => {
    const rows = restCantripSwaps(elf("high-elf"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      choiceKey: HIGH_ELF_CANTRIP_KEY,
      current: "prestidigitation",
    });
    expect(rows[0]?.options).toContain("light");
    expect(rows[0]?.options).not.toContain("prestidigitation");
    for (const id of rows[0]?.options ?? []) {
      expect(getSpellById(id)?.level).toBe(0);
      expect(getSpellById(id)?.classes).toContain("wizard");
    }
  });

  it("a Wood Elf or a Drow has none", () => {
    expect(restCantripSwaps(elf("wood-elf"))).toEqual([]);
    expect(restCantripSwaps(elf("drow"))).toEqual([]);
  });

  it("the swap replaces the cantrip on the sheet, stored copy included", () => {
    for (const stored of [true, false]) {
      const after = applyRestCantripSwap(
        elf("high-elf", stored),
        HIGH_ELF_CANTRIP_KEY,
        "light"
      );
      expect(after.session.grantBundleChoices?.[HIGH_ELF_CANTRIP_KEY]).toBe("light");
      expect(ids(after)).toContain("light");
      expect(ids(after)).not.toContain("prestidigitation");
      // Still the lineage's: cast with the species' ability.
      const light = resolveEffectiveSpells(after.character, after.session).find(
        (s) => !("custom" in s) && s.srdId === "light"
      );
      expect(light).toMatchObject({ alwaysPrepared: true, speciesSpellAbility: true });
    }
  });

  it("swapping again replaces the swapped one; back to Prestidigitation clears the pick", () => {
    const once = applyRestCantripSwap(elf("high-elf"), HIGH_ELF_CANTRIP_KEY, "light");
    const twice = applyRestCantripSwap(once, HIGH_ELF_CANTRIP_KEY, "mage-hand");
    expect(ids(twice)).toContain("mage-hand");
    expect(ids(twice)).not.toContain("light");
    const back = applyRestCantripSwap(twice, HIGH_ELF_CANTRIP_KEY, "prestidigitation");
    expect(back.session.grantBundleChoices?.[HIGH_ELF_CANTRIP_KEY]).toBeUndefined();
    expect(ids(back)).toContain("prestidigitation");
  });

  it("a cantrip the elf already knows is not offered", () => {
    const knows = elf("high-elf");
    const withLight = {
      ...knows,
      character: {
        ...knows.character,
        spells: [...knows.character.spells, { srdId: "light", prepared: true }],
      },
    };
    expect(restCantripSwaps(withLight)[0]?.options).not.toContain("light");
  });
});
