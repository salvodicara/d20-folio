#!/usr/bin/env node
/**
 * Seed the durable local Firebase sandbox used by `pnpm dev:emulators`.
 *
 * Fixed ids make the seed idempotent. The script hard-refuses every non-demo project
 * and requires both Auth + Firestore emulator hosts, so it cannot touch live users.
 * Runtime state then flows through the production Firebase adapters, rules, listeners,
 * transactions, offline queue and Storage/Functions emulators — fixtures only provide
 * initial documents.
 */

import { existsSync, readFileSync } from "node:fs";
import { env, exit } from "node:process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = env.GCLOUD_PROJECT ?? env.GOOGLE_CLOUD_PROJECT ?? "";
const CAMPAIGN_ID = "SANDBOX";
const OWNER = {
  uid: "dev-owner",
  email: "owner@sandbox.dev",
  password: "d20-folio-local-only",
  displayName: "You (DM)",
};
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

interface CharacterEnvelope {
  schema: number;
  build: {
    name: string;
    race?: string;
    classes?: unknown[];
  };
  state: Record<string, unknown>;
}

interface SandboxPlayer {
  uid: string;
  email: string;
  displayName: string;
  characterId: string;
  fixture: string;
}

const PLAYER_SPECS: readonly SandboxPlayer[] = [
  {
    uid: "dev-player-catalion",
    email: "catalion@sandbox.dev",
    displayName: "Catalion (Bard)",
    characterId: "sandbox-catalion",
    fixture: "catalion-bard.json",
  },
  {
    uid: "dev-player-mandorlino",
    email: "mandorlino@sandbox.dev",
    displayName: "Mandorlino (Paladin)",
    characterId: "sandbox-mandorlino",
    fixture: "mandorlino-paladin.json",
  },
];

function assertSafeSandbox(): void {
  if (!env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Sandbox seed requires the Firestore and Auth emulator hosts.");
  }
  if (!PROJECT_ID.startsWith("demo-")) {
    throw new Error(
      `Refusing to seed non-demo Firebase project: ${PROJECT_ID || "<unset>"}`
    );
  }
}

function loadPlayers(): Array<SandboxPlayer & { envelope: CharacterEnvelope }> {
  const fixtureDir = resolvePath(ROOT, "content-pack", "fixtures", "team");
  if (!existsSync(fixtureDir)) {
    console.warn(
      "Content pack absent: the sandbox campaign is seeded with its DM only. " +
        "Create/attach an SRD character through the real UI to exercise the public build."
    );
    return [];
  }
  return PLAYER_SPECS.map((player) => ({
    ...player,
    envelope: JSON.parse(
      readFileSync(resolvePath(fixtureDir, player.fixture), "utf8")
    ) as CharacterEnvelope,
  }));
}

async function upsertAuthUser(
  auth: ReturnType<typeof getAuth>,
  user: { uid: string; email: string; displayName: string; password?: string }
): Promise<void> {
  try {
    await auth.createUser(user);
  } catch (error: unknown) {
    if (
      typeof error !== "object" ||
      error === null ||
      (error as { code?: string }).code !== "auth/uid-already-exists"
    ) {
      throw error;
    }
    const { uid, ...profile } = user;
    await auth.updateUser(uid, profile);
  }
}

async function run(): Promise<void> {
  assertSafeSandbox();
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  const auth = getAuth();
  const now = FieldValue.serverTimestamp();
  const players = loadPlayers();

  await upsertAuthUser(auth, OWNER);
  await db.doc(`users/${OWNER.uid}`).set({
    uid: OWNER.uid,
    email: OWNER.email,
    displayName: OWNER.displayName,
    photoURL: null,
    status: "active",
    role: "admin",
    createdAt: now,
    lastActiveAt: now,
    settings: { language: "en", theme: "dark" },
  });

  for (const player of players) {
    await upsertAuthUser(auth, {
      uid: player.uid,
      email: player.email,
      displayName: player.displayName,
      password: OWNER.password,
    });
    await db.doc(`users/${player.uid}`).set({
      uid: player.uid,
      email: player.email,
      displayName: player.displayName,
      photoURL: null,
      status: "active",
      createdAt: now,
      lastActiveAt: now,
      settings: { language: "en", theme: "dark" },
    });
    await db.doc(`users/${player.uid}/characters/${player.characterId}`).set({
      ...player.envelope,
      portraitUrl: null,
      portraitCrop: null,
      shared: false,
      status: "active",
      attachedCampaignId: CAMPAIGN_ID,
      createdAt: now,
      updatedAt: now,
    });
  }

  const memberDetails: Record<string, unknown> = {
    [OWNER.uid]: {
      displayName: OWNER.displayName,
      photoURL: null,
      characterId: null,
      character: null,
      role: "dm",
    },
  };
  for (const player of players) {
    memberDetails[player.uid] = {
      displayName: player.displayName,
      photoURL: null,
      characterId: player.characterId,
      role: "player",
      character: {
        name: player.envelope.build.name,
        ...(player.envelope.build.race ? { race: player.envelope.build.race } : {}),
        ...(player.envelope.build.classes
          ? { classes: player.envelope.build.classes }
          : {}),
        portraitUrl: null,
      },
    };
  }
  await db.doc(`campaigns/${CAMPAIGN_ID}`).set({
    name: "Sandbox Campaign",
    createdBy: OWNER.uid,
    dmUid: OWNER.uid,
    members: [OWNER.uid, ...players.map((player) => player.uid)],
    memberDetails,
    status: "active",
    inviteCode: CAMPAIGN_ID,
    treasury: { pp: 0, gp: 100, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
    encounter: null,
    encounterInit: {},
    encounterSkipped: {},
    createdAt: now,
    updatedAt: now,
  });

  console.log(`\n✓ Local production-parity sandbox ready: /campaigns/${CAMPAIGN_ID}\n`);
}

run().catch((error: unknown) => {
  console.error(error);
  exit(1);
});
