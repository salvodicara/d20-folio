/**
 * Phase 3a step 5 (docs/architecture/play-log.md): the play log's storage, one document
 * per entry under the character, read back in server order and folded. The writer is
 * OFF in the app (PLAY_LOG_WRITER_ENABLED): this suite proves the adapter and its
 * rules against the emulator so turning it on is one switch. `pnpm test:rules`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDocs,
  collection,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

import type { PlayLogEntry } from "@/lib/play/play-log";
import {
  createFirestorePlayLogStore,
  PLAY_LOG_WRITER_ENABLED,
  playLogEntryDoc,
} from "@/lib/play/play-log-io";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-play-log",
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
    const db = ctx.firestore();
    for (const uid of ["ana", "ben"])
      await setDoc(doc(db, "users", uid), { status: "active" });
  });
});

const dbOf = (uid: string): Firestore =>
  testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

const entryPath = (id: string) =>
  ["users", "ana", "characters", "c1", "playLog", id] as const;

const slot = (id: string): PlayLogEntry => ({
  id,
  seq: 0,
  actor: "ana",
  event: { kind: "spend-slot", level: 1, pactMagic: false },
});

describe("play log storage", () => {
  it("ships with the writer off", () => {
    expect(PLAY_LOG_WRITER_ENABLED).toBe(false);
  });

  it("reads entries back in server order, numbered, whatever their ids", async () => {
    const store = createFirestorePlayLogStore(dbOf("ana"), "ana", "c1");
    await store.append(slot("z-first"));
    await store.append({ id: "a-second", seq: 0, actor: "ana", undo: "z-first" });
    await store.append({
      id: "m-third",
      seq: 0,
      actor: "ana",
      correct: "z-first",
      event: { kind: "spend-slot", level: 2, pactMagic: false },
    });
    const entries = await store.load();
    expect(entries.map((e) => [e.id, e.seq])).toEqual([
      ["z-first", 0],
      ["a-second", 1],
      ["m-third", 2],
    ]);
    expect(entries[1]).toMatchObject({ undo: "z-first" });
  });

  it("drops a stored document without the entry shape", async () => {
    const store = createFirestorePlayLogStore(dbOf("ana"), "ana", "c1");
    await store.append(slot("ok"));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...entryPath("junk")), {
        serverAt: Timestamp.now(),
      });
    });
    expect((await store.load()).map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("firestore.rules: users/{uid}/characters/{charId}/playLog/{entryId}", () => {
  const write = (uid: string, entry: PlayLogEntry, id = entry.id) =>
    setDoc(doc(dbOf(uid), ...entryPath(id)), playLogEntryDoc(entry));

  it("the owner appends their own entries", async () => {
    await assertSucceeds(write("ana", slot("e1")));
    await assertSucceeds(write("ana", { id: "u1", seq: 0, actor: "ana", undo: "e1" }));
  });

  it("refuses another user, another actor, a mismatched id, a client clock, an extra field", async () => {
    await assertFails(write("ben", { ...slot("e1"), actor: "ben" }));
    await assertFails(write("ana", { ...slot("e1"), actor: "ben" }));
    await assertFails(write("ana", slot("e1"), "other"));
    await assertFails(
      setDoc(doc(dbOf("ana"), ...entryPath("e1")), {
        ...playLogEntryDoc(slot("e1")),
        serverAt: Timestamp.fromMillis(1),
      })
    );
    await assertFails(
      setDoc(doc(dbOf("ana"), ...entryPath("e1")), {
        ...playLogEntryDoc(slot("e1")),
        extra: true,
      })
    );
  });

  it("history never changes; the owner may delete (compaction), others may not read", async () => {
    await assertSucceeds(write("ana", slot("e1")));
    await assertFails(
      updateDoc(doc(dbOf("ana"), ...entryPath("e1")), { serverAt: serverTimestamp() })
    );
    await assertFails(write("ana", slot("e1")));
    await assertFails(
      getDocs(collection(dbOf("ben"), "users", "ana", "characters", "c1", "playLog"))
    );
    await assertFails(deleteDoc(doc(dbOf("ben"), ...entryPath("e1"))));
    await assertSucceeds(deleteDoc(doc(dbOf("ana"), ...entryPath("e1"))));
  });
});
