/**
 * 2024 multiclassing: each prepared spell belongs to one of your classes and casts with
 * that class's ability (#646 `viaClass`). «Gestisci incantesimi» lets a multiclass
 * caster say which class a spell shared by two of them comes through.
 */
import { describe, expect, it } from "vitest";
import { prepareList } from "@/domains/play/play-spells-view";
import { setViaClass } from "@/lib/play/spell-prep";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({
  classes: [
    { classId: "cleric", level: 5 },
    { classId: "bard", level: 3 },
  ],
  spells: [
    { srdId: "cure-wounds", prepared: true },
    { srdId: "bless", prepared: true },
  ],
});
const spell = (d: typeof doc, id: string) =>
  prepareList(d, "it")
    .levels.flatMap((l) => l.spells)
    .find(
      (s) => s.idx === d.character.spells.findIndex((r) => "srdId" in r && r.srdId === id)
    );

describe("a spell two of your classes share", () => {
  it("offers each of them, none chosen yet", () => {
    expect(spell(doc, "cure-wounds")?.via).toEqual({
      options: [
        { classId: "cleric", label: "Chierico" },
        { classId: "bard", label: "Bardo" },
      ],
      current: null,
    });
  });

  it("a spell only one class has offers nothing", () => {
    expect(spell(doc, "bless")?.via).toBeUndefined();
  });

  it("the choice is stored on that copy", () => {
    const next = setViaClass(doc, 0, "bard");
    expect(next?.character.spells[0]).toMatchObject({
      srdId: "cure-wounds",
      viaClass: "bard",
    });
    expect(spell(next ?? doc, "cure-wounds")?.via?.current).toBe("bard");
  });

  it("choosing it again clears it (back to the automatic class)", () => {
    const once = setViaClass(doc, 0, "bard");
    const twice = once ? setViaClass(once, 0, "bard") : null;
    expect(twice?.character.spells[0]).not.toHaveProperty("viaClass");
  });
});
