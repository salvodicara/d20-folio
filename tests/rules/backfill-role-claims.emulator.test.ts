/// <reference types="node" />
/**
 * EMULATOR-BACKED test of the role-claims backfill APPLY path
 * (`scripts/backfill-role-claims.ts`) against the Auth and Firestore emulators:
 * dry-run writes nothing; apply writes a private backup first, sets the claims,
 * revokes a newly blocked account's refresh tokens and verifies; a second run plans
 * nothing; a used backup directory is refused. Runs through `pnpm test:rules`.
 */
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  applyRoleClaims,
  planRoleClaims,
  readCorpus,
} from "../../scripts/backfill-role-claims";

let app: App;
let db: Firestore;
let auth: Auth;
const temporaryParents: string[] = [];

beforeAll(() => {
  app = initializeApp({ projectId: "demo-d20folio" }, "backfill-role-claims-test");
  db = getFirestore(app);
  auth = getAuth(app);
});

afterAll(async () => {
  await Promise.all(
    temporaryParents.map((dir) => rm(dir, { recursive: true, force: true }))
  );
  await deleteApp(app);
});

beforeEach(async () => {
  const { users } = await auth.listUsers(1000);
  if (users.length > 0) await auth.deleteUsers(users.map((user) => user.uid));
  const docs = await db.collection("users").listDocuments();
  await Promise.all(docs.map((ref) => ref.delete()));
  for (const [uid, data, claims] of [
    ["rc-admin", { status: "active", role: "admin" }, { beta: true }],
    ["rc-blocked", { status: "blocked" }, null],
    ["rc-plain", { status: "active" }, null],
  ] as const) {
    await auth.createUser({ uid });
    if (claims) await auth.setCustomUserClaims(uid, claims);
    await db.doc(`users/${uid}`).set(data);
  }
});

async function freshBackupDirectory(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "role-claims-"));
  temporaryParents.push(parent);
  return join(parent, "backup");
}

const claimsOf = async (uid: string) => (await auth.getUser(uid)).customClaims ?? {};

describe("backfill-role-claims against the emulators", () => {
  it("a dry-run plan writes nothing", async () => {
    const plan = planRoleClaims(...(await readCorpus(db, auth)));
    expect(plan.counts.toChange).toBe(2);
    expect(await claimsOf("rc-admin")).toEqual({ beta: true });
    expect(await claimsOf("rc-blocked")).toEqual({});
  });

  it("apply backs up, sets the claims, revokes a block, verifies, and is idempotent", async () => {
    const before = (await auth.getUser("rc-blocked")).tokensValidAfterTime;
    const backupDirectory = await freshBackupDirectory();
    const plan = planRoleClaims(...(await readCorpus(db, auth)));
    await applyRoleClaims({ db, auth, plan, backupDirectory });

    expect(await claimsOf("rc-admin")).toEqual({ beta: true, role: "admin" });
    expect(await claimsOf("rc-blocked")).toEqual({ status: "blocked" });
    expect(await claimsOf("rc-plain")).toEqual({});
    expect((await auth.getUser("rc-blocked")).tokensValidAfterTime).not.toBe(before);

    const [file] = await readdir(backupDirectory);
    const backup = JSON.parse(
      await readFile(join(backupDirectory, file ?? ""), "utf8")
    ) as {
      changes: { uid: string; before: unknown }[];
    };
    expect(backup.changes).toContainEqual({
      uid: "rc-admin",
      before: { beta: true },
      after: { beta: true, role: "admin" },
    });

    expect(planRoleClaims(...(await readCorpus(db, auth))).changes).toEqual([]);
  });

  it("refuses a backup directory that already exists", async () => {
    const backupDirectory = await freshBackupDirectory();
    const plan = planRoleClaims(...(await readCorpus(db, auth)));
    await applyRoleClaims({ db, auth, plan, backupDirectory });
    await auth.setCustomUserClaims("rc-plain", { role: "admin" });
    const again = planRoleClaims(...(await readCorpus(db, auth)));
    await expect(
      applyRoleClaims({ db, auth, plan: again, backupDirectory })
    ).rejects.toThrow(/fresh/);
    expect(await claimsOf("rc-plain")).toEqual({ role: "admin" });
  });
});
