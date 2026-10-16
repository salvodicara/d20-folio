/**
 * pack-access — who may download the private content pack (the `pack` auth claim).
 *
 *   node scripts/pack/pack-access.ts list <emittedPackDir>
 *   node scripts/pack/pack-access.ts grant <snapshotFile> <uid>… [--apply]
 *
 * `list` is read-only. It prints every account the pack matters to: admins,
 * campaign members, and owners of characters that use private ids (found by
 * matching the emitted pack's ids against each character's build), with whether
 * each already has the claim.
 *
 * `grant` is a live-data change: dry run by default. With `--apply` it first
 * writes the accounts' current custom claims to <snapshotFile> (keep it outside
 * the repo), then adds `pack: true` (other claims kept), then reads them back.
 * The owner says yes before every `--apply`.
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS, or the emulators when
 * FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST are set.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { decodeJson, type PackCore } from "../../src/data/pack-wire.ts";

/** Every id the pack defines, to spot a character built on private content. */
export function packIds(core: PackCore): Set<string> {
  const ids = new Set<string>();
  const add = (entries: ReadonlyArray<{ id?: string }>) =>
    entries.forEach((entry) => entry.id && ids.add(entry.id));
  add(core.packSpells);
  add(core.packFeats);
  add(core.packRaces);
  add(core.packBackgroundsRaw);
  add(core.packMagicItems);
  add(core.packManeuvers);
  add(core.packClassFeatures);
  Object.values(core.packSubclasses).forEach((subclasses) => add(subclasses));
  return ids;
}

export function usedPackIds(build: unknown, ids: Set<string>, found = new Set<string>()) {
  if (typeof build === "string") {
    if (ids.has(build)) found.add(build);
  } else if (build && typeof build === "object") {
    for (const value of Object.values(build)) usedPackIds(value, ids, found);
  }
  return found;
}

const db = () => getFirestore();

async function list(packDir: string) {
  const version = readFileSync(path.join(packDir, "version.txt"), "utf8").trim();
  const core = decodeJson(
    readFileSync(path.join(packDir, "content-pack", version, "core.json"), "utf8")
  ) as PackCore;
  const ids = packIds(core);
  const why = new Map<string, Set<string>>();
  const note = (uid: string, reason: string) => {
    const reasons = why.get(uid) ?? new Set<string>();
    why.set(uid, reasons.add(reason));
  };

  for (const user of (await db().collection("users").get()).docs) {
    if (user.get("role") === "admin") note(user.id, "admin");
  }
  for (const campaign of (await db().collection("campaigns").get()).docs) {
    for (const uid of (campaign.get("members") as string[] | undefined) ?? []) {
      note(uid, `member of ${campaign.get("name") ?? campaign.id}`);
    }
  }
  for (const character of (await db().collectionGroup("characters").get()).docs) {
    const owner = character.ref.parent.parent?.id;
    if (!owner) continue;
    const used = usedPackIds(character.get("build"), ids);
    if (used.size > 0) {
      note(
        owner,
        `${character.get("build.name") ?? character.id} uses ${used.size} private ids`
      );
    }
  }

  const rows = [];
  for (const [uid, reasons] of why) {
    const user = await getAuth()
      .getUser(uid)
      .catch(() => undefined);
    rows.push({
      uid,
      email: user?.email ?? "(no auth account)",
      hasClaim: user?.customClaims?.pack === true,
      why: [...reasons].join("; "),
    });
  }
  rows.sort((a, b) => a.email.localeCompare(b.email));
  console.table(rows);
  console.log(
    `${rows.length} accounts; ${rows.filter((r) => r.hasClaim).length} already have the claim.`
  );
}

async function grant(snapshotFile: string, uids: string[], apply: boolean) {
  const users = await Promise.all(uids.map((uid) => getAuth().getUser(uid)));
  for (const user of users) {
    const action = user.customClaims?.pack === true ? "already has it" : "would get it";
    console.log(
      `${user.email ?? user.uid}: ${apply ? action.replace("would get", "gets") : action}`
    );
  }
  if (!apply) {
    console.log("Dry run: nothing changed. Re-run with --apply after the owner's yes.");
    return;
  }
  if (existsSync(snapshotFile))
    throw new Error(`snapshot ${snapshotFile} exists; pick a new name`);
  writeFileSync(
    snapshotFile,
    JSON.stringify(
      users.map((u) => ({
        uid: u.uid,
        email: u.email,
        customClaims: u.customClaims ?? null,
      })),
      null,
      2
    )
  );
  for (const user of users) {
    if (user.customClaims?.pack === true) continue;
    await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, pack: true });
  }
  const after = await Promise.all(uids.map((uid) => getAuth().getUser(uid)));
  const missing = after.filter((u) => u.customClaims?.pack !== true);
  if (missing.length > 0)
    throw new Error(`claim missing after apply: ${missing.map((u) => u.uid)}`);
  console.log(`✓ ${after.length} accounts have the claim (snapshot: ${snapshotFile}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initializeApp();
  const [command, ...rest] = process.argv.slice(2);
  const args = rest.filter((arg) => !arg.startsWith("--"));
  const [first, ...uids] = args;
  if (command === "list" && first) await list(first);
  else if (command === "grant" && first && uids.length > 0)
    await grant(first, uids, rest.includes("--apply"));
  else {
    console.error(
      "usage: pack-access.ts list <packDir> | grant <snapshotFile> <uid>… [--apply]"
    );
    process.exit(1);
  }
}
