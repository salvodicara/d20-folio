/**
 * The hand-set numbers' write moves (#1230, gap map E2): the new Play screen's number
 * panes «Personalizza» and the classic sheet write a hand-set number the same way.
 * Cases come from the stored fields themselves: AC keeps its roster snapshot (`ac`) in
 * step and goes back to the computed AC on reset; a skill or save reset drops its key
 * (not a null); an ability pin lives in its own map; the sheet's numbers then show the
 * hand-set total with a manual-adjustment line; undo puts back exactly what was there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { setNumberOverride, storedOverride } from "@/features/character/number-overrides";
import { MOCK_CHARACTER } from "@/lib/mock";
import { deriveMaxHp } from "@/lib/aggregate-character";
import { isHandSet } from "@/lib/value-breakdown";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

const live = () => useCharacterStore.getState().character as CharacterDoc;

function load(edit: (doc: CharacterDoc) => void = () => {}): void {
  const doc = structuredClone(MOCK_CHARACTER);
  edit(doc);
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
}

beforeEach(() => useUndoStore.getState().clear());

describe("AC", () => {
  it("a hand-set AC is the sheet's AC, keeps the roster snapshot in step, and is explained", () => {
    load();
    setNumberOverride({ kind: "ac" }, 21, "AC");
    expect(live().character.acOverride).toBe(21);
    expect(live().character.ac).toBe(21);
    const ac = sheetNumbers(live()).ac;
    expect(ac.total).toBe(21);
    expect(isHandSet(ac.parts)).toBe(true);
  });

  it("reset goes back to the computed AC, snapshot included", () => {
    // The mock's AC is hand-set: start from the computed one.
    load((doc) => {
      doc.character.acOverride = null;
    });
    const computed = sheetNumbers(live()).ac.total;
    setNumberOverride({ kind: "ac" }, computed + 5, "AC");
    setNumberOverride({ kind: "ac" }, null, "AC");
    expect(live().character.acOverride).toBeNull();
    expect(live().character.ac).toBe(computed);
    expect(sheetNumbers(live()).ac.total).toBe(computed);
  });
});

describe("single-field numbers", () => {
  it("initiative, speed (feet) and proficiency set and reset their own field", () => {
    load();
    setNumberOverride({ kind: "initiative" }, 7, "x");
    setNumberOverride({ kind: "speed" }, 45, "x");
    setNumberOverride({ kind: "proficiency" }, 5, "x");
    const n = sheetNumbers(live());
    expect([n.initiative.total, n.speed.total, n.proficiencyBonus.total]).toEqual([
      7, 45, 5,
    ]);
    expect(storedOverride(live().character, { kind: "speed" })).toBe(45);
    setNumberOverride({ kind: "speed" }, null, "x");
    expect(live().character.speedOverride).toBeNull();
    expect(storedOverride(live().character, { kind: "speed" })).toBeNull();
  });
});

describe("map-keyed numbers", () => {
  it("a skill pin is its total; reset drops the key and keeps the others", () => {
    load((doc) => {
      doc.character.skillBonusOverrides = { stealth: 9 };
    });
    setNumberOverride({ kind: "skill", id: "athletics" }, 11, "x");
    expect(sheetNumbers(live()).skills.find((s) => s.id === "athletics")?.total).toBe(11);
    setNumberOverride({ kind: "skill", id: "athletics" }, null, "x");
    expect(live().character.skillBonusOverrides).toEqual({ stealth: 9 });
  });

  it("a save pin is its total; reset drops the key", () => {
    load();
    setNumberOverride({ kind: "save", ability: "WIS" }, 8, "x");
    expect(sheetNumbers(live()).saves.find((s) => s.ability === "WIS")?.total).toBe(8);
    setNumberOverride({ kind: "save", ability: "WIS" }, null, "x");
    expect("WIS" in (live().character.savingThrowBonusOverrides ?? {})).toBe(false);
  });

  it("an ability pin sets the effective score", () => {
    load();
    setNumberOverride({ kind: "ability", ability: "STR" }, 19, "x");
    expect(sheetNumbers(live()).abilities.STR.total).toBe(19);
    expect(storedOverride(live().character, { kind: "ability", ability: "STR" })).toBe(
      19
    );
  });
});

describe("undo", () => {
  it("puts back exactly what was there", () => {
    load((doc) => {
      doc.character.acOverride = null;
    });
    const before = live().character;
    setNumberOverride({ kind: "ac" }, 25, "AC");
    useUndoStore.getState().undo();
    expect(live().character.acOverride).toBe(before.acOverride);
    expect(live().character.ac).toBe(before.ac);
  });

  it("is inert on a read-only sheet", () => {
    load();
    useCharacterStore.setState({ readonly: true });
    setNumberOverride({ kind: "proficiency" }, 6, "x");
    expect(live().character.proficiencyBonusOverride).not.toBe(6);
  });
});

describe("a CON pin moves max HP (#1318)", () => {
  it("pinning CON re-derives the max with the pin; undo puts both back", () => {
    load((doc) => {
      doc.character.hp = { max: deriveMaxHp(doc.character) };
    });
    const before = live().character.hp.max;
    const con = live().character.abilityScores.CON;
    setNumberOverride({ kind: "ability", ability: "CON" }, con + 4, "CON");
    expect(live().character.hp.max).toBe(deriveMaxHp(live().character));
    expect(live().character.hp.max).toBeGreaterThan(before);
    useUndoStore.getState().undo();
    expect(live().character.hp.max).toBe(before);
  });
});

describe("max HP is hand-set as its input (#1315): a bonus over the derived max", () => {
  const derived = () => {
    load((doc) => {
      doc.character.hpBonus = undefined;
      doc.character.hp = { max: deriveMaxHp(doc.character) };
    });
    return live().character.hp.max;
  };

  it("a computed max HP has no stored value", () => {
    derived();
    expect(storedOverride(live().character, { kind: "maxHp" })).toBeNull();
  });

  it("a hand-set max is the sheet's max, stored as the bonus, and explained", () => {
    const max = derived();
    setNumberOverride({ kind: "maxHp" }, max + 7, "HP");
    expect(live().character.hpBonus).toBe(7);
    expect(live().character.hp.max).toBe(max + 7);
    expect(storedOverride(live().character, { kind: "maxHp" })).toBe(max + 7);
    expect(sheetNumbers(live()).maxHp.total).toBe(max + 7);
  });

  it("the bonus survives a CON change: the max still moves with it", () => {
    const max = derived();
    setNumberOverride({ kind: "maxHp" }, max + 7, "HP");
    const con = live().character.abilityScores.CON;
    setNumberOverride({ kind: "ability", ability: "CON" }, con + 2, "CON");
    expect(live().character.hp.max).toBe(deriveMaxHp(live().character));
    expect(live().character.hp.max).toBeGreaterThan(max + 7);
  });

  it("reset drops the bonus and re-derives the max; undo puts the hand-set max back", () => {
    const max = derived();
    setNumberOverride({ kind: "maxHp" }, max + 7, "HP");
    setNumberOverride({ kind: "maxHp" }, null, "HP");
    expect(live().character.hpBonus).toBeUndefined();
    expect(live().character.hp.max).toBe(max);
    useUndoStore.getState().undo();
    expect(live().character.hp.max).toBe(max + 7);
    expect(live().character.hpBonus).toBe(7);
  });
});

it("a stored max that differs from the derived one counts as hand-set too (as its breakdown says)", () => {
  load((doc) => {
    doc.character.hpBonus = undefined;
    doc.character.hp = { max: deriveMaxHp(doc.character) - 4 };
  });
  const c = live().character;
  expect(storedOverride(c, { kind: "maxHp" })).toBe(c.hp.max);
  expect(isHandSet(sheetNumbers(live()).maxHp.parts)).toBe(true);
  setNumberOverride({ kind: "maxHp" }, null, "HP");
  expect(live().character.hp.max).toBe(deriveMaxHp(live().character));
});
