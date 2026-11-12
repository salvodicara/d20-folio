/**
 * A shared character saves through the app's REAL write paths, read by the real rules:
 * `setCharacterSharing` publishes the parent + `public/sheet` in one transaction, and
 * the autosave (`createDebouncedSave` → `updateCharacterParent`) rewrites both in one
 * batch. The rules suite builds the public sheet by hand, so it never saw what the app
 * sends: a `stripUndefined` that copied the `serverTimestamp()` sentinel into a plain
 * map made every shared save fail (#1031) while those tests stayed green.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

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

import {
  createCharacter,
  createDebouncedSave,
  setCharacterSharing,
} from "@/lib/firestore";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "../unit/_helpers";

let testEnv: RulesTestEnvironment;
let hero: CharacterDoc;

const OWNER = "owner";

function asOwner(): void {
  holder.db = testEnv.authenticatedContext(OWNER).firestore() as unknown as Firestore;
}

async function stored(path: string[]) {
  let data: Record<string, unknown> | undefined;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path.join("/")))).data();
  });
  return data;
}

const parentPath = () => ["users", OWNER, "characters", hero.id];
const sheetPath = () => [...parentPath(), "public", "sheet"];

/** The autosave the sheet runs, sent at once: resolves to the error the write met. */
async function autosave(data: CharacterDoc): Promise<unknown> {
  const save = createDebouncedSave(OWNER, hero.id, 0);
  let failure: unknown = null;
  save.save(data, {
    onRejected: (_data, err) => {
      failure = err;
    },
  });
  await save.flush();
  return failure;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-shared-save",
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
    await setDoc(doc(ctx.firestore(), "users", OWNER), { status: "active" });
  });
  asOwner();
  const fresh = makeCharacterDoc({
    name: assertNonEmptyString("Bren"),
    classId: "fighter",
    level: 3,
  });
  const id = await createCharacter(OWNER, fresh);
  hero = { ...fresh, id, revision: 0, shared: false };
});

describe("a shared character saves through the app's own writes", () => {
  it("sharing publishes the parent and its public sheet together", async () => {
    await setCharacterSharing(OWNER, hero, true);

    expect((await stored(parentPath()))?.shared).toBe(true);
    expect(await stored(sheetPath())).toBeDefined();
  });

  it("the autosave of a shared character rewrites both, and the sheet follows the edit", async () => {
    await setCharacterSharing(OWNER, hero, true);
    const edited: CharacterDoc = {
      ...hero,
      shared: true,
      revision: 2,
      character: { ...hero.character, name: assertNonEmptyString("Bren the Bold") },
    };

    expect(await autosave(edited)).toBeNull();

    expect((await stored(parentPath()))?.revision).toBe(2);
    expect(JSON.stringify(await stored(sheetPath()))).toContain("Bren the Bold");
  });

  it("stopping the share removes the public sheet", async () => {
    await setCharacterSharing(OWNER, hero, true);
    await setCharacterSharing(OWNER, { ...hero, shared: true, revision: 1 }, false);

    expect((await stored(parentPath()))?.shared).toBe(false);
    expect(await stored(sheetPath())).toBeUndefined();
  });
});
