/// <reference types="node" />
/**
 * Storage security-rules tests — the data-driven admin override.
 *
 * EMULATOR-DEPENDENT (Firestore + Storage — the Storage rules resolve the admin
 * role via the cross-service `firestore.get()` on `/users/{uid}`), run via:
 *
 *     pnpm test:rules
 *       → firebase emulators:exec --only firestore,storage \
 *           'pnpm exec vitest run --config vitest.rules.config.ts'
 *
 * Enforced matrix (`bug-reports/{uid}/{file}`): owner read/create · peer denied ·
 * `role:"admin"` user-doc grants read + delete (no hardcoded uid) · a plain user
 * (no role field) is NOT admin · owner cannot delete.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = "demo-d20folio";
// Admin is DATA-DRIVEN: an ordinary test uid whose seeded `/users` doc carries
// role:"admin" — the rules never name a uid.
const ADMIN_UID = "admin-user";
const REPORTER_UID = "reporter";
const PEER_UID = "peer";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const SHOT_PATH = `bug-reports/${REPORTER_UID}/shot.png`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
    storage: {
      rules: readFileSync(resolve(__dirname, "../../storage.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", ADMIN_UID), { status: "active", role: "admin" });
    await setDoc(doc(db, "users", REPORTER_UID), { status: "active" });
    await setDoc(doc(db, "users", PEER_UID), { status: "active" });
    await uploadBytes(ref(ctx.storage(), SHOT_PATH), PNG_BYTES, {
      contentType: "image/png",
    });
  });
});

describe("storage rules — bug-report screenshots (data-driven admin)", () => {
  it("the owner can upload an image screenshot to their own path", async () => {
    const storage = testEnv.authenticatedContext(REPORTER_UID).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, `bug-reports/${REPORTER_UID}/new.png`), PNG_BYTES, {
        contentType: "image/png",
      })
    );
  });

  it("the owner can read their own screenshot", async () => {
    const storage = testEnv.authenticatedContext(REPORTER_UID).storage();
    await assertSucceeds(getBytes(ref(storage, SHOT_PATH)));
  });

  it("a peer (no admin role) cannot read someone else's screenshot", async () => {
    const storage = testEnv.authenticatedContext(PEER_UID).storage();
    await assertFails(getBytes(ref(storage, SHOT_PATH)));
  });

  it('a user whose doc carries role:"admin" can read any screenshot', async () => {
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();
    await assertSucceeds(getBytes(ref(storage, SHOT_PATH)));
  });

  it('a user whose doc carries role:"admin" can delete any screenshot', async () => {
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();
    await assertSucceeds(deleteObject(ref(storage, SHOT_PATH)));
  });

  it("the owner cannot delete their own screenshot (admin-only)", async () => {
    const storage = testEnv.authenticatedContext(REPORTER_UID).storage();
    await assertFails(deleteObject(ref(storage, SHOT_PATH)));
  });

  it("revoking the role revokes admin access (no hardcoded uid anywhere)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ADMIN_UID), { status: "active" });
    });
    const storage = testEnv.authenticatedContext(ADMIN_UID).storage();
    await assertFails(getBytes(ref(storage, SHOT_PATH)));
  });
});
