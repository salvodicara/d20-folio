/**
 * Weapon-Mastery riders on the combat attack card. Cases come from the SRD weapon
 * catalogue: EVERY weapon whose `mastery` is set, carried by a Fighter who chose
 * that weapon's mastery, yields exactly its mastery rider (Nick yields none — it
 * reshapes the off-hand economy instead), with Graze's damage and Topple's DC
 * derived from the character (STR 16 → +3, DEX 14 → +2, PB 3 at level 5).
 */
import { describe, it, expect } from "vitest";
import { SRD_WEAPONS } from "@/data/weapons";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { CharacterDoc } from "@/types/character";

const MASTERED = SRD_WEAPONS.filter((w) => w.mastery);

function fighterWith(weaponId: string, mastered = true): CharacterDoc {
  const doc = buildDevScenario("weapon-mastery-numbers");
  if (!doc) throw new Error("scenario missing");
  doc.character.weapons = [{ srdId: weaponId, quantity: 1 }];
  const entry = doc.character.classes[0];
  if (!entry) throw new Error("no class entry");
  entry.weaponMasteries = mastered ? [weaponId] : [];
  return doc;
}

/** The attack ability modifier the SRD rules pick for this weapon. */
function attackMod(w: (typeof MASTERED)[number]): number {
  const str = 3;
  const dex = 2;
  if (w.weaponType === "ranged") return dex;
  const finesse = (w.properties ?? []).some((p) => /^finesse/i.test(p));
  return finesse ? Math.max(str, dex) : str;
}

describe("weapon mastery riders on the attack card", () => {
  it("the catalogue covers all eight 2024 masteries", () => {
    expect(new Set(MASTERED.map((w) => w.mastery?.toLowerCase()))).toEqual(
      new Set(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"])
    );
  });

  it.each(MASTERED.map((w) => [w.id, w.mastery ?? ""] as const))(
    "%s (%s) yields exactly its mastery rider",
    (weaponId, mastery) => {
      const weapon = MASTERED.find((w) => w.id === weaponId);
      if (!weapon) throw new Error("weapon missing");
      const card = localizeActions(fighterWith(weaponId), "it").find(
        (a) => a.id === `weapon-${weaponId}`
      );
      expect(card).toBeDefined();
      const id = mastery.toLowerCase();
      const riders = card?.masteryRiders ?? [];
      if (id === "nick") {
        expect(riders).toEqual([]);
        return;
      }
      expect(riders.map((r) => r.id)).toEqual([id]);
      const rider = riders[0];
      const mod = attackMod(weapon);
      if (id === "graze") expect(rider?.amount).toBe(Math.max(0, mod));
      else expect(rider?.amount).toBeUndefined();
      if (id === "topple") expect(rider?.dc).toBe(8 + mod + 3);
      else expect(rider?.dc).toBeUndefined();
      if (id === "push" || id === "slow") expect(rider?.distance).toBe("3 m");
      if (id === "vex") expect(rider?.apply).toBe("next-attack-advantage");
      else expect(rider?.apply).toBeUndefined();
    }
  );

  it.each(MASTERED.map((w) => w.id))(
    "%s without the mastery chosen yields no rider",
    (weaponId) => {
      const card = localizeActions(fighterWith(weaponId, false), "it").find(
        (a) => a.id === `weapon-${weaponId}`
      );
      expect(card).toBeDefined();
      expect(card?.masteryRiders ?? []).toEqual([]);
    }
  );

  it("names come from the Italian SRD catalogue", () => {
    const topple = localizeActions(fighterWith("quarterstaff"), "it").find(
      (a) => a.id === "weapon-quarterstaff"
    );
    expect(topple?.masteryRiders?.[0]?.name).toBe("Rovesciamento");
  });
});
