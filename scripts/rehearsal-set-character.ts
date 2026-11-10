/**
 * Rehearsal only: rewrite a sandbox player's character from a team fixture at a given
 * level, with some states already lit, so a journey can start from a sheet the seed
 * does not hold (a Rogue 5 whose Uncanny Dodge is claimed). Same writer as the seed
 * (`sandboxCharacterDocuments`), the emulators only.
 *
 *   node --import ./scripts/alias-loader.mjs scripts/rehearsal-set-character.ts \
 *     <uid> <characterId> <fixture.json> <level> [activeKey ...] [--state=<json>]
 *
 * `--state` merges into the fixture's compact play state (spent uses:
 * `{"trackers":{"bard-bardic-inspiration":5}}`).
 */
import { readFileSync } from "node:fs";
import { argv, env } from "node:process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

import { sandboxCharacterDocuments } from "./lib/sandbox-character.ts";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = env.GCLOUD_PROJECT ?? env.GOOGLE_CLOUD_PROJECT ?? "";

const args = argv.slice(2);
const stateArg = args.find((arg) => arg.startsWith("--state="));
const [uid, characterId, fixture, levelArg, ...activeKeys] = args.filter(
  (arg) => !arg.startsWith("--")
);
if (!uid || !characterId || !fixture || !levelArg) {
  throw new Error("usage: <uid> <characterId> <fixture.json> <level> [activeKey ...]");
}
if (!env.FIRESTORE_EMULATOR_HOST || !PROJECT_ID.startsWith("demo-")) {
  throw new Error("Refusing: the emulators and a demo- project only.");
}

const envelope = JSON.parse(
  readFileSync(resolvePath(ROOT, "content-pack", "fixtures", "team", fixture), "utf8")
) as { build: { classes?: Array<{ level: number }> }; state: Record<string, unknown> };
const [first] = envelope.build.classes ?? [];
if (!first) throw new Error(`${fixture} has no class`);
first.level = Number(levelArg);
envelope.state = {
  ...envelope.state,
  ...(activeKeys.length > 0 ? { activeFeatures: activeKeys } : {}),
  ...(stateArg ? (JSON.parse(stateArg.slice("--state=".length)) as object) : {}),
};

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const now = FieldValue.serverTimestamp();
const { parent, child } = sandboxCharacterDocuments(
  uid,
  characterId,
  envelope,
  {
    portraitUrl: null,
    portraitCrop: null,
    shared: false,
    status: "active",
    attachedCampaignId: "SANDBOX",
    createdAt: now,
    updatedAt: now,
  },
  Timestamp.now()
);
const path = `users/${uid}/characters/${characterId}`;
await db.doc(path).set(parent);
await db.doc(`${path}/combat/state`).set(child);
console.log(`set ${path} from ${fixture} at level ${levelArg}`);
