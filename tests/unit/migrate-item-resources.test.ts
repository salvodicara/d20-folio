import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Firestore, GeoPoint, Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  assertCatalogueFingerprint,
  assertCleanPreflight,
  assertTargetProject,
  catalogueFingerprint,
  decodeFirestoreValue,
  deterministicItemInstanceId,
  encodeFirestoreValue,
  MAX_CHANGED_DOCUMENTS,
  parseCliOptions,
  planItemResourceMigration,
  verifyItemResourceCorpus,
  verifyPlannedDocument,
  writeBackupDirectory,
  type MigrationCatalogueItem,
} from "../../scripts/migrate-item-resources";

const CATALOGUE: MigrationCatalogueItem[] = [
  {
    id: "test-wand",
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [{ trigger: { kind: "dawn" }, amount: { kind: "full" } }],
      },
    ],
  },
];

const mainPath = "users/user-a/characters/hero-a";
const snapshotPath = `${mainPath}/snapshots/level-2`;

function envelope(
  equipment: unknown[],
  state: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: 3,
    build: { name: "preserved", equipment },
    state,
    cache: { name: "preserved-cache", future: true },
    futureRoot: { nested: [1, "two"] },
  };
}

describe("item-resource migration planner", () => {
  it("pins the exact zero-based per-item deterministic identity formula", () => {
    expect(deterministicItemInstanceId("user-a", "hero-a", "test-wand", 0)).toBe(
      "mi-ff0a0a9ab066155bcfd1344332479d89"
    );
    expect(deterministicItemInstanceId("user-a", "hero-a", "test-wand", 1)).toBe(
      "mi-746651c29a7079033aae440349df3b9f"
    );
    expect(() =>
      deterministicItemInstanceId("user-a", "hero-a", "test-wand", -1)
    ).toThrow("non-negative");
  });

  it("migrates charges surgically and reuses a valid main identity for a missing snapshot identity", () => {
    const untouchedTracker = { used: 1, rolls: [null, 4] };
    const main = envelope(
      [
        {
          srdId: "test-wand",
          quantity: 1,
          instanceId: "live-wand-id",
          charges: { current: 3, max: 7, recovery: "long-rest" },
          futureEquipmentField: { keep: true },
        },
      ],
      {
        trackers: { unrelated: untouchedTracker },
        futureState: { keep: true },
      }
    );
    const snapshot = envelope(
      [
        {
          srdId: "test-wand",
          quantity: 1,
          charges: { current: 2, max: 7 },
          snapshotOnly: "keep",
        },
      ],
      { hp: { current: 4 }, conditions: ["poisoned"], snapshotState: true }
    );
    const plan = planItemResourceMigration(
      [
        { path: mainPath, data: main },
        { path: snapshotPath, data: snapshot },
      ],
      CATALOGUE
    );

    expect(plan.issues).toEqual([]);
    expect(plan.changedDocuments).toHaveLength(2);
    const mainAfter = plan.documents.find(
      (document) => document.path === mainPath
    )?.after;
    const snapshotAfter = plan.documents.find(
      (document) => document.path === snapshotPath
    )?.after;
    expect(mainAfter).toBeDefined();
    expect(snapshotAfter).toBeDefined();

    const mainBuild = mainAfter?.build as { equipment: Record<string, unknown>[] };
    expect(mainBuild.equipment).toEqual([
      {
        srdId: "test-wand",
        quantity: 1,
        instanceId: "live-wand-id",
        futureEquipmentField: { keep: true },
      },
    ]);
    expect(mainAfter?.futureRoot).toBe(main.futureRoot);
    expect(mainAfter?.cache).toBe(main.cache);
    const mainState = mainAfter?.state as Record<string, unknown>;
    expect(mainState.futureState).toBe(
      (main.state as Record<string, unknown>).futureState
    );
    expect((mainState.trackers as Record<string, unknown>).unrelated).toBe(
      untouchedTracker
    );
    expect(mainState).not.toHaveProperty("hp");
    expect(mainState).not.toHaveProperty("conditions");
    expect(mainState.itemResources).toEqual({
      "live-wand-id": {
        itemId: "test-wand",
        instanceId: "live-wand-id",
        revision: 0,
        resources: { charges: { capacity: 7, current: 3, disabled: false } },
        disposition: "magical",
        causalHead: null,
      },
    });

    const snapshotBuild = snapshotAfter?.build as {
      equipment: Record<string, unknown>[];
    };
    expect(snapshotBuild.equipment[0]).toMatchObject({
      instanceId: "live-wand-id",
      snapshotOnly: "keep",
    });
    const snapshotState = snapshotAfter?.state as Record<string, unknown>;
    expect(snapshotState.hp).toEqual({ current: 4 });
    expect(snapshotState.conditions).toEqual(["poisoned"]);
    expect(snapshotState.itemResources).toMatchObject({
      "live-wand-id": {
        resources: { charges: { capacity: 7, current: 2, disabled: false } },
      },
    });

    const rerun = planItemResourceMigration(
      plan.documents.map((document) => ({ path: document.path, data: document.after })),
      CATALOGUE
    );
    expect(rerun.issues).toEqual([]);
    expect(rerun.changedDocuments).toEqual([]);
  });

  it("expands a stack with the zero-based deterministic ids and no synthetic counter", () => {
    const plan = planItemResourceMigration(
      [
        {
          path: mainPath,
          data: envelope([{ srdId: "test-wand", quantity: 2, note: "two copies" }]),
        },
      ],
      CATALOGUE
    );
    expect(plan.issues).toEqual([]);
    const after = plan.documents[0]?.after;
    const build = after?.build as { equipment: Record<string, unknown>[] };
    expect(build.equipment).toEqual([
      {
        srdId: "test-wand",
        quantity: 1,
        note: "two copies",
        instanceId: "mi-ff0a0a9ab066155bcfd1344332479d89",
      },
      {
        srdId: "test-wand",
        quantity: 1,
        note: "two copies",
        instanceId: "mi-746651c29a7079033aae440349df3b9f",
      },
    ]);
    expect(after?.state).not.toHaveProperty("itemResources");
  });

  it("fails closed on ambiguous ownership, invalid ids, and snapshot id collisions", () => {
    const ambiguous = planItemResourceMigration(
      [
        {
          path: mainPath,
          data: envelope(
            [
              { srdId: "test-wand", quantity: 1 },
              { srdId: "test-wand", quantity: 1 },
            ],
            { trackers: { "test-wand": 1 } }
          ),
        },
      ],
      CATALOGUE
    );
    expect(ambiguous.issues).toEqual([
      expect.objectContaining({ code: "migration-ambiguity", path: mainPath }),
    ]);
    expect(ambiguous.changedDocuments).toEqual([]);

    const invalid = planItemResourceMigration(
      [
        {
          path: mainPath,
          data: envelope([{ srdId: "test-wand", quantity: 1, instanceId: "../INVALID" }]),
        },
      ],
      CATALOGUE
    );
    expect(invalid.issues).toContainEqual(
      expect.objectContaining({ code: "invalid-raw-instance-id" })
    );

    const collision = planItemResourceMigration(
      [
        {
          path: mainPath,
          data: envelope([{ srdId: "test-wand", quantity: 1, instanceId: "main-wand" }]),
        },
        {
          path: snapshotPath,
          data: envelope([
            { srdId: "test-wand", quantity: 1, instanceId: "same-wand" },
            { srdId: "test-wand", quantity: 1, instanceId: "same-wand" },
          ]),
        },
      ],
      CATALOGUE
    );
    expect(collision.issues).toContainEqual(
      expect.objectContaining({ code: "migration-ambiguity", path: snapshotPath })
    );
  });

  it("refuses a plan beyond Firestore's single-batch write limit", () => {
    const sources = Array.from({ length: MAX_CHANGED_DOCUMENTS + 1 }, (_, index) => ({
      path: `users/user-${index}/characters/hero-${index}`,
      data: envelope([
        {
          srdId: "test-wand",
          quantity: 1,
          charges: { current: 3, max: 7, recovery: "long-rest" },
        },
      ]),
    }));
    const plan = planItemResourceMigration(sources, CATALOGUE);
    expect(plan.issues).toEqual([]);
    expect(plan.changedDocuments).toHaveLength(MAX_CHANGED_DOCUMENTS + 1);
    expect(() => assertCleanPreflight(plan)).toThrow("atomic limit");
  });

  it("verifies resolution and exact after hashes", () => {
    const plan = planItemResourceMigration(
      [
        {
          path: mainPath,
          data: envelope([
            {
              srdId: "test-wand",
              quantity: 1,
              charges: { current: 3, max: 7 },
            },
          ]),
        },
      ],
      CATALOGUE
    );
    const document = plan.documents[0];
    expect(document).toBeDefined();
    if (!document) return;
    expect(
      verifyItemResourceCorpus([{ path: mainPath, data: document.after }], CATALOGUE)
    ).toEqual([]);
    expect(verifyPlannedDocument(document, document.after, CATALOGUE)).toEqual([]);

    const tampered = structuredClone(document.after);
    const state = tampered.state as { itemResources: Record<string, unknown> };
    const instanceId = Object.keys(state.itemResources)[0];
    expect(instanceId).toBeDefined();
    if (!instanceId) return;
    state.itemResources[instanceId] = {
      ...(state.itemResources[instanceId] as Record<string, unknown>),
      itemId: "wrong-owner",
    };
    expect(verifyPlannedDocument(document, tampered, CATALOGUE)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "verification-failed" })])
    );
  });
});

describe("catalogue, target, and CLI locks", () => {
  it("rejects any catalogue drift from the reviewed fingerprint", () => {
    const fingerprint = catalogueFingerprint(CATALOGUE);
    expect(
      assertCatalogueFingerprint(CATALOGUE, "srd-only", {
        "srd-only": fingerprint,
        composed: "unused",
      })
    ).toBe(fingerprint);
    expect(() =>
      assertCatalogueFingerprint([{ ...CATALOGUE[0], id: "changed-wand" }], "srd-only", {
        "srd-only": fingerprint,
        composed: "unused",
      })
    ).toThrow("fingerprint mismatch");
  });

  it("allows only the exact project and an explicitly configured emulator", () => {
    expect(
      assertTargetProject({
        credentialProjectId: "d20-folio",
        configuredProjectIds: [],
      })
    ).toEqual({ projectId: "d20-folio", emulator: false });
    expect(
      assertTargetProject({
        emulatorHost: "127.0.0.1:8080",
        configuredProjectIds: ["d20-folio"],
      })
    ).toEqual({ projectId: "d20-folio", emulator: true });
    expect(() =>
      assertTargetProject({
        credentialProjectId: "another-project",
        configuredProjectIds: [],
      })
    ).toThrow("expected exactly d20-folio");
    expect(() =>
      assertTargetProject({
        emulatorHost: "127.0.0.1:8080",
        configuredProjectIds: [],
      })
    ).toThrow("requires an explicit d20-folio");
  });

  it("defaults to dry-run and requires an absolute backup only for apply", () => {
    expect(parseCliOptions([])).toEqual({ mode: "dry-run" });
    expect(parseCliOptions(["--check"])).toEqual({ mode: "check" });
    expect(parseCliOptions(["--apply", "--backup", "/private/migration"])).toEqual({
      mode: "apply",
      backupDirectory: "/private/migration",
    });
    expect(() => parseCliOptions(["--apply"])).toThrow("requires --backup");
    expect(() => parseCliOptions(["--apply", "--backup", "relative"])).toThrow(
      "absolute"
    );
    expect(() => parseCliOptions(["--check", "--apply"])).toThrow("exactly one");
    expect(() => parseCliOptions(["--dry-run", "--check"])).toThrow("exactly one");
    expect(() =>
      parseCliOptions(["--apply", "--backup", "/private/one", "--backup", "/private/two"])
    ).toThrow("exactly one --backup");
  });
});

describe("tagged recoverable backup", () => {
  it("round-trips Firestore value kinds and writes 0700/0600 backup artifacts", async () => {
    const firestore = new Firestore({ projectId: "d20-folio" });
    const value = {
      nullValue: null,
      bool: true,
      string: "value",
      finite: 12.5,
      negativeZero: -0,
      nan: Number.NaN,
      timestamp: new Timestamp(1_723_456_789, 123_456_789),
      date: new Date("2026-08-05T00:00:00.000Z"),
      point: new GeoPoint(41.9028, 12.4964),
      bytes: Buffer.from([0, 1, 254, 255]),
      reference: firestore.doc("users/user-a/characters/hero-a"),
      nested: [{ key: "value" }],
    };
    const tagged = encodeFirestoreValue(value);
    const decoded = decodeFirestoreValue(tagged, {
      reference: (path) => firestore.doc(path),
    }) as typeof value;
    expect(decoded.nullValue).toBeNull();
    expect(decoded.bool).toBe(true);
    expect(decoded.string).toBe("value");
    expect(decoded.finite).toBe(12.5);
    expect(Object.is(decoded.negativeZero, -0)).toBe(true);
    expect(Number.isNaN(decoded.nan)).toBe(true);
    expect(decoded.timestamp.isEqual(value.timestamp)).toBe(true);
    expect(decoded.date.toISOString()).toBe(value.date.toISOString());
    expect(decoded.point.isEqual(value.point)).toBe(true);
    expect(decoded.bytes.equals(value.bytes)).toBe(true);
    expect(decoded.reference.path).toBe(value.reference.path);
    expect(decoded.nested).toEqual(value.nested);

    const parent = await mkdtemp(join(tmpdir(), "d20-item-resource-backup-"));
    const directory = join(parent, "backup");
    try {
      const migration = planItemResourceMigration(
        [
          {
            path: mainPath,
            data: envelope([
              {
                srdId: "test-wand",
                charges: { current: 3, max: 7 },
              },
            ]),
          },
        ],
        CATALOGUE
      ).changedDocuments[0];
      expect(migration).toBeDefined();
      if (!migration) return;
      const manifest = await writeBackupDirectory({
        directory,
        migration: "item-resources",
        label: catalogueFingerprint(CATALOGUE),
        documents: [{ plan: migration, updateTime: new Timestamp(1_723_456_789, 1) }],
      });
      // The manifest is migration-agnostic since the shared kit owns the backup
      // writer: the catalogue lock travels as this migration's `label`.
      expect(manifest.format).toBe("d20-folio-migration-backup-v1");
      expect(manifest.migration).toBe("item-resources");
      expect(manifest.label).toBe(catalogueFingerprint(CATALOGUE));
      expect(manifest.documents).toHaveLength(1);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      const files = await readdir(directory);
      expect(files).toContain("manifest.json");
      expect(files).toHaveLength(2);
      for (const file of files) {
        expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
      }
      const backup = JSON.parse(
        await readFile(join(directory, manifest.documents[0]?.file ?? ""), "utf8")
      ) as { data: ReturnType<typeof encodeFirestoreValue> };
      expect(decodeFirestoreValue(backup.data)).toEqual(migration.before);
      await expect(
        writeBackupDirectory({
          directory,
          migration: "item-resources",
          label: catalogueFingerprint(CATALOGUE),
          documents: [],
        })
      ).rejects.toThrow("fresh");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
