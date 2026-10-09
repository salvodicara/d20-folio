/**
 * `catalogueActivities` — every active mechanic in the catalogue as one Activity,
 * the list the public SRD catalogue and `@d20-folio/core` publish. Cases come from
 * the catalogue's own enumerations, so a new entry is covered without a list here.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import {
  catalogueActions,
  catalogueActivities,
  catalogueBeastAttacks,
  catalogueCompanionAttacks,
  catalogueItemActivations,
  catalogueMonsterEntries,
} from "@/lib/activities/catalogue";

describe("catalogueActivities", () => {
  it("holds one Activity per spell, action, monster entry, form attack and activation", async () => {
    const all = await catalogueActivities();
    const expected =
      spells.length +
      catalogueActions().length +
      (await catalogueMonsterEntries()).length +
      catalogueBeastAttacks().length +
      catalogueCompanionAttacks().length +
      catalogueItemActivations().length;
    expect(all.length).toBe(expected);
    const ids = new Set(all.map(({ activity }) => activity.id));
    for (const spell of spells) expect(ids.has(`spell:${spell.id}`), spell.id).toBe(true);
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
