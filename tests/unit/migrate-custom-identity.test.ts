import { describe, expect, it } from "vitest";
import {
  deterministicCustomInstanceId,
  planCustomIdentity,
  verifyCustomIdentityCorpus,
} from "../../scripts/migrate-custom-identity";

/** Index/find helpers: the suite asserts on entries it has just planned, and the
 *  repo forbids the non-null assertion that would otherwise carry that knowledge. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Expected ${what}`);
  return value;
}

function at<T>(list: readonly T[], index: number): T {
  return must(list[index], `index ${index}`);
}

const parentPath = "users/u1/characters/c1";
const snapshotPath = `${parentPath}/snapshots/s1`;
const libraryPath = "users/u1/library/index";

function envelope(build: Record<string, unknown>, state: Record<string, unknown> = {}) {
  return { schema: 3, build, state, cache: { name: "x" }, futureRoot: { keep: true } };
}

describe("custom identity migration", () => {
  it("stamps a deterministic id on every custom entry lacking one, in every collection, and preserves everything else", () => {
    const build = {
      name: "Bo",
      spells: [{ srdId: "shield" }, { custom: true, name: "Zap", level: 1, future: 1 }],
      weapons: [
        {
          custom: true,
          name: "Talon",
          quantity: 1,
          damageDie: "1d8",
          damageType: "slashing",
          attackStat: "STR",
          properties: "",
        },
      ],
      equipment: [
        { custom: true, name: "Boots" },
        { custom: true, name: "Ring", instanceId: "ring-1" },
      ],
      customs: {
        features: [
          { custom: true, title: "Grit", emoji: "x", source: "s", contentBlocks: [] },
        ],
      },
    };
    const plan = planCustomIdentity([{ path: parentPath, data: envelope(build) }]);
    expect(plan.issues).toEqual([]);
    expect(plan.changedDocuments).toHaveLength(1);
    type Entry = Record<string, unknown> & { instanceId?: string };
    const after = at(plan.changedDocuments, 0).after.build as {
      spells: Entry[];
      weapons: Entry[];
      equipment: Entry[];
      customs: { features: Entry[] };
    };
    expect(at(after.spells, 1)).toEqual({
      custom: true,
      name: "Zap",
      level: 1,
      future: 1,
      instanceId: deterministicCustomInstanceId("u1", "c1", "spells", 1),
    });
    expect(at(after.weapons, 0).instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "weapons", 0)
    );
    expect(at(after.equipment, 0).instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "equipment", 0)
    );
    expect(at(after.equipment, 1).instanceId).toBe("ring-1");
    expect(at(after.customs.features, 0).instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "customs.features", 0)
    );
    expect(at(plan.changedDocuments, 0).after.futureRoot).toEqual({ keep: true });
    expect(plan.counts.stampedByCollection).toEqual({
      spells: 1,
      weapons: 1,
      equipment: 1,
      "customs.features": 1,
    });
  });

  it("is idempotent and reports zero changes on a migrated corpus", () => {
    const first = planCustomIdentity([
      {
        path: parentPath,
        data: envelope({ name: "Bo", equipment: [{ custom: true, name: "Boots" }] }),
      },
    ]);
    const second = planCustomIdentity(
      first.documents.map((d) => ({ path: d.path, data: d.after }))
    );
    expect(second.changedDocuments).toEqual([]);
    expect(
      verifyCustomIdentityCorpus(
        second.documents.map((d) => ({ path: d.path, data: d.after }))
      )
    ).toEqual([]);
  });

  it("stamps snapshots and library entries (entry id first, deterministic fallback)", () => {
    const plan = planCustomIdentity([
      {
        path: snapshotPath,
        data: {
          build: { name: "Bo", weapons: [{ custom: true, name: "Talon" }] },
          state: {},
        },
      },
      {
        path: libraryPath,
        data: {
          entries: [
            {
              id: "boots-1",
              savedAt: 1,
              kind: "equipment",
              item: { custom: true, name: "Boots" },
            },
            {
              id: "NOT VALID",
              savedAt: 1,
              kind: "spell",
              item: { custom: true, name: "Zap" },
            },
            {
              id: "m1",
              savedAt: 1,
              kind: "monster",
              item: { name: "Goblin", ac: 12, maxHp: 7 },
            },
          ],
        },
      },
    ]);
    expect(plan.issues).toEqual([]);
    const snap = must(
      plan.changedDocuments.find((d) => d.path === snapshotPath),
      "a planned snapshot"
    );
    const weapons = (snap.after.build as { weapons: { instanceId: string }[] }).weapons;
    expect(at(weapons, 0).instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "snapshots/s1/weapons", 0)
    );
    const lib = must(
      plan.changedDocuments.find((d) => d.path === libraryPath),
      "a planned library"
    );
    const entries = lib.after.entries as { id: string; item: { instanceId?: string } }[];
    expect(entries[0]).toMatchObject({ id: "boots-1", item: { instanceId: "boots-1" } });
    expect(at(entries, 1).item.instanceId).toBe(
      deterministicCustomInstanceId("u1", "library", "spell", 1)
    );
    expect(at(entries, 1).id).toBe(at(entries, 1).item.instanceId);
    expect(at(entries, 2).item).not.toHaveProperty("instanceId");
  });

  it("reports duplicate ids inside one document and an unparseable envelope as issues, never a change", () => {
    const dup = envelope({
      name: "Bo",
      equipment: [
        { custom: true, name: "A", instanceId: "same" },
        { custom: true, name: "B", instanceId: "same" },
      ],
    });
    const plan = planCustomIdentity([
      { path: parentPath, data: dup },
      { path: "users/u1/characters/c2", data: { schema: 3, build: "nope", state: {} } },
    ]);
    expect(plan.changedDocuments).toEqual([]);
    expect(plan.issues.map((i) => i.code).sort()).toEqual([
      "duplicate-instance-id",
      "invalid-envelope",
    ]);
  });
});
