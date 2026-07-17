/**
 * False Life per-spell temp-HP roll-entry — the spell-cast twin of the S8 heal
 * roll-entry (Second Wind) and the G22 Monk temp-HP rider. Pins:
 *   1. the DATA: `false-life` carries `tempHpRoll:{dice:"2d4",bonus:4,bonusPerUpcast:5}`
 *      (2024 RAW: "You gain 2d4 + 4 Temporary Hit Points", +5/slot level above 1st).
 *   2. the ENGINE (normal caster, no Fiendish Vigor): the spell card exposes
 *      `summary.tempHpApply = { dice:"2d4", bonus:4 }` — a ROLL-ENTRY (golden rule
 *      21: the app never rolls; +4 is the deterministic part it adds).
 *   3. the ENGINE (Warlock Fiendish Vigor): the SAME spell card exposes the
 *      dice-FREE `summary.tempHpApply = { bonus:12 }` — a one-tap of the maximized
 *      total (2d4+4 → 12), NOT a roll (S8: a deterministic number MAY one-tap).
 *   4. the APPLY seam: `gainTempHp` is MAX-WINS (temp HP don't stack) and the
 *      prior pool is restorable (`setTempHP`) — the undo the PlayTab card wires.
 *
 * Pure engine assertions run against the producing presenter (`localizeActions`),
 * not a DOM mount (golden rule 13). Fail-before: no `tempHpApply` field existed —
 * cases 2/3 read `undefined`.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { localizeActions } from "@/lib/views/combat-action-view";
import { spellIndex } from "@/data/spells";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

/**
 * A caster carrying False Life — the mock's own class features / equipment are
 * cleared so the ONLY grant source is the chosen invocation (isolates the
 * Fiendish-Vigor maximize path). Without the invocation, False Life is prepared
 * explicitly so the combat card still surfaces it (the normal roll-entry path).
 */
function casterWithFalseLife(opts: { fiendishVigor: boolean }): CharacterDoc {
  const c = structuredClone(MOCK_CHARACTER);
  c.character.features = [];
  c.character.equipment = [];
  c.character.classes = c.character.classes.map((e, i) =>
    i === 0
      ? {
          ...e,
          maneuverChoices: [],
          invocationChoices: opts.fiendishVigor ? ["fiendish-vigor"] : [],
        }
      : e
  );
  if (!opts.fiendishVigor) {
    // No invocation grants False Life here → prepare it explicitly so it's castable.
    c.character.spells = [...c.character.spells, { srdId: "false-life", prepared: true }];
  }
  return c;
}

const falseLifeCard = (c: CharacterDoc) =>
  localizeActions(c, "en").find((a) => a.id === "spell-false-life");

describe("False Life — data", () => {
  it("carries tempHpRoll { dice: 2d4, bonus: 4, bonusPerUpcast: 5 } (2024 RAW)", () => {
    expect(spellIndex.get("false-life")?.tempHpRoll).toEqual({
      dice: "2d4",
      bonus: 4,
      bonusPerUpcast: 5,
    });
  });
});

describe("False Life — engine roll-entry (normal cast)", () => {
  it("a normal caster's False Life card exposes tempHpApply = { dice: 2d4, bonus: 4 }", () => {
    const card = falseLifeCard(casterWithFalseLife({ fiendishVigor: false }));
    expect(card, "False Life should surface as a spell action card").toBeTruthy();
    // Roll-entry: the 2d4 the PLAYER supplies + the deterministic +4 the app adds.
    expect(card?.summary.tempHpApply).toEqual({ dice: "2d4", bonus: 4 });
  });
});

describe("False Life — engine one-tap (Fiendish Vigor maximizes)", () => {
  it("a Fiendish Vigor Warlock's False Life card one-taps the maximized 12 (no dice)", () => {
    const card = falseLifeCard(casterWithFalseLife({ fiendishVigor: true }));
    expect(card, "Fiendish Vigor injects always-prepared False Life").toBeTruthy();
    // Dice-free: the maximized total 2d4+4 → 12 applies in ONE tap (no roll field).
    expect(card?.summary.tempHpApply).toEqual({ bonus: 12 });
    expect(card?.summary.tempHpApply?.dice).toBeUndefined();
  });
});

describe("False Life — apply seam (gainTempHp max-wins + undoable)", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  it("gains enteredRoll + bonus, keeps the higher pool (max-wins), and undoes to the prior pool", () => {
    const c = structuredClone(MOCK_CHARACTER);
    c.session.hp.temp = 0;
    const store = useCharacterStore.getState();
    store.setCharacter(c);

    // A rolled 2d4 = 4 → apply enteredRoll(4) + bonus(4) = 8 Temp HP.
    const prevTemp = useCharacterStore.getState().character?.session.hp.temp ?? 0;
    useCharacterStore.getState().gainTempHp(4 + 4);
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(8);

    // Max-wins: a lower subsequent grant (a weak reroll of 3+4=7) does NOT stack.
    useCharacterStore.getState().gainTempHp(7);
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(8);

    // A higher grant (Fiendish Vigor's 12) DOES win.
    useCharacterStore.getState().gainTempHp(12);
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(12);

    // Undo restores the exact prior pool (the seam the PlayTab toast wires).
    useCharacterStore.getState().setTempHP(prevTemp);
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(0);
  });
});
