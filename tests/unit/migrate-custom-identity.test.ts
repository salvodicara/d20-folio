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

const sheetPath = `${parentPath}/public/sheet`;

/** The anonymous share projection: `build` must stay byte-identical to the parent's
 *  (`isExactPublicCharacterSheet` in firestore.rules). */
function sheetDoc(build: Record<string, unknown>) {
  return {
    publicSchema: 1,
    schema: 3,
    build,
    cache: { name: "x" },
    status: "active",
    hasPortrait: false,
    portraitCrop: null,
    sourceUpdatedAt: 0,
  };
}

function customBuild() {
  return { name: "Bo", equipment: [{ custom: true, name: "Boots" }] };
}

function planned(plan: ReturnType<typeof planCustomIdentity>) {
  return plan.documents.map((d) => ({ path: d.path, data: d.after }));
}

function buildOf(
  plan: ReturnType<typeof planCustomIdentity>,
  path: string
): Record<string, unknown> {
  const document = must(
    plan.documents.find((d) => d.path === path),
    `a planned ${path === sheetPath ? "sheet" : "document"}`
  );
  return document.after.build as Record<string, unknown>;
}

describe("public share projection", () => {
  it("stamps a shared parent and its public sheet with identical ids, in one plan", () => {
    const plan = planCustomIdentity([
      { path: parentPath, data: envelope(customBuild()) },
      { path: sheetPath, data: sheetDoc(customBuild()) },
    ]);
    expect(plan.issues).toEqual([]);
    expect(plan.counts.sheets).toBe(1);
    expect(plan.counts.parents).toBe(1);
    expect(plan.changedDocuments).toHaveLength(2);
    const parentBuild = buildOf(plan, parentPath);
    const sheetBuild = buildOf(plan, sheetPath);
    const equipment = parentBuild.equipment as { instanceId?: string }[];
    expect(at(equipment, 0).instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "equipment", 0)
    );
    // The projection stays byte-identical to its parent's build.
    expect(sheetBuild).toEqual(parentBuild);
    // Everything the projection alone owns survives.
    const sheetAfter = must(
      plan.documents.find((d) => d.path === sheetPath),
      "a planned sheet"
    ).after;
    expect(sheetAfter.publicSchema).toBe(1);
    expect(sheetAfter.sourceUpdatedAt).toBe(0);
    expect(verifyCustomIdentityCorpus(planned(plan))).toEqual([]);
  });

  it("reports a sheet discovered without its parent, and a sheet that diverged from it", () => {
    expect(
      verifyCustomIdentityCorpus([
        { path: sheetPath, data: sheetDoc(customBuild()) },
      ]).map((issue) => issue.code)
    ).toEqual(["verification-failed", "missing-parent"]);

    const diverged = verifyCustomIdentityCorpus([
      { path: parentPath, data: envelope(customBuild()) },
      {
        path: sheetPath,
        data: sheetDoc({ name: "Bo", equipment: [{ custom: true, name: "Sandals" }] }),
      },
    ]);
    expect(diverged.map((issue) => issue.code)).toContain("projection-mismatch");
  });

  it("leaves a sheet already equal to a migrated parent untouched", () => {
    const first = planCustomIdentity([
      { path: parentPath, data: envelope(customBuild()) },
      { path: sheetPath, data: sheetDoc(customBuild()) },
    ]);
    const second = planCustomIdentity(planned(first));
    expect(second.changedDocuments).toEqual([]);
    expect(second.issues).toEqual([]);
    expect(verifyCustomIdentityCorpus(planned(second))).toEqual([]);
  });
});

describe("custom identity refusals and rewrites", () => {
  it("realigns a library entry id to a valid item identity without touching the item", () => {
    const plan = planCustomIdentity([
      {
        path: libraryPath,
        data: {
          entries: [
            {
              id: "legacy-uuid-1",
              savedAt: 1,
              kind: "feature",
              item: { custom: true, title: "Grit", instanceId: "grit-1" },
            },
          ],
        },
      },
    ]);
    expect(plan.issues).toEqual([]);
    const entries = at(plan.changedDocuments, 0).after.entries as {
      id: string;
      item: { instanceId: string; title: string };
    }[];
    expect(at(entries, 0).id).toBe("grit-1");
    expect(at(entries, 0).item).toEqual({
      custom: true,
      title: "Grit",
      instanceId: "grit-1",
    });
    expect(plan.counts.stampedByCollection).toEqual({ "library.feature": 1 });
  });

  it("replaces an invalid sheet instanceId and counts it as stamped", () => {
    const plan = planCustomIdentity([
      {
        path: parentPath,
        data: envelope({
          name: "Bo",
          equipment: [{ custom: true, name: "Boots", instanceId: "NOT VALID" }],
        }),
      },
    ]);
    expect(plan.issues).toEqual([]);
    const equipment = buildOf(plan, parentPath).equipment as { instanceId: string }[];
    expect(at(equipment, 0).instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "equipment", 0)
    );
    expect(plan.counts.stampedByCollection).toEqual({ equipment: 1 });
  });

  it("never hands a sheet entry an id a monster entry already holds", () => {
    const plan = planCustomIdentity([
      {
        path: libraryPath,
        data: {
          entries: [
            { id: "shared-id", savedAt: 1, kind: "monster", item: { name: "Goblin" } },
            {
              id: "shared-id",
              savedAt: 1,
              kind: "spell",
              item: { custom: true, name: "Zap" },
            },
          ],
        },
      },
    ]);
    expect(plan.changedDocuments).toEqual([]);
    expect(plan.issues.map((issue) => issue.code)).toEqual(["duplicate-instance-id"]);
  });

  it("refuses an out-of-scope path, a repeated path, and malformed containers", () => {
    expect(
      planCustomIdentity([
        { path: "users/u1/campaigns/x", data: { build: {} } },
      ]).issues.map((issue) => issue.code)
    ).toEqual(["unexpected-path"]);

    const repeated = planCustomIdentity([
      { path: parentPath, data: envelope(customBuild()) },
      { path: parentPath, data: envelope(customBuild()) },
    ]);
    expect(repeated.issues.map((issue) => issue.code)).toEqual(["duplicate-document"]);
    expect(repeated.documents).toHaveLength(1);

    expect(
      planCustomIdentity([
        { path: libraryPath, data: { entries: { nope: true } } },
      ]).issues.map((issue) => issue.code)
    ).toEqual(["invalid-envelope"]);

    const customs = planCustomIdentity([
      { path: parentPath, data: envelope({ name: "Bo", customs: "nope" }) },
    ]);
    expect(customs.changedDocuments).toEqual([]);
    expect(customs.issues.map((issue) => issue.code)).toEqual(["invalid-envelope"]);
  });
});
