/**
 * Edge-case family M1 (docs/architecture/2026-11-edge-cases.md): a hit someone else lands
 * on a PC — the DM's monster, the DM's party card, an ally's area spell — goes through the
 * target's own damage rule, exactly as the player's own entry does. Before, it only
 * subtracted: no Unconscious, no death-save failure, no instant death, no concentration
 * save.
 */
import { describe, expect, it } from "vitest";

import { defaultCombatState } from "@/lib/combat-state";
import { concentrationValue } from "@/lib/concentration";
import { peerDamageState } from "@/lib/play/peer-damage";
import type { CharacterDoc } from "@/types/character";
import type { CombatState } from "@/types/combat-state";

import { makeCharacterDoc } from "./_helpers";

/** A level-5 fighter (max 44 HP here) with its combat state, at `hp`. */
function target(hp: { current: number; temp?: number }, concentrating = false) {
  const doc: CharacterDoc = makeCharacterDoc(
    { classId: "fighter", level: 5 },
    {
      hp: { current: hp.current, temp: hp.temp ?? 0 },
      ...(concentrating ? { concentration: concentrationValue("bless") } : {}),
    }
  );
  const max = doc.character.hp.max;
  const combat: CombatState = {
    ...defaultCombatState(max),
    hp: { current: hp.current, temp: hp.temp ?? 0 },
  };
  return { doc, combat, max };
}

describe("a hit from someone else lands through the target's own rule", () => {
  it("dropping a standing PC to 0 leaves them Unconscious, dying", () => {
    const { doc, combat } = target({ current: 5 });
    const next = peerDamageState(doc, combat, 9);
    expect(next.hp.current).toBe(0);
    expect(next.conditions).toContain("unconscious");
    expect(next.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("a hit on a PC already at 0 is a death-save failure", () => {
    const { doc, combat } = target({ current: 0 });
    const next = peerDamageState(
      { ...doc, session: { ...doc.session, conditions: ["unconscious"] } },
      { ...combat, conditions: ["unconscious"] },
      3
    );
    expect(next.deathSaves.failures).toBe(1);
  });

  it("a critical hit on a PC at 0 is two failures", () => {
    const { doc, combat } = target({ current: 0 });
    const next = peerDamageState(doc, combat, 3, { crit: true });
    expect(next.deathSaves.failures).toBe(2);
  });

  it("damage past 0 of at least the hit-point maximum kills outright", () => {
    const { doc, combat, max } = target({ current: 4 });
    const next = peerDamageState(doc, combat, 4 + max);
    expect(next.deathSaves.failures).toBe(3);
  });

  it("temporary hit points take the hit first", () => {
    const { doc, combat } = target({ current: 20, temp: 6 });
    const next = peerDamageState(doc, combat, 8);
    expect(next.hp).toMatchObject({ current: 18, temp: 0 });
  });

  it("a concentrating PC still standing gets a Concentration save to roll", () => {
    const { doc, combat } = target({ current: 30 }, true);
    const next = peerDamageState(doc, combat, 24);
    expect(next.pendingConcentrationSaves).toEqual([
      expect.objectContaining({
        spell: concentrationValue("bless"),
        damage: 24,
        difficultyClass: 12,
      }),
    ]);
  });

  it("a concentrating PC dropped to 0 gets no save (the sheet ends Concentration)", () => {
    const { doc, combat } = target({ current: 5 }, true);
    expect(peerDamageState(doc, combat, 9).pendingConcentrationSaves ?? []).toEqual([]);
  });

  it("a hit that does nothing leaves the state as it was", () => {
    const { doc, combat } = target({ current: 30 });
    expect(peerDamageState(doc, combat, 0)).toEqual(combat);
  });
});
