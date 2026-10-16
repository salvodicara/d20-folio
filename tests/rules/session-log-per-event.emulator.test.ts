/**
 * Phase 3b (docs/architecture/session-log-per-event.md): the session-log readers accept
 * both shapes, today's growing document and one document per item under
 * `sessionLogs/{sessionId}/items/{itemId}`, and the rules accept the new subcollection.
 * Runs against the emulator and the real rules (`pnpm test:rules`).
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
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

import type { LogItem } from "@/lib/session-log";
import { createFirestoreSessionLogStore, perEventItemDoc } from "@/lib/session-log-io";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-session-log-per-event",
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
    for (const uid of ["dm", "ana", "out"])
      await setDoc(doc(db, "users", uid), { status: "active" });
    await setDoc(doc(db, "users", "banned"), { status: "blocked" });
    await setDoc(doc(db, "campaigns", "camp1"), {
      dmUid: "dm",
      members: ["dm", "ana", "banned"],
    });
  });
});

const dbOf = (uid: string): Firestore =>
  testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;

const SESSION = "2026-10-16";
const itemPath = (id: string) =>
  ["campaigns", "camp1", "sessionLogs", SESSION, "items", id] as const;

function event(id: string, by: string, amount: number, at = 1000): LogItem {
  return { id, by, at, type: "event", event: { kind: "damage", amount } };
}

/** Seed a session as rules-free fixtures: a head, an optional array, item docs in order. */
async function seed(array: LogItem[], items: LogItem[]): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "campaigns", "camp1", "sessionLogs", SESSION), {
      schema: 1,
      ...(array.length > 0 ? { log: array } : {}),
      lastAt: 5000,
    });
    for (const [index, item] of items.entries()) {
      await setDoc(doc(db, ...itemPath(item.id)), {
        ...item,
        serverAt: Timestamp.fromMillis(10_000 + index),
      });
    }
  });
}

const read = async (uid = "ana") => {
  const [session] = await createFirestoreSessionLogStore(dbOf(uid), "camp1").recent(1);
  return session?.items.map((item) => item.id);
};

describe("session-log readers accept one document per item", () => {
  it("reads a per-event session in server order, not by device clock", async () => {
    // b's device clock is behind, but it reached the server after a.
    await seed([], [event("a", "ana", 3, 2000), event("b", "dm", 4, 1000)]);
    expect(await read()).toEqual(["a", "b"]);
  });

  it("reads today's single document unchanged", async () => {
    await seed([event("x", "ana", 1), event("y", "dm", 2)], []);
    expect(await read()).toEqual(["x", "y"]);
  });

  it("reads the array first, then the items", async () => {
    await seed([event("x", "ana", 1)], [event("a", "ana", 3)]);
    expect(await read()).toEqual(["x", "a"]);
  });

  it("drops an item document without the envelope the fold relies on", async () => {
    await seed([], [event("a", "ana", 3)]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...itemPath("junk")), {
        serverAt: Timestamp.now(),
      });
    });
    expect(await read()).toEqual(["a"]);
  });

  it("subscribe joins both shapes and follows a new item", async () => {
    await seed([event("x", "ana", 1)], []);
    const store = createFirestoreSessionLogStore(dbOf("ana"), "camp1");
    const seen: string[][] = [];
    const done = new Promise<void>((resolveDone) => {
      const stop = store.subscribe(SESSION, (items) => {
        seen.push(items.map((item) => item.id));
        if (items.length === 2) {
          stop();
          resolveDone();
        }
      });
    });
    await setDoc(
      doc(dbOf("ana"), ...itemPath("a")),
      perEventItemDoc(event("a", "ana", 3))
    );
    await done;
    expect(seen.at(-1)).toEqual(["x", "a"]);
  });
});

describe("firestore.rules: sessionLogs/{sessionId}/items/{itemId}", () => {
  const write = (uid: string, item: LogItem, id = item.id) =>
    setDoc(doc(dbOf(uid), ...itemPath(id)), perEventItemDoc(item));

  it("a member writes one own item under its own id", async () => {
    await assertSucceeds(write("ana", event("a", "ana", 3)));
    await assertSucceeds(
      write("dm", {
        id: "c",
        by: "dm",
        at: 1,
        type: "correct",
        target: "a",
        event: { kind: "damage", amount: 2 },
      })
    );
  });

  it("refuses another's uid, a mismatched id, a client clock, an extra field", async () => {
    await assertFails(write("ana", event("a", "dm", 3)));
    await assertFails(write("ana", event("a", "ana", 3), "other-id"));
    await assertFails(
      setDoc(doc(dbOf("ana"), ...itemPath("a")), {
        ...event("a", "ana", 3),
        serverAt: Timestamp.fromMillis(1),
      })
    );
    await assertFails(
      setDoc(doc(dbOf("ana"), ...itemPath("a")), {
        ...perEventItemDoc(event("a", "ana", 3)),
        extra: true,
      })
    );
    await assertFails(
      setDoc(doc(dbOf("ana"), ...itemPath("a")), {
        ...perEventItemDoc(event("a", "ana", 3)),
        type: "rewrite",
      })
    );
  });

  it("accepts the narrative overrides as items: hide, show, move", async () => {
    for (const item of [
      { id: "h", by: "ana", at: 1, type: "hide", target: "a" },
      { id: "s", by: "ana", at: 1, type: "show", target: "a" },
      { id: "m", by: "ana", at: 1, type: "move", target: "a", after: null },
      { id: "m2", by: "ana", at: 1, type: "move", target: "a", after: "b" },
    ] as LogItem[]) {
      await assertSucceeds(write("ana", item));
    }
    await assertFails(
      write("ana", { id: "x", by: "ana", at: 1, type: "hide" } as unknown as LogItem)
    );
  });

  it("refuses an outsider and a blocked member", async () => {
    await assertFails(write("out", event("a", "out", 3)));
    await assertFails(write("banned", event("a", "banned", 3)));
  });

  it("history never changes: no update, and only the DM deletes", async () => {
    await assertSucceeds(write("ana", event("a", "ana", 3)));
    await assertFails(
      updateDoc(doc(dbOf("ana"), ...itemPath("a")), { serverAt: serverTimestamp() })
    );
    await assertFails(write("ana", event("a", "ana", 99)));
    await assertFails(deleteDoc(doc(dbOf("ana"), ...itemPath("a"))));
    await assertSucceeds(deleteDoc(doc(dbOf("dm"), ...itemPath("a"))));
  });

  it("members read the items; outsiders do not", async () => {
    await assertSucceeds(write("ana", event("a", "ana", 3)));
    await assertSucceeds(getDoc(doc(dbOf("dm"), ...itemPath("a"))));
    await assertFails(getDoc(doc(dbOf("out"), ...itemPath("a"))));
    await assertFails(
      getDocs(
        collection(dbOf("out"), "campaigns", "camp1", "sessionLogs", SESSION, "items")
      )
    );
  });
});
