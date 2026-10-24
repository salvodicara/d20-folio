/**
 * Which characters need the bestiary at the table: it is no longer in the offline
 * install, so the cockpit warms it (while online) for exactly these. A familiar
 * (Find Familiar), a self-form drawn from the bestiary (True Polymorph,
 * Shapechange), or a spell that raises or calls a creature (Animate Dead, Planar
 * Ally). Polymorph's forms are the Beasts table, which stays in the install.
 */
import { describe, expect, it } from "vitest";

import { usesBestiary } from "@/lib/play/bestiary-use";
import { makeCharacterDoc } from "./_helpers";

const withSpells = (...ids: string[]) =>
  makeCharacterDoc({
    classId: "wizard",
    level: 17,
    spells: ids.map((srdId) => ({ srdId, prepared: true })),
  });

describe("usesBestiary", () => {
  it("a caster of Find Familiar, True Polymorph, Shapechange or Animate Dead does", () => {
    for (const id of ["find-familiar", "true-polymorph", "shapechange", "animate-dead"])
      expect(usesBestiary(withSpells(id)), id).toBe(true);
  });

  it("a summoned familiar does, whatever the spell list", () => {
    const doc = withSpells("fire-bolt");
    doc.session.familiar = { creatureType: "fey" } as never;
    expect(usesBestiary(doc)).toBe(true);
  });

  it("Polymorph (Beasts table) and an ordinary list don't", () => {
    expect(usesBestiary(withSpells("polymorph", "fireball", "magic-missile"))).toBe(
      false
    );
  });
});
