/**
 * The zero-HP savers (edge-case family M7, docs/architecture/2026-11-edge-cases.md):
 * every "when you drop to 0 Hit Points but aren't killed outright" feature is one
 * grant shape. It may spend a use, need a state to be on, ask a saving throw the
 * player rolls, and set the Hit Points it leaves you at. The player picks which to
 * try, in the order they choose.
 *
 * Cases from the corpus (category 10, Death and revival): Relentless Rage (CON save,
 * DC +5 per use, rest reset, HP = 2 × level) and the order of several savers.
 */
import { describe, expect, it } from "vitest";

import { takeDamage } from "@/lib/play/damage";
import { longRestCharacter, shortRestCharacter } from "@/lib/play/rests";
import { setHp } from "@/lib/play/vitals";
import {
  spendZeroHpSaver as spend,
  zeroHpSavers,
  type ZeroHpSaveResult,
} from "@/lib/play/zero-hp-savers";
import type { CharacterDoc, SessionState } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const RAGE = "barbarian-relentless-rage";
const ENDURANCE = "race:orc:relentless-endurance";

/** A raging Barbarian standing at 5 HP. */
function barbarian(level: number, session: Partial<SessionState> = {}): CharacterDoc {
  const doc = makeCharacterDoc(
    {
      classId: "barbarian",
      level,
      abilityScores: { STR: 18, DEX: 14, CON: 16, INT: 8, WIS: 10, CHA: 8 },
    },
    { hp: { current: 5, temp: 0 }, activeFeatures: ["barbarian-rage"], ...session }
  );
  // The build lists the class features the character has reached.
  const features = [
    { srdId: "barbarian-rage" },
    ...(level >= 11 ? [{ srdId: RAGE }] : []),
  ];
  return { ...doc, character: { ...doc.character, hp: { max: 120 }, features } };
}

/** The character after a hit that drops it to 0 (not killed outright). */
function fall(doc: CharacterDoc): CharacterDoc {
  const taken = takeDamage(doc, doc.session.hp.current + 10);
  if (!taken) throw new Error("the hit changed nothing");
  return { ...doc, session: taken.session };
}

function spendZeroHpSaver(
  doc: CharacterDoc,
  sourceId: string,
  result?: ZeroHpSaveResult
): SessionState | null {
  return spend(doc, sourceId, result)?.session ?? null;
}

const after = (doc: CharacterDoc, session: SessionState | null): CharacterDoc => {
  if (!session) throw new Error("the saver was not usable");
  return { ...doc, session };
};

const orc = (doc: CharacterDoc): CharacterDoc => ({
  ...doc,
  character: { ...doc.character, race: "orc" as CharacterDoc["character"]["race"] },
});

const saver = (doc: CharacterDoc, sourceId: string) =>
  zeroHpSavers(doc).find((s) => s.sourceId === sourceId);

describe("Relentless Rage (corpus: Relentless Rage; Relentless Rage escalating DC)", () => {
  it("a Barbarian 11 who falls while raging may try a DC 10 Constitution save to stand at 22 HP", () => {
    expect(saver(fall(barbarian(11)), RAGE)).toEqual({
      sourceId: RAGE,
      save: { ability: "CON", dc: 10 },
      hitPoints: 22,
    });
  });

  it("the fall records the Rage, so the saver holds even once the fall ends it", () => {
    const down = fall(barbarian(11));
    const rageEnded = {
      ...down,
      session: { ...down.session, activeFeatures: [] },
    };
    expect(saver(rageEnded, RAGE)?.save?.dc).toBe(10);
  });

  it("is not offered below level 11, without Rage at the fall, above 0 HP, or when killed outright", () => {
    expect(saver(fall(barbarian(10)), RAGE)).toBeUndefined();
    expect(saver(fall(barbarian(11, { activeFeatures: [] })), RAGE)).toBeUndefined();
    expect(saver(barbarian(11), RAGE)).toBeUndefined();
    const dead = fall(barbarian(11));
    expect(
      saver({ ...dead, session: { ...dead.session, deathFail: 3 } }, RAGE)
    ).toBeUndefined();
  });

  it("a passed save sets HP to twice the Barbarian level and ends the dying state", () => {
    const down = fall(barbarian(11));
    const dying = { ...down, session: { ...down.session, deathSucc: 1, deathFail: 2 } };
    const session = spendZeroHpSaver(dying, RAGE, "success");
    expect(session?.hp.current).toBe(22);
    expect(session?.conditions).not.toContain("unconscious");
    expect(session?.deathSucc).toBe(0);
    expect(session?.deathFail).toBe(0);
  });

  it("a failed save leaves you dying, counts as a use, and is not offered again on this fall", () => {
    const down = fall(barbarian(11));
    const failed = after(down, spendZeroHpSaver(down, RAGE, "failure"));
    expect(failed.session.hp.current).toBe(0);
    expect(failed.session.conditions).toContain("unconscious");
    expect(failed.session.zeroHpSaverUses).toEqual({ [RAGE]: 1 });
    expect(saver(failed, RAGE)).toBeUndefined();
  });

  it("each use raises the DC by 5", () => {
    const down = fall(barbarian(11));
    const first = after(down, spendZeroHpSaver(down, RAGE, "success"));
    const second = fall(first);
    expect(saver(second, RAGE)?.save?.dc).toBe(15);
    const third = fall(after(second, spendZeroHpSaver(second, RAGE, "success")));
    expect(saver(third, RAGE)?.save?.dc).toBe(20);
  });

  it("a Short or Long Rest resets the DC to 10", () => {
    const used = barbarian(11, { zeroHpSaverUses: { [RAGE]: 2 } });
    expect(saver(fall(used), RAGE)?.save?.dc).toBe(20);
    const raging = (doc: CharacterDoc): CharacterDoc => ({
      ...doc,
      session: {
        ...doc.session,
        hp: { current: 5, temp: 0 },
        activeFeatures: ["barbarian-rage"],
      },
    });
    expect(saver(fall(raging(shortRestCharacter(used))), RAGE)?.save?.dc).toBe(10);
    expect(saver(fall(raging(longRestCharacter(used))), RAGE)?.save?.dc).toBe(10);
  });

  it("a save-gated saver needs the result; without it nothing changes", () => {
    expect(spendZeroHpSaver(fall(barbarian(11)), RAGE)).toBeNull();
  });

  it("setting HP to 0 by hand is a fall too; regaining HP clears it", () => {
    const set = barbarian(11);
    const down = { ...set, session: setHp(set, 0) };
    expect(saver(down, RAGE)?.save?.dc).toBe(10);
    const up = { ...down, session: setHp(down, 3) };
    expect(up.session.zeroHpDrop).toBeUndefined();
  });
});

describe("several savers (corpus: Relentless Rage — the player picks the order)", () => {
  it("an Orc Barbarian who falls is offered both, and may try the Rage save first", () => {
    const doc = fall(orc(barbarian(11)));
    expect(
      zeroHpSavers(doc)
        .map((s) => s.sourceId)
        .sort()
    ).toEqual([RAGE, ENDURANCE].sort());

    // The Rage save fails: Relentless Endurance is still there.
    const failed = after(doc, spendZeroHpSaver(doc, RAGE, "failure"));
    expect(saver(failed, ENDURANCE)).toEqual({
      sourceId: ENDURANCE,
      trackerId: ENDURANCE,
      hitPoints: 1,
    });
    const standing = spendZeroHpSaver(failed, ENDURANCE);
    expect(standing?.hp.current).toBe(1);
    expect(standing?.trackers[ENDURANCE]?.used).toBe(1);
  });

  it("a spent use is not offered again", () => {
    const doc = fall(orc(barbarian(3, { trackers: { [ENDURANCE]: { used: 1 } } })));
    expect(saver(doc, ENDURANCE)).toBeUndefined();
    expect(spendZeroHpSaver(doc, ENDURANCE)).toBeNull();
  });

  it("a character who fell before this version (no drop record) is offered what applies now", () => {
    const doc = fall(orc(barbarian(3)));
    const legacy = { ...doc, session: { ...doc.session, zeroHpDrop: undefined } };
    expect(saver(legacy, ENDURANCE)?.hitPoints).toBe(1);
  });
});
