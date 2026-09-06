import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const projectId = process.env.GCLOUD_PROJECT;
if (
  projectId !== "demo-d20folio" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST !== "127.0.0.1:9199"
)
  throw new Error("Identity fixture seed requires the exact local demo emulators.");
initializeApp({ projectId, storageBucket: "demo-d20folio.appspot.com" });
const db = getFirestore();
const auth = getAuth();
for (const [uid, displayName] of [
  ["p02-marco", "Marco"],
  ["p02-sara", "Sara"],
] as const) {
  const value = {
    uid,
    displayName,
    email: uid + "@example.test",
    password: "local-fixture-only",
    emailVerified: true,
  };
  try {
    await auth.createUser(value);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/uid-already-exists") throw error;
    await auth.updateUser(uid, value);
  }
  await db.doc("users/" + uid).set({ status: "active" });
  await db.doc("folioAccounts/" + uid).set({ schema: 1, displayName, locale: "it" });
}
const campaignId = "silver-company";
await db.doc("folioCampaigns/" + campaignId).set({
  schema: 1,
  id: campaignId,
  name: "La Compagnia d’Argento",
  dmUid: "p02-sara",
  members: ["p02-sara", "p02-marco"],
  revision: 0,
  archived: false,
  joinOpen: true,
});
await db
  .doc("folioInvites/" + campaignId)
  .set({ id: campaignId, name: "La Compagnia d’Argento", joinOpen: true });
for (const [id, name, classId, level] of [
  ["lyra", "Lyra Voss", "bard", 9],
  ["arin", "Arin dei Boschi", "druid", 4],
] as const) {
  const ownerUid = "p02-marco";
  const path = "folioAccounts/" + ownerUid + "/characters/" + id;
  const assignment = { campaignId, assignmentId: "fixture-" + id, version: 1 };
  const build = {
    name,
    race: "human",
    background: "entertainer",
    classes: [{ classId, level }],
    abilities: { STR: 10, DEX: 14, CON: 14, INT: 12, WIS: 12, CHA: 18 },
    languageIds: ["common", "elvish"],
    toolProficiencyIds: [],
    savingThrows: ["DEX", "CHA"],
    spells: [
      { srdId: "vicious-mockery", name: "Beffa crudele", level: 0, prepared: true },
    ],
    weapons: [
      {
        name: "Stocco",
        quantity: 1,
        equipped: true,
        damageDie: "1d8",
        damageType: "piercing",
      },
    ],
    equipment: [{ name: "Liuto", quantity: 1, equipped: false }],
    features: [
      { name: "Ispirazione Bardica", description: "Risorsa della scheda dimostrativa." },
    ],
  };
  const state = {
    hp: { current: 45, temp: 0 },
    exhaustion: 0,
    conditions: [],
    currency: { gp: 20 },
  };
  const original = JSON.stringify({
    schema: 3,
    build: { ...build, lore: { backstory: "Nota personale sintetica di " + name } },
    state,
  });
  const portraitPath =
    id === "lyra" && process.env.P02_FIXTURE_PORTRAIT
      ? path + "/portraits/fixture.png"
      : null;
  await db.doc(path).set({
    schema: 1,
    id,
    ownerUid,
    name,
    classId,
    speciesId: "human",
    level,
    revision: 1,
    currentAssignment: assignment,
    sheet: { build, state },
    portraitPath,
  });
  await db
    .doc(path + "/private/notes")
    .set({ text: "Nota personale sintetica di " + name });
  await db.doc(path + "/private/import").set({ schema: 1, sourceSchema: 3, original });
  await db.doc("folioCampaigns/" + campaignId + "/roster/" + ownerUid + "~" + id).set({
    ownerUid,
    characterId: id,
    ...{ assignmentId: assignment.assignmentId, version: 1 },
  });
  if (portraitPath && process.env.P02_FIXTURE_PORTRAIT)
    await getStorage()
      .bucket()
      .file(portraitPath)
      .save(readFileSync(process.env.P02_FIXTURE_PORTRAIT), {
        contentType: "image/png",
      });
}
await db
  .doc("folioCampaigns/" + campaignId + "/dmNotes/main")
  .set({ text: "Segreto narrativo sintetico: la porta orientale è un’illusione." });
console.log(
  "Seeded two synthetic accounts, one campaign and two independently addressed PCs in local demo emulators."
);
