/**
 * Companions on the Play screen: each creature the character has on the field, with
 * its Hit Points and AC, and its attacks as rows like the character's own, «Attacca»
 * opening the same damage tray (a melee attack can knock out; a hit applies what the
 * attack does beyond damage, Web Bolt's Speed 0, `companionAttackEffects`).
 */
import { describe, expect, it } from "vitest";
import {
  companionAttackPlan,
  companionHitEffects,
  playCompanions,
} from "@/domains/play/play-companions-view";
import { concentrationValue } from "@/lib/concentration";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const t = (key: string) => key;
const spider: CharacterDoc = {
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    spells: [{ srdId: "giant-insect", prepared: true }],
  },
  session: {
    ...MOCK_CHARACTER.session,
    concentration: concentrationValue("giant-insect"),
    companionVariant: { "giant-insect": "spider" },
  },
};

describe("playCompanions", () => {
  const [insect] = playCompanions(spider, "it", t);
  it("lists the creature on the field, its attacks named", () => {
    expect(insect?.name).toBe("Ragno gigante");
    expect(insect?.spellId).toBe("giant-insect");
    expect(insect?.attacks.map((a) => a.id)).toEqual(["poison-jab", "web-bolt"]);
  });

  it("a melee attack's tray can knock out; a ranged one can't", () => {
    const [jab, bolt] = insect?.attacks ?? [];
    expect(jab && companionAttackPlan(jab, ["m1"])).toMatchObject({
      effect: "damage",
      damageType: "piercing",
      melee: true,
      attack: { onMiss: "none" },
      targets: ["m1"],
    });
    expect(bolt && companionAttackPlan(bolt, ["m1"])).toMatchObject({
      damageType: "bludgeoning",
    });
    expect(bolt && companionAttackPlan(bolt, ["m1"]).melee).toBeUndefined();
  });

  it("a Web Bolt hit stops the target until the insect's next turn", () => {
    const bolt = insect?.attacks.find((a) => a.id === "web-bolt");
    const effects =
      insect && bolt
        ? companionHitEffects(insect, bolt, {
            actor: { kind: "pc", combatantId: "pc-me", memberUid: "u", characterId: "c" },
            target: { kind: "monster", combatantId: "m1" },
            round: 2,
            effectId: (i) => `e${String(i)}`,
          })
        : [];
    expect(effects).toHaveLength(1);
    expect(effects[0]?.target).toEqual({ kind: "monster", combatantId: "m1" });
    expect(effects[0]?.payload).toEqual({
      kind: "grant-group",
      activeKey: "giant-insect-web-bolt",
    });
    expect(effects[0]?.duration).toMatchObject({ round: 3, phase: "turn-start" });
  });

  it("no creature on the field, nothing to show", () => {
    expect(playCompanions(MOCK_CHARACTER, "it", t)).toEqual([]);
  });
});
