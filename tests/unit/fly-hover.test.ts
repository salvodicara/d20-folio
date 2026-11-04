/**
 * Which fly speeds can hover, from each source's own SRD 5.2.1 text: "a Fly Speed
 * of 60 feet and can hover" (Fly), "You can hover" (Potion of Flying). A flyer that
 * can't hover falls when knocked Prone while aloft (rules glossary, "Flying").
 */
import { describe, expect, it } from "vitest";

import { getMagicItem } from "@/data/magic-items";
import { getSpellById } from "@/data/spells";
import type { Grant } from "@/lib/grant-schema";

function flySpeeds(grants: ReadonlyArray<Grant> | undefined): Grant[] {
  return (grants ?? []).flatMap((grant): Grant[] => {
    if (grant.type === "fly-speed") return [grant];
    if (grant.type === "while-active") return flySpeeds(grant.grants);
    if (grant.type === "choice-grant-bundle")
      return grant.options.flatMap((option) => flySpeeds(option.grants));
    return [];
  });
}
const hovers = (grants: ReadonlyArray<Grant> | undefined) =>
  flySpeeds(grants).map((g) => g.type === "fly-speed" && g.hover === true);

describe("fly speeds that can hover", () => {
  it.each(["fly", "gaseous-form", "wind-walk"])("the %s spell can hover", (id) => {
    expect(hovers(getSpellById(id)?.grants)).toEqual([true]);
  });

  it.each(["potion-of-flying", "potion-of-gaseous-form", "broom-of-flying"])(
    "%s can hover",
    (id) => {
      expect(hovers(getMagicItem(id)?.grants)).toEqual([true]);
    }
  );

  it("the Ring of Elemental Command's Air option can hover", () => {
    expect(hovers(getMagicItem("ring-of-elemental-command")?.grants)).toContain(true);
  });

  it.each(["winged-boots", "wings-of-flying", "cloak-of-the-bat"])(
    "%s flies without hovering",
    (id) => {
      expect(hovers(getMagicItem(id)?.grants)).toEqual([false]);
    }
  );
});
