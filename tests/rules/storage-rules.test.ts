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
import { deleteObject, getBytes, listAll, ref, uploadBytes } from "firebase/storage";

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

// Custom monster art lives under the same `users/{uid}/portraits/{fileName}` rule as
// character portraits, with a `monster-` filename prefix. WRITE is owner-only (the
// uploading DM); READ is any authenticated user, so campaign members can render the URL
// copied onto a shared custom combatant. This block pins that
// scope so the shared-art path can never silently widen to world-writable or public-read.
describe("storage rules — shared monster art (users/{uid}/portraits/monster-*.jpeg)", () => {
  const MONSTER_ART_PATH = `users/${REPORTER_UID}/portraits/monster-goblin.jpeg`;

  it("the owner can upload their own monster art (owner-scoped write)", async () => {
    const storage = testEnv.authenticatedContext(REPORTER_UID).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, MONSTER_ART_PATH), PNG_BYTES, {
        contentType: "image/jpeg",
      })
    );
  });

  it("a non-owner CANNOT upload into another user's portraits path", async () => {
    const storage = testEnv.authenticatedContext(PEER_UID).storage();
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
    const storage = testEnv.authenticatedContext(PEER_UID).storage();
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
    const peer = testEnv.authenticatedContext(PEER_UID).storage();
    await assertFails(deleteObject(ref(peer, MONSTER_ART_PATH)));
    const owner = testEnv.authenticatedContext(REPORTER_UID).storage();
    await assertSucceeds(deleteObject(ref(owner, MONSTER_ART_PATH)));
  });
});

// Map backgrounds (stage 5): `campaigns/{campaignId}/maps/{fileName}`. Membership and the DM
// come from the campaign document through the cross-service lookup, so the matrix is: DM
// create/read/delete · member read + list only · non-member denied · admin everything ·
// size and image-type ceilings.
describe("storage rules — map backgrounds (campaigns/{campaignId}/maps/*)", () => {
  const CAMPAIGN = "camp-maps";
  const DM_UID = "map-dm";
  const MEMBER_UID = "map-member";
  const OUTSIDER_UID = "map-outsider";
  const MAP_PATH = `campaigns/${CAMPAIGN}/maps/m1.jpeg`;
  const JPEG = { contentType: "image/jpeg" };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users", DM_UID), { status: "active" });
      await setDoc(doc(db, "users", MEMBER_UID), { status: "active" });
      await setDoc(doc(db, "users", OUTSIDER_UID), { status: "active" });
      await setDoc(doc(db, "campaigns", CAMPAIGN), {
        name: "Maps",
        createdBy: DM_UID,
        dmUid: DM_UID,
        members: [DM_UID, MEMBER_UID],
        memberDetails: {},
        status: "active",
        inviteCode: CAMPAIGN,
        treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
        treasuryLog: [],
      });
      await uploadBytes(ref(ctx.storage(), MAP_PATH), PNG_BYTES, JPEG);
    });
  });

  it("the DM can upload a background", async () => {
    const storage = testEnv.authenticatedContext(DM_UID).storage();
    await assertSucceeds(
      uploadBytes(ref(storage, `campaigns/${CAMPAIGN}/maps/m2.jpeg`), PNG_BYTES, JPEG)
    );
  });

  it("a member cannot upload, a non-member cannot upload", async () => {
    for (const uid of [MEMBER_UID, OUTSIDER_UID]) {
      const storage = testEnv.authenticatedContext(uid).storage();
      await assertFails(
        uploadBytes(ref(storage, `campaigns/${CAMPAIGN}/maps/m3.jpeg`), PNG_BYTES, JPEG)
      );
    }
  });

  it("a member can read and list the campaign's maps; a non-member and a visitor cannot", async () => {
    const member = testEnv.authenticatedContext(MEMBER_UID).storage();
    await assertSucceeds(getBytes(ref(member, MAP_PATH)));
    await assertSucceeds(listAll(ref(member, `campaigns/${CAMPAIGN}/maps`)));
    const outsider = testEnv.authenticatedContext(OUTSIDER_UID).storage();
    await assertFails(getBytes(ref(outsider, MAP_PATH)));
    await assertFails(listAll(ref(outsider, `campaigns/${CAMPAIGN}/maps`)));
    await assertFails(
      getBytes(ref(testEnv.unauthenticatedContext().storage(), MAP_PATH))
    );
  });

  it("the DM and the admin can delete; a member cannot", async () => {
    await assertFails(
      deleteObject(ref(testEnv.authenticatedContext(MEMBER_UID).storage(), MAP_PATH))
    );
    await assertSucceeds(
      deleteObject(ref(testEnv.authenticatedContext(DM_UID).storage(), MAP_PATH))
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), MAP_PATH), PNG_BYTES, JPEG);
    });
    await assertSucceeds(
      deleteObject(ref(testEnv.authenticatedContext(ADMIN_UID).storage(), MAP_PATH))
    );
  });

  it('a user whose doc carries role:"admin" can upload and read without being a member', async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).storage();
    await assertSucceeds(
      uploadBytes(ref(admin, `campaigns/${CAMPAIGN}/maps/admin.jpeg`), PNG_BYTES, JPEG)
    );
    await assertSucceeds(getBytes(ref(admin, MAP_PATH)));
  });

  it("an upload over 8 MiB or of a non-image type is denied even to the DM", async () => {
    const storage = testEnv.authenticatedContext(DM_UID).storage();
    await assertFails(
      uploadBytes(
        ref(storage, `campaigns/${CAMPAIGN}/maps/huge.jpeg`),
        new Uint8Array(8 * 1024 * 1024 + 1),
        JPEG
      )
    );
    await assertFails(
      uploadBytes(ref(storage, `campaigns/${CAMPAIGN}/maps/notes.txt`), PNG_BYTES, {
        contentType: "text/plain",
      })
    );
  });

  it("a map under a campaign that does not exist is unreachable", async () => {
    const storage = testEnv.authenticatedContext(DM_UID).storage();
    await assertFails(
      uploadBytes(ref(storage, "campaigns/nowhere/maps/m1.jpeg"), PNG_BYTES, JPEG)
    );
  });
});
