import { describe, expect, it } from "vitest";
import { getBeast } from "@/data/beasts";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { assumeBeastForm } from "@/lib/play/forms";
import { applySheetEvent } from "@/lib/play/sheet-events";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const ring = { srdId: "ring-of-protection", equipped: true, attuned: true, quantity: 1 };

function shifted(sourceId: string, wornGear?: string[]): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "druid", level: 5, equipment: [ring] });
  const wolf = getBeast("wolf");
  if (!wolf) throw new Error("no wolf");
  const next = assumeBeastForm(doc, wolf, sourceId).doc;
  const form = next.session.activeForm;
  if (!form) throw new Error("no form");
  return wornGear
    ? { ...next, session: { ...next.session, activeForm: { ...form, wornGear } } }
    : next;
}

const saves = (doc: CharacterDoc) =>
  aggregateCharacterGrants(doc.character, doc.session).saveBonusFlat;

describe("gear in a form", () => {
  it("merges into a Wild Shape form and has no effect", () => {
    expect(saves(shifted("druid-wild-shape"))).toBe(0);
  });

  it("keeps working when the table rules it still worn", () => {
    expect(saves(shifted("druid-wild-shape", ["ring-of-protection"]))).toBe(1);
  });

  it("the table's ruling is a sheet event, and it can be taken back", () => {
    const merged = shifted("druid-wild-shape");
    const worn = applySheetEvent(merged, {
      kind: "set-form-gear-worn",
      key: "ring-of-protection",
      worn: true,
    });
    if (!worn) throw new Error("no change");
    expect(saves(worn)).toBe(1);
    const back = applySheetEvent(worn, {
      kind: "set-form-gear-worn",
      key: "ring-of-protection",
      worn: false,
    });
    expect(back && saves(back)).toBe(0);
    expect(back?.session.activeForm).not.toHaveProperty("wornGear");
  });

  it("is untouched by a form that says nothing about gear (Polymorph)", () => {
    expect(saves(shifted("polymorph"))).toBe(1);
  });
});

describe("gear ruling persistence", () => {
  it("round-trips through the stored session", async () => {
    const { sessionToState, stateToSession } = await import("@/lib/session-state-codec");
    const doc = shifted("druid-wild-shape", ["ring-of-protection"]);
    const back = stateToSession(
      JSON.parse(JSON.stringify(sessionToState(doc.session))) as Record<string, unknown>
    );
    expect(back.activeForm?.wornGear).toEqual(["ring-of-protection"]);
  });
});
