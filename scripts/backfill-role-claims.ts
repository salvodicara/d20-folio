#!/usr/bin/env node
/**
 * Phase 5 (PREPARED, NOT RUN): roles as Auth custom claims. Give every EXISTING
 * account the claims its `/users/{uid}` doc grants — `role: "admin"` and
 * `status: "blocked"` — so `firestore.rules` and `storage.rules` can read
 * `request.auth.token` instead of a `get()` of the user doc. New writes are mirrored
 * by the `onUserRoleWritten` function (functions/src/role-claims.ts, whose mapping
 * `roleClaimsFor` here mirrors; a unit test pins the two).
 *
 * ORDER (owner-gated, each step its own yes):
 *   1. deploy the function (it mirrors every later change);
 *   2. `--dry-run`, then `--apply --backup <dir>` here;
 *   3. `--check` proves every account carries its claims;
 *   4. only then deploy the rules that read the claims. Before step 2 a blocked
 *      account would carry no claim, and the new rules would let it in.
 *
 * IDEMPOTENT: an account whose claims already match plans nothing. Every claim other
 * than role and status is kept. Applying a block also revokes the account's refresh
 * tokens, as the function does.
 *
 * Output: counts, hashes and issue CODES. Never a uid.
 *
 * Run with (dry-run is the default and writes nothing):
 *   node --import ./scripts/alias-loader.mjs scripts/backfill-role-claims.ts
 *   node --import ./scripts/alias-loader.mjs scripts/backfill-role-claims.ts --check
 *   node --import ./scripts/alias-loader.mjs scripts/backfill-role-claims.ts \
 *     --apply --backup /absolute/fresh/private/directory
 * In emulator mode both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must
 * be set, so a run can never read the emulator and write production accounts.
 */

/// <reference types="node" />

import { join, resolve } from "node:path";
import process, { argv as processArgv, env } from "node:process";
import { pathToFileURL } from "node:url";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import {
  createFreshPrivateDirectory,
  parseCliOptions,
  pathHash,
  readTargetConfiguration,
  stableJson,
  TARGET_PROJECT_ID,
  writePrivateFile,
  type MigrationIssue,
  type RawMap,
} from "./lib/migration-kit.ts";

export interface UserDoc {
  uid: string;
  data: RawMap;
}

export interface AccountClaims {
  uid: string;
  customClaims: RawMap;
}

export interface ClaimsChange {
  uid: string;
  before: RawMap;
  after: RawMap;
}

export interface RoleClaimsPlan {
  changes: ClaimsChange[];
  /** Harmless findings: a doc whose account is gone needs no claim. */
  notices: MigrationIssue[];
  counts: {
    accounts: number;
    userDocs: number;
    admins: number;
    blocked: number;
    toChange: number;
  };
}

/** The claims a user doc grants (mirror of functions/src/role-claims.ts). */
export function roleClaimsFor(user: RawMap | undefined): RawMap {
  return {
    ...(user?.role === "admin" ? { role: "admin" } : {}),
    ...(user?.status === "blocked" ? { status: "blocked" } : {}),
  };
}

function withRoleClaims(existing: RawMap, claims: RawMap): RawMap {
  const { role: _role, status: _status, ...others } = existing;
  void _role;
  void _status;
  return { ...others, ...claims };
}

/** Plan the whole corpus. Pure: no credentials, no Firebase. */
export function planRoleClaims(
  docs: readonly UserDoc[],
  accounts: readonly AccountClaims[]
): RoleClaimsPlan {
  const byUid = new Map(docs.map((doc) => [doc.uid, doc.data]));
  const accountUids = new Set(accounts.map((account) => account.uid));
  const changes: ClaimsChange[] = [];
  let admins = 0;
  let blocked = 0;
  for (const account of [...accounts].sort((a, b) => a.uid.localeCompare(b.uid))) {
    const claims = roleClaimsFor(byUid.get(account.uid));
    if (claims.role) admins += 1;
    if (claims.status) blocked += 1;
    const after = withRoleClaims(account.customClaims, claims);
    if (stableJson(after) !== stableJson(account.customClaims)) {
      changes.push({ uid: account.uid, before: account.customClaims, after });
    }
  }
  const notices: MigrationIssue[] = docs
    .filter((doc) => !accountUids.has(doc.uid))
    .map((doc) => ({
      path: `users/${doc.uid}`,
      code: "doc-without-account",
      detail: "A user doc whose Auth account no longer exists",
    }));
  return {
    changes,
    notices,
    counts: {
      accounts: accounts.length,
      userDocs: docs.length,
      admins,
      blocked,
      toChange: changes.length,
    },
  };
}

/** The printable report: counts, hashed paths and issue codes, never a uid. */
export function reportFor(plan: RoleClaimsPlan): RawMap {
  return {
    counts: plan.counts,
    changes: plan.changes.map((change) => ({
      account: pathHash(`users/${change.uid}`),
      grants: Object.keys(roleClaimsFor(change.after)).sort(),
    })),
    notices: plan.notices.map((notice) => ({
      path: pathHash(notice.path),
      code: notice.code,
    })),
  };
}

/** Every user doc and every Auth account's custom claims. */
export async function readCorpus(
  db: Firestore,
  auth: Auth
): Promise<[UserDoc[], AccountClaims[]]> {
  const snapshot = await db.collection("users").get();
  const docs = snapshot.docs.map((doc) => ({ uid: doc.id, data: doc.data() }));
  const accounts: AccountClaims[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      accounts.push({ uid: user.uid, customClaims: user.customClaims ?? {} });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return [docs, accounts];
}

/**
 * Apply a clean plan: write the private backup FIRST (every account's claims before
 * and after), then set the claims, revoke a newly blocked account's refresh tokens,
 * and reread to prove nothing is left to change.
 */
export async function applyRoleClaims(args: {
  db: Firestore;
  auth: Auth;
  plan: RoleClaimsPlan;
  backupDirectory: string;
}): Promise<void> {
  const { db, auth, plan, backupDirectory } = args;
  await createFreshPrivateDirectory(backupDirectory);
  await writePrivateFile(join(backupDirectory, "role-claims-backup.json"), {
    format: "d20-folio-role-claims-backup-v1",
    projectId: TARGET_PROJECT_ID,
    changes: plan.changes,
  });
  for (const change of plan.changes) {
    await auth.setCustomUserClaims(change.uid, change.after);
    if (change.after.status === "blocked" && change.before.status !== "blocked") {
      await auth.revokeRefreshTokens(change.uid);
    }
  }
  const left = planRoleClaims(...(await readCorpus(db, auth))).changes.length;
  if (left > 0) throw new Error(`Verification failed: ${left} account(s) still differ`);
}

async function run(): Promise<void> {
  const options = parseCliOptions(processArgv.slice(2));
  if (options.mode === "fixtures") throw new Error("--fixtures is not supported here");
  const target = await readTargetConfiguration();
  if (target.emulator !== (env.FIREBASE_AUTH_EMULATOR_HOST !== undefined)) {
    throw new Error(
      "Set both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST, or neither"
    );
  }
  const [
    { initializeApp, applicationDefault, deleteApp },
    { getFirestore },
    { getAuth },
  ] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
    import("firebase-admin/auth"),
  ]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.log(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production"})`
  );
  try {
    const db = getFirestore(app);
    const auth = getAuth(app);
    const plan = planRoleClaims(...(await readCorpus(db, auth)));
    console.log(JSON.stringify(reportFor(plan), null, 2));
    if (options.mode === "check") {
      if (plan.changes.length > 0) process.exitCode = 1;
    } else if (options.mode === "apply") {
      await applyRoleClaims({
        db,
        auth,
        plan,
        backupDirectory: options.backupDirectory,
      });
      console.log(`Applied ${plan.changes.length} claim change(s); verified.`);
    }
  } finally {
    await deleteApp(app);
  }
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
