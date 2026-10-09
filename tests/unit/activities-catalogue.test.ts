/**
 * `catalogueActivities` — every active mechanic in the catalogue as one Activity,
 * the list the public SRD catalogue and `@d20-folio/core` publish. Cases come from
 * the catalogue's own enumerations, so a new entry is covered without a list here.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { SRD_WEAPONS } from "@/data/weapons";
import { translateWeapon } from "@/lib/activities";
import {
  catalogueActions,
  catalogueActivities,
  catalogueBeastAttacks,
  catalogueCompanionAttacks,
  catalogueItemActivations,
  catalogueMonsterEntries,
} from "@/lib/activities/catalogue";

describe("catalogueActivities", () => {
  it("holds one Activity per spell, action, monster entry, form attack, activation and weapon", async () => {
    const all = await catalogueActivities();
    const expected =
      spells.length +
      catalogueActions().length +
      (await catalogueMonsterEntries()).length +
      catalogueBeastAttacks().length +
      catalogueCompanionAttacks().length +
      catalogueItemActivations().length +
      SRD_WEAPONS.length;
    expect(all.length).toBe(expected);
    const ids = new Set(all.map(({ activity }) => activity.id));
    for (const spell of spells) expect(ids.has(`spell:${spell.id}`), spell.id).toBe(true);
    for (const weapon of SRD_WEAPONS) {
      expect(ids.has(`weapon:${weapon.id}`), weapon.id).toBe(true);
    }
  });

  it("gives every activity its own id", async () => {
    const counts = new Map<string, number>();
    for (const { activity } of await catalogueActivities()) {
      counts.set(activity.id, (counts.get(activity.id) ?? 0) + 1);
    }
    const repeated = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
    expect(repeated).toEqual([]);
  });
});

describe("translateWeapon", () => {
  it("keeps what a weapon Activity cannot say yet as gaps: mastery, the versatile die, ammunition", () => {
    for (const weapon of SRD_WEAPONS) {
      const fields = (translateWeapon(weapon)?.gaps ?? []).map(({ field }) => field);
      expect(fields.includes("mastery"), weapon.id).toBe(weapon.mastery !== undefined);
      expect(fields.includes("properties.versatile"), weapon.id).toBe(
        (weapon.properties ?? []).some((property) => /\bversatile\b/i.test(property))
      );
      expect(fields.includes("ammunitionId"), weapon.id).toBe(
        weapon.ammunitionId !== undefined
      );
    }
  });
});
