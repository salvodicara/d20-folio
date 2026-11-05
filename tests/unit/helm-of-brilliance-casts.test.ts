/**
 * Helm of Brilliance: each of its four spells is cast with one gem of its type, at
 * the text's save DC, and each gem stock is the roll the text sets.
 */
import { describe, expect, it } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import { srd } from "../_harness/loc";

const id = "helm-of-brilliance";
const text = () => srd("magic-item", id, "description", "en");

const GEMS = {
  diamonds: "diamond",
  rubies: "ruby",
  "fire-opals": "fire opal",
  opals: "opal",
};

describe("Helm of Brilliance", () => {
  it("rolls each gem stock as its text says", () => {
    const resources = getMagicItem(id)?.resources ?? [];
    for (const gems of Object.keys(GEMS)) {
      const label = gems.replace("-", " ");
      const m = new RegExp(`(\\d+)d(\\d+) ${label}`).exec(text());
      expect(m, gems).not.toBeNull();
      expect(resources.find((r) => r.id === gems)?.capacity, gems).toEqual({
        kind: "entered-roll",
        roll: { dice: Number(m?.[1]), sides: Number(m?.[2]) },
      });
    }
  });

  it("casts each listed spell with one gem of its type at the text's save DC", () => {
    const dc = Number(/save DC (\d+)/.exec(text())?.[1]);
    const casts = (getMagicItem(id)?.grants ?? []).filter(
      (g) => g.type === "free-cast-spell"
    );
    const listed = [
      ...text().matchAll(
        /([A-Z][a-z]+(?: [A-Za-z]+)*) \((opal|fire opal|diamond|ruby)\)/g
      ),
    ];
    expect(listed).toHaveLength(4);
    for (const [, spellName, gem] of listed) {
      const resourceId = Object.entries(GEMS).find(([, g]) => g === gem)?.[0];
      const spellId = spellName?.toLowerCase().replace(/ /g, "-");
      expect(casts, `${spellName}`).toContainEqual({
        type: "free-cast-spell",
        spellId,
        resourceCost: { resourceId },
        castOverrides: { saveDC: dc },
      });
    }
  });
});
