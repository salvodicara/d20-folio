// Operational topic only. Run from the pinned release checkout; no app changes.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const released = (path) => import(pathToFileURL(resolve(path)).href);
const {
  discoverDocuments,
  hashFirestoreDocument,
  isRecord,
  parseCliOptions,
  pathHash,
  readTargetConfiguration,
  runGuardedMigration,
} = await released("scripts/lib/migration-kit.ts");
const { parseCharacterEnvelope } = await released("src/lib/character-codec.ts");

export function planWeaponPropertiesRepair(sources, expected) {
  if (sources.length !== 1 || pathHash(sources[0].path) !== expected.targetHash)
    throw new Error("Refusing missing, ambiguous or different target");
  const { path, data: before } = sources[0];
  if (before.shared === true) throw new Error("Refusing shared parent");
  const beforeHash = hashFirestoreDocument(before);
  let after = before;
  if (beforeHash !== expected.afterHash) {
    if (beforeHash !== expected.beforeHash) throw new Error("Refusing changed document");
    const weapon = before.build?.weapons?.[3];
    if (
      !isRecord(weapon) ||
      weapon.custom !== true ||
      Object.hasOwn(weapon, "properties")
    )
      throw new Error("Refusing: expected exactly one missing properties field");
    after = {
      ...before,
      build: {
        ...before.build,
        weapons: before.build.weapons.map((entry, index) =>
          index === 3 ? { ...entry, properties: "" } : entry
        ),
      },
    };
  }
  const afterHash = hashFirestoreDocument(after);
  if (afterHash !== expected.afterHash) throw new Error("Refusing unexpected after hash");
  if (!parseCharacterEnvelope(after.build, {}).ok)
    throw new Error("Repaired character is not loadable");
  const document = {
    path,
    before,
    after,
    beforeHash,
    afterHash,
    changed: beforeHash !== afterHash,
  };
  return {
    documents: [document],
    changedDocuments: document.changed ? [document] : [],
    issues: [],
  };
}

async function run() {
  const expected = {
    targetHash: process.env.REPAIR_TARGET_HASH,
    beforeHash: process.env.REPAIR_BEFORE_HASH,
    afterHash: process.env.REPAIR_AFTER_HASH,
  };
  if (
    !/^[a-f0-9]{16}$/.test(expected.targetHash ?? "") ||
    !/^[a-f0-9]{64}$/.test(expected.beforeHash ?? "") ||
    !/^[a-f0-9]{64}$/.test(expected.afterHash ?? "") ||
    expected.beforeHash === expected.afterHash
  )
    throw new Error("Expected reviewed hashes are required");
  const options = parseCliOptions(process.argv.slice(2));
  if (options.mode === "fixtures")
    throw new Error("Use the offline planner for fixtures");
  const target = await readTargetConfiguration();
  if (target.emulator) throw new Error("This operational dispatch expects production");
  const { contentPackEnabled } = await released("scripts/content-pack-mode.ts");
  const { packCompositionRefusal } = await released(
    "scripts/migrate-character-parents.ts"
  );
  const { packSpells } = await import("@pack");
  const refusal = packCompositionRefusal(contentPackEnabled(), packSpells.length);
  if (refusal) throw new Error(refusal);
  // Resolve the SDK from the released root, also when this file is in .ops/scripts.
  const { createRequire } = await import("node:module");
  const requireReleased = createRequire(resolve("package.json"));
  const { initializeApp, applicationDefault, deleteApp } =
    requireReleased("firebase-admin/app");
  const { getFirestore } = requireReleased("firebase-admin/firestore");
  const app = initializeApp({
    projectId: target.projectId,
    credential: applicationDefault(),
  });
  try {
    await runGuardedMigration({
      migration: "empty-weapon-properties",
      label: "empty-weapon-properties-v0.24.1",
      db: getFirestore(app),
      options,
      discover: async (db) => {
        const matches = (
          await discoverDocuments(db, [
            {
              collectionGroup: "characters",
              pattern: /^users\/[^/]+\/characters\/[^/]+$/,
            },
          ])
        ).filter((doc) => pathHash(doc.source.path) === expected.targetHash);
        for (const doc of matches) {
          if ((await db.doc(doc.source.path + "/public/sheet").get()).exists)
            throw new Error("Refusing existing public projection");
        }
        return matches;
      },
      plan: (sources) => planWeaponPropertiesRepair(sources, expected),
      verify: (sources) => {
        const plan = planWeaponPropertiesRepair(sources, expected);
        return plan.changedDocuments.map((doc) => ({
          path: doc.path,
          code: "verification-failed",
          detail: "Repair pending",
        }));
      },
      writesFor: (doc) => ({ kind: "update", data: { build: doc.after.build } }),
      report: (plan) => ({
        format: "empty-weapon-properties-v1",
        changed: plan.changedDocuments.map((doc) => ({
          path: pathHash(doc.path),
          before: doc.beforeHash,
          after: doc.afterHash,
        })),
        issues: [],
      }),
    });
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
