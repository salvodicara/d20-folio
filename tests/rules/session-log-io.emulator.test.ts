/**
 * The Firestore session-log adapter against the emulator and the real rules: two devices
 * record through the same recorder the app uses and read back one shared, ordered log.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";

import { createSessionRecorder, foldSession } from "@/lib/session-log";
import type { LogItem } from "@/lib/session-log";
import { createFirestoreSessionLogStore } from "@/lib/session-log-io";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-session-log",
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
    for (const uid of ["dm", "ana"])
      await setDoc(doc(db, "users", uid), { status: "active" });
    await setDoc(doc(db, "campaigns", "camp1"), { dmUid: "dm", members: ["dm", "ana"] });
  });
});

const dbOf = (uid: string): Firestore =>
  testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

describe("session-log Firestore adapter", () => {
  it("two devices share one ordered session and the fold applies the DM's correction", async () => {
    const now = () => new Date(2026, 9, 8, 20, 0);
    const ana = createSessionRecorder({
      store: createFirestoreSessionLogStore(dbOf("ana"), "camp1"),
      uid: "ana",
      now,
    });
    const dm = createSessionRecorder({
      store: createFirestoreSessionLogStore(dbOf("dm"), "camp1"),
      uid: "dm",
      now,
    });

    const hit = await ana.record({ kind: "damage", amount: 14 });
    await dm.record({ kind: "round-start", round: 1 });
    await dm.correct(hit, { kind: "damage", amount: 12 });

    const store = createFirestoreSessionLogStore(dbOf("ana"), "camp1");
    expect(await store.latest()).toMatchObject({ id: "2026-10-08" });
    const items = await new Promise<LogItem[]>((done) => {
      const stop = store.subscribe("2026-10-08", (log) => {
        if (log.length === 3) {
          stop();
          done(log);
        }
      });
    });
    expect(items.map((i) => [i.type, i.by])).toEqual([
      ["event", "ana"],
      ["event", "dm"],
      ["correct", "dm"],
    ]);
    expect(foldSession(items, { dmUid: "dm" })[0]).toMatchObject({
      corrected: true,
      event: { amount: 12 },
    });
  });
});
