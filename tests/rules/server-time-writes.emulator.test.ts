/**
 * Writes that pass a `serverTimestamp()` sentinel through `stripUndefined` store a real
 * timestamp, read through the app's own write paths on the emulator. Before #1031 the
 * helper copied every sentinel into the plain map `{ _methodName: "serverTimestamp" }`:
 * - a shared note's `updatedAt` was stored as that map (no rule checks it), so every
 *   note read back as edited on 1 January 1970;
 * - a shared character's status or portrait change (`updateCharacter`) was refused,
 *   because `public/sheet` must carry the parent's `updatedAt` as a timestamp.
 * The sharing and autosave writes have their own test (shared-character-save).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, Timestamp, type Firestore } from "firebase/firestore";

const holder = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/firebase", () => ({
  get db() {
    return holder.db;
  },
  app: {},
  auth: {},
  functions: {},
  storage: {},
}));

import { setCampaignNote, setCampaignNoteHidden } from "@/features/campaigns/campaign-io";
import { createCharacter, setCharacterSharing, updateCharacter } from "@/lib/firestore";
import type { SharedNote } from "@/types/campaign";
import { makeCharacterDoc } from "../unit/_helpers";

let testEnv: RulesTestEnvironment;

const as = (uid: string) =>
  (holder.db = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore);

async function stored(path: string): Promise<Record<string, unknown> | undefined> {
  let data: Record<string, unknown> | undefined;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data();
  });
  return data;
}

const note: SharedNote = {
  id: "note-1",
  title: "Cragmaw",
  content: "The goblins took the cart.",
  pinned: false,
  createdBy: "player",
  updatedAt: new Date(0),
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-server-time",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    for (const uid of ["dm", "player"])
      await setDoc(doc(ctx.firestore(), "users", uid), { status: "active" });
    await setDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
      name: "T",
      createdBy: "dm",
      dmUid: "dm",
      members: ["dm", "player"],
      memberDetails: {
        dm: { displayName: "dm", characterId: null, role: "dm" },
        player: { displayName: "player", characterId: null, role: "player" },
      },
      status: "active",
      inviteCode: "camp1",
    });
  });
});

describe("a shared note stores the server's time", () => {
  it("a member's note", async () => {
    as("player");
    await setCampaignNote("camp1", note);

    expect((await stored("campaigns/camp1/notes/note-1"))?.updatedAt).toBeInstanceOf(
      Timestamp
    );
  });

  it("a note the DM hides", async () => {
    as("player");
    await setCampaignNote("camp1", note);
    as("dm");
    await setCampaignNoteHidden("camp1", note, true);

    expect((await stored("campaigns/camp1/dmNotes/note-1"))?.updatedAt).toBeInstanceOf(
      Timestamp
    );
  });
});

describe("a shared character's status change keeps its public sheet in step", () => {
  it("retiring a shared character saves, and the sheet carries the new status", async () => {
    as("player");
    const fresh = makeCharacterDoc({ classId: "fighter", level: 3 });
    const id = await createCharacter("player", fresh);
    await setCharacterSharing(
      "player",
      { ...fresh, id, revision: 0, shared: false },
      true
    );

    await updateCharacter("player", id, { status: "retired" });

    const sheet = await stored(`users/player/characters/${id}/public/sheet`);
    expect(sheet?.status).toBe("retired");
    expect(sheet?.sourceUpdatedAt).toBeInstanceOf(Timestamp);
  });
});
