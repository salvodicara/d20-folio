/**
 * Every catalogue entry that declares an `unarmed-strike-die` grant (an item, a
 * class feature, a feat, a species trait, a spell; nested in any wrapper) actually
 * changes the Unarmed Strike: its die replaces the base "1 + STR" strike. The
 * cases are swept from the catalogues, not listed by hand.
 *
 * Blind spot: a deferred `classSpecific:<key>` die is resolved from the first class
 * table carrying that key at level 20; which class owns it at which level is the
 * class tests' job, not this sweep's.
 */
import { describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { classFeatures, classTables } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_RACES } from "@/data/races";
import { spells } from "@/data/spells";
import { effectiveUnarmedStrike, type UnarmedStrikeDieGrant } from "@/lib/compute";
import { resolveActions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

type DieGrant = UnarmedStrikeDieGrant & { type: "unarmed-strike-die" };

/** Every `unarmed-strike-die` object anywhere inside `value`. */
function dieGrants(value: unknown, seen = new WeakSet<object>()): DieGrant[] {
  if (value === null || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((v) => dieGrants(v, seen));
  const record = value as Record<string, unknown>;
  const own = record.type === "unarmed-strike-die" ? [record as unknown as DieGrant] : [];
  return [...own, ...Object.values(record).flatMap((v) => dieGrants(v, seen))];
}

const SOURCES: ReadonlyArray<{ id: string; entry: unknown }> = [
  ...SRD_MAGIC_ITEMS,
  ...classFeatures,
  ...SRD_FEATS,
  ...SRD_RACES,
  ...spells,
].map((entry) => ({ id: entry.id, entry }));

const CASES = SOURCES.flatMap(({ id, entry }) =>
  dieGrants(entry).map((grant, i) => [`${id}#${i}`, grant] as const)
);

const classSpecificAt20 = (_sourceId: string | undefined, key: string) =>
  classTables
    .map((table) => table.levels[19]?.classSpecific?.[key])
    .find((value) => value !== undefined);

const SCORES = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

describe("every declared Unarmed Strike die changes the Unarmed Strike", () => {
  it("the sweep finds the known carriers (Demon Armor, Martial Arts, Alter Self)", () => {
    const ids = CASES.map(([id]) => id.split("#")[0]);
    expect(ids).toEqual(expect.arrayContaining(["demon-armor", "alter-self"]));
    expect(ids.some((id) => id?.startsWith("monk"))).toBe(true);
  });

  it.each(CASES)("%s replaces the base strike with its die", (_id, grant) => {
    const profile = effectiveUnarmedStrike(
      [{ ...grant, sourceId: "test" }],
      SCORES,
      20,
      classSpecificAt20,
      null,
      undefined,
      () => "INT"
    );
    expect(profile.die).not.toBeNull();
    expect(profile.damageType).toBe(grant.damageType);
    expect(profile.damage).toMatch(/^\d+d\d+/);
  });
});

describe("on the Play board", () => {
  const ITEMS = SRD_MAGIC_ITEMS.filter((item) => dieGrants(item).length > 0);

  it.each(ITEMS.map((item) => [item.id, item] as const))(
    "%s, worn and attuned, upgrades the Unarmed Strike row",
    (id, item) => {
      const doc = makeCharacterDoc({
        classId: "fighter",
        level: 5,
        abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 12, CHA: 8 },
        equipment: [{ srdId: id, equipped: true, attuned: true }],
      });
      const row = resolveActions(doc).find((a) => a.id === "unarmed-strike");
      const [grant] = dieGrants(item);
      expect(row?.summary.damageType).toBe(grant?.damageType);
      expect(row?.summary.damage).toMatch(/^\d+d\d+/);
      expect(row?.summary.damageBreakdown?.[0]?.why?.rule?.loc).toEqual({
        srd: { kind: "magic-item", key: id, field: "name" },
      });
    }
  );
});

describe("a die written either way", () => {
  it.each([
    ["d8", "1d8"],
    ["1d8", "1d8"],
    ["2d6", "2d6"],
  ])("%s reads as %s", (die, expected) => {
    const profile = effectiveUnarmedStrike(
      [{ die, damageType: "slashing" }],
      SCORES,
      5,
      undefined
    );
    expect(profile.die).toBe(expected);
  });

  it("the stronger of two dice wins by average (2d6 over 1d10)", () => {
    const profile = effectiveUnarmedStrike(
      [
        { die: "1d10", damageType: "slashing" },
        { die: "2d6", damageType: "bludgeoning" },
      ],
      SCORES,
      5,
      undefined
    );
    expect(profile.die).toBe("2d6");
  });
});
