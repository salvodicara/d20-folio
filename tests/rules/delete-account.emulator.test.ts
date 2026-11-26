/// <reference types="node" />
/**
 * EMULATOR-BACKED test of the account-deletion cascade (`deleteUser` callable,
 * `functions/src/delete-user-cascade.ts`) against the Firestore emulator (#1352).
 * Other players' data never moves: their characters, their memberships and their
 * character links survive byte for byte; a DM's campaign is handed over, never
 * cascaded; the leaver's own character leaves the campaign in the same transaction;
 * a half-failed delete re-runs to the same end state as one clean run, including
 * when only the Auth account is left. Runs through `pnpm test:rules`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  runAccountDeletion,
  type DeletionDeps,
} from "../../functions/src/delete-user-cascade";

let app: App;
let db: Firestore;

beforeAll(() => {
  app = initializeApp({ projectId: "demo-d20folio" }, "delete-account-test");
  db = getFirestore(app);
});
afterAll(async () => {
  await deleteApp(app);
});

const DM = "del-dm";
const ALICE = "del-alice";
const BOB = "del-bob";

/** A fake Auth and Storage that record what was asked, with an optional failure. */
function fakes(opts: { authUsers?: string[]; failAuthOnce?: boolean } = {}) {
  const auth = new Map(
    (opts.authUsers ?? [DM, ALICE, BOB]).map((u) => [u, `${u}@x.test`])
  );
  const purged: string[] = [];
  let failAuth = opts.failAuthOnce ?? false;
  const deps: DeletionDeps = {
    db,
    serverTimestamp: () => FieldValue.serverTimestamp(),
    purgePrefix: (prefix) => {
      purged.push(prefix);
      return Promise.resolve();
    },
    authEmail: (uid) => Promise.resolve(auth.get(uid) ?? null),
    deleteAuthUser: (uid) => {
      if (failAuth) {
        failAuth = false;
        return Promise.reject(new Error("auth down"));
      }
      auth.delete(uid);
      return Promise.resolve();
    },
  };
  return { deps, auth, purged };
}

async function wipe() {
  for (const col of ["users", "campaigns", "admin_audit", "diagnostics", "bug_reports"]) {
    const refs = await db.collection(col).listDocuments();
    await Promise.all(refs.map((r) => db.recursiveDelete(r)));
  }
}

async function seed() {
  for (const uid of [DM, ALICE, BOB]) {
    await db.doc(`users/${uid}`).set({ email: `${uid}@x.test`, status: "active" });
    await db
      .doc(`users/${uid}/characters/${uid}-c`)
      .set({ build: { name: uid }, revision: 3 });
    await db.doc(`users/${uid}/characters/${uid}-c/combat/state`).set({ hp: 7 });
  }
  // the DM runs a table with Alice and Bob
  await db.doc("campaigns/table").set({
    dmUid: DM,
    members: [DM, ALICE, BOB],
    memberDetails: {
      [DM]: { role: "dm", characterId: null },
      [ALICE]: { role: "player", characterId: `${ALICE}-c` },
      [BOB]: { role: "player", characterId: `${BOB}-c` },
    },
    name: "Table",
  });
  await db.doc("campaigns/table/sessionLogs/s1").set({ text: "night one" });
  // the DM also plays in Bob's game, with a character
  await db.doc("campaigns/bobs").set({
    dmUid: BOB,
    members: [BOB, DM],
    memberDetails: {
      [BOB]: { role: "dm", characterId: null },
      [DM]: { role: "player", characterId: `${DM}-c` },
    },
  });
  // and has a campaign of their own nobody joined
  await db.doc("campaigns/solo").set({
    dmUid: DM,
    members: [DM],
    memberDetails: { [DM]: { role: "dm", characterId: null } },
  });
  await db.doc("campaigns/solo/sessionLogs/s1").set({ text: "alone" });
}

type Camp = {
  members?: string[];
  dmUid?: string;
  memberDetails?: Record<string, { role?: string; characterId?: string | null }>;
};
const campaign = async (id: string) =>
  (await db.doc(`campaigns/${id}`).get()).data() as Camp | undefined;

/** Everything that belongs to another player, as stored. */
async function othersData() {
  const out: Record<string, unknown> = {};
  for (const uid of [ALICE, BOB]) {
    out[uid] = (await db.doc(`users/${uid}`).get()).data();
    out[`${uid}-c`] = (await db.doc(`users/${uid}/characters/${uid}-c`).get()).data();
    out[`${uid}-combat`] = (
      await db.doc(`users/${uid}/characters/${uid}-c/combat/state`).get()
    ).data();
  }
  return out;
}

const input = { callerUid: DM, targetUid: DM, confirmEmail: `${DM}@x.test` };

beforeEach(async () => {
  await wipe();
  await seed();
});

describe("account deletion on the emulator", () => {
  it("a DM leaving keeps every other player's characters and data untouched", async () => {
    const before = await othersData();
    const { deps } = fakes();
    await runAccountDeletion(deps, input);
    expect(await othersData()).toEqual(before);
  });

  it("the DM's campaign is handed over, never cascaded: members, links, logs kept", async () => {
    const { deps } = fakes();
    await runAccountDeletion(deps, input);
    const table = (await db.doc("campaigns/table").get()).data();
    expect(table).toMatchObject({
      dmUid: ALICE,
      members: [ALICE, BOB],
      name: "Table",
      memberDetails: {
        [ALICE]: { role: "dm", characterId: `${ALICE}-c` },
        [BOB]: { role: "player", characterId: `${BOB}-c` },
      },
    });
    expect((await db.doc("campaigns/table/sessionLogs/s1").get()).exists).toBe(true);
  });

  it("the leaver's character leaves another DM's campaign, no dangling link", async () => {
    const { deps } = fakes();
    await runAccountDeletion(deps, input);
    const bobs = await campaign("bobs");
    expect(bobs?.members).toEqual([BOB]);
    expect(bobs?.dmUid).toBe(BOB);
    expect(Object.keys(bobs?.memberDetails ?? {})).toEqual([BOB]);
  });

  it("only a campaign nobody else is in goes, with its logs", async () => {
    const { deps } = fakes();
    await runAccountDeletion(deps, input);
    expect((await db.doc("campaigns/solo").get()).exists).toBe(false);
    expect((await db.doc("campaigns/solo/sessionLogs/s1").get()).exists).toBe(false);
  });

  it("removes the leaver's own data and Auth account", async () => {
    const { deps, auth, purged } = fakes();
    await runAccountDeletion(deps, input);
    expect((await db.doc(`users/${DM}`).get()).exists).toBe(false);
    expect((await db.doc(`users/${DM}/characters/${DM}-c`).get()).exists).toBe(false);
    expect(
      (await db.doc(`users/${DM}/characters/${DM}-c/combat/state`).get()).exists
    ).toBe(false);
    expect(auth.has(DM)).toBe(false);
    expect(purged).toEqual(
      expect.arrayContaining([`users/${DM}/`, `bug-reports/${DM}/`])
    );
  });

  it("a hand-over keeps a change another player made after the delete read the campaign", async () => {
    const { deps } = fakes();
    // between the query and the write, Bob changes his character
    deps.beforeCampaignWrite = async (id) => {
      if (id === "table")
        await db
          .doc("campaigns/table")
          .update({ [`memberDetails.${BOB}.characterId`]: "new-c" });
    };
    await runAccountDeletion(deps, input);
    const table = await campaign("table");
    expect(table?.memberDetails?.[BOB]?.characterId).toBe("new-c");
    expect(table?.members).toEqual([ALICE, BOB]);
  });

  it("a delete that failed at the last step finishes on a re-run, as one clean run", async () => {
    const before = await othersData();
    const { deps, auth } = fakes({ failAuthOnce: true });
    await expect(runAccountDeletion(deps, input)).rejects.toThrow();
    // the user doc is already gone, the Auth account is not
    expect((await db.doc(`users/${DM}`).get()).exists).toBe(false);
    expect(auth.has(DM)).toBe(true);
    await runAccountDeletion(deps, input);
    expect(auth.has(DM)).toBe(false);
    expect(await othersData()).toEqual(before);
    expect((await db.doc("campaigns/table").get()).data()?.dmUid).toBe(ALICE);
  });

  it("a re-run after a full delete is a harmless not-found", async () => {
    const { deps } = fakes();
    await runAccountDeletion(deps, input);
    const before = await othersData();
    await expect(runAccountDeletion(deps, input)).rejects.toMatchObject({
      code: "not-found",
    });
    expect(await othersData()).toEqual(before);
  });

  it("refuses a wrong confirmation email and touches nothing", async () => {
    const before = await othersData();
    const { deps } = fakes();
    await expect(
      runAccountDeletion(deps, { ...input, confirmEmail: "someone@else.test" })
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(await othersData()).toEqual(before);
    expect((await db.doc(`users/${DM}`).get()).exists).toBe(true);
    expect((await db.doc("campaigns/table").get()).data()?.dmUid).toBe(DM);
  });
});
