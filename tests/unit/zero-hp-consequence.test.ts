/**
 * A consequence of being reduced to 0 Hit Points (edge-case M7): Disintegrate's
 * target is disintegrated, but a zero-HP saver that drops it to 1 instead
 * (Relentless Endurance) means it never was (SAC #117). The consequence waits for
 * the savers; it applies only once the character stays at 0 with none left.
 */
import { afterEach, describe, expect, it } from "vitest";

import { asRaceId } from "@/data/srd-names";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { reviveEligibility } from "@/lib/play/revive";
import { settleZeroHpConsequence, spendZeroHpSaver } from "@/lib/play/zero-hp-savers";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const DUST = { kind: "disintegrated", sourceId: "disintegrate" } as const;

const pc = (raceId: string, relentlessUsed = 0): CharacterDoc =>
  makeCharacterDoc(
    { race: asRaceId(raceId), classId: "fighter", level: 5 },
    {
      hp: { current: 10, temp: 0 },
      ...(relentlessUsed
        ? { trackers: { "race:orc:relentless-endurance": { used: relentlessUsed } } }
        : {}),
    }
  );

const hitBy = (doc: CharacterDoc, amount: number) =>
  applySheetEvent(doc, { kind: "take-damage", amount, onZeroHp: DUST });

afterEach(() => useCharacterStore.setState({ character: null }));

describe("a consequence at 0 HP waits for the savers", () => {
  it("no saver: the hit that drops to 0 disintegrates at once", () => {
    const after = hitBy(pc("human"), 40);
    expect(after?.session.deathFail).toBe(3);
    expect(after?.session.death).toMatchObject({ disintegrated: true });
  });

  it("Relentless Endurance on offer: pending; used, the character stands and stays whole", () => {
    const down = hitBy(pc("orc"), 40);
    if (!down) throw new Error("no hit");
    expect(down.session.deathFail).toBe(0);
    expect(down.session.zeroHpDrop?.consequence).toEqual(DUST);
    const use = spendZeroHpSaver(down, "race:orc:relentless-endurance");
    if (!use) throw new Error("no saver");
    const after = settleZeroHpConsequence({ ...down, session: use.session });
    expect(after.session.hp.current).toBe(1);
    expect(after.session.death).toBeUndefined();
    expect(after.session.zeroHpDrop?.consequence).toBeUndefined();
  });

  it("Relentless Endurance already spent: dust", () => {
    const after = hitBy(pc("orc", 1), 40);
    expect(after?.session.death).toMatchObject({ disintegrated: true });
  });

  it("damage that doesn't reach 0 leaves nothing pending", () => {
    const after = hitBy(pc("human"), 3);
    expect(after?.session.hp.current).toBe(7);
    expect(after?.session.zeroHpDrop).toBeUndefined();
  });

  it("the store's own damage path settles it too", () => {
    useCharacterStore.setState({ character: pc("human"), loading: false, error: null });
    useCharacterStore.getState().applyDamage(40, { onZeroHp: DUST });
    expect(useCharacterStore.getState().character?.session.death).toMatchObject({
      disintegrated: true,
    });
  });
});

describe("only a spell that brings back dust revives it", () => {
  it("Raise Dead can't; True Resurrection can", () => {
    const dust = hitBy(pc("human"), 40);
    if (!dust) throw new Error("no hit");
    expect(reviveEligibility(dust, 14400)).toEqual({ kind: "dust" });
    expect(reviveEligibility(dust, 105120000, true)).toMatchObject({
      kind: "dead",
      within: true,
    });
  });
});

describe("Disintegrate carries it to the tray", () => {
  it("the real cast's tray plan says a target reduced to 0 is disintegrated", async () => {
    const { resolveActions } = await import("@/lib/smart-tracker");
    const { localizeAction } = await import("@/lib/views/combat-action-view");
    const { damageTrayPlan } = await import("@/lib/play/damage-tray");
    const wizard = makeCharacterDoc({
      classId: "wizard",
      level: 11,
      spells: [{ srdId: "disintegrate", prepared: true }],
      spellSlots: [{ level: 6, total: 1 }],
    });
    const raw = resolveActions(wizard).find((a) => a.spellId === "disintegrate");
    const cast = raw ? localizeAction(raw, "en") : undefined;
    if (!cast) throw new Error("no Disintegrate");
    expect(damageTrayPlan(cast, ["monster-1"], "pc-me")?.onZeroHp).toBe("disintegrated");
  });
});
