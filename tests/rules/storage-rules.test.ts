/// <reference types="node" />
/**
 * Storage security-rules tests — the data-driven admin override.
 *
 * EMULATOR-DEPENDENT (Firestore + Storage; the admin role is the token's
 * `role: "admin"` custom claim), run via:
 *
 *     pnpm test:rules
 *       → firebase emulators:exec --only auth,firestore,storage \
 *           'pnpm exec vitest run --config vitest.rules.config.ts'
 *
 * Enforced matrix (`bug-reports/{uid}/{file}`): owner read/create · peer denied ·
 * the `role:"admin"` claim grants read + delete (no hardcoded uid) · a token
 * without it is NOT admin · owner cannot delete.
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
// Admin is DATA-DRIVEN: an ordinary test uid whose token carries the role:"admin"
// claim — the rules never name a uid.
const ADMIN_UID = "admin-user";

/** Roles are Auth custom claims (Phase 5, functions/src/role-claims.ts): the rules read
 *  the token, never the user doc. These uids sign in with what their doc grants. */
const CLAIMS: Readonly<Record<string, Record<string, unknown>>> = {
  [ADMIN_UID]: { role: "admin" },
};
const authed = (uid: string, claims = CLAIMS[uid]) =>
  testEnv.authenticatedContext(uid, claims);

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
    const storage = authed(REPORTER_UID).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, `bug-reports/${REPORTER_UID}/new.png`), PNG_BYTES, {
        contentType: "image/png",
      })
    );
  });

  it("the owner can read their own screenshot", async () => {
    const storage = authed(REPORTER_UID).storage();
    await assertSucceeds(getBytes(ref(storage, SHOT_PATH)));
  });

  it("a peer (no admin role) cannot read someone else's screenshot", async () => {
    const storage = authed(PEER_UID).storage();
    await assertFails(getBytes(ref(storage, SHOT_PATH)));
  });

  it('a user whose doc carries role:"admin" can read any screenshot', async () => {
    const storage = authed(ADMIN_UID).storage();
    await assertSucceeds(getBytes(ref(storage, SHOT_PATH)));
  });

  it('a user whose doc carries role:"admin" can delete any screenshot', async () => {
    const storage = authed(ADMIN_UID).storage();
    await assertSucceeds(deleteObject(ref(storage, SHOT_PATH)));
  });

  it("the owner cannot delete their own screenshot (admin-only)", async () => {
    const storage = authed(REPORTER_UID).storage();
    await assertFails(deleteObject(ref(storage, SHOT_PATH)));
  });

  it("a token without the admin claim is not admin, whatever the doc says", async () => {
    const storage = authed(ADMIN_UID, {}).storage();
    await assertFails(getBytes(ref(storage, SHOT_PATH)));
  });
});

// Custom monster art lives under the same `users/{uid}/portraits/{fileName}` rule as
// character portraits, with a `monster-` filename prefix. WRITE is owner-only (the
// uploading DM); READ is any authenticated user, so campaign members can render the URL
// copied onto a shared custom combatant. This block pins that
// scope so the shared-art path can never silently widen to world-writable or public-read.
describe("storage rules — shared monster art (users/{uid}/portraits/monster-*.jpeg)", () => {
  const MONSTER_ART_PATH = `users/${REPORTER_UID}/portraits/monster-goblin.jpeg`;

  it("the owner can upload their own monster art (owner-scoped write)", async () => {
    const storage = authed(REPORTER_UID).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, MONSTER_ART_PATH), PNG_BYTES, {
        contentType: "image/jpeg",
      })
    );
  });

  it("a non-owner CANNOT upload into another user's portraits path", async () => {
    const storage = authed(PEER_UID).storage();
    await assertFails(
      uploadBytes(ref(storage, MONSTER_ART_PATH), PNG_BYTES, {
        contentType: "image/jpeg",
      })
    );
  });

  it("any authenticated user CAN read shared monster art (campaign-member visibility)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), MONSTER_ART_PATH), PNG_BYTES, {
        contentType: "image/jpeg",
      });
    });
    const storage = authed(PEER_UID).storage();
    await assertSucceeds(getBytes(ref(storage, MONSTER_ART_PATH)));
  });

  it("an UNauthenticated visitor CANNOT read monster art (not public)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), MONSTER_ART_PATH), PNG_BYTES, {
        contentType: "image/jpeg",
      });
    });
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, MONSTER_ART_PATH)));
  });

  it("only the owner can delete their own monster art", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), MONSTER_ART_PATH), PNG_BYTES, {
        contentType: "image/jpeg",
      });
    });
    const peer = authed(PEER_UID).storage();
    await assertFails(deleteObject(ref(peer, MONSTER_ART_PATH)));
    const owner = authed(REPORTER_UID).storage();
    await assertSucceeds(deleteObject(ref(owner, MONSTER_ART_PATH)));
  });
});
