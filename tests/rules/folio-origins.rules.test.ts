import {
  createOriginBuildRepository,
  type OriginBuildIssue,
} from "../../src/lib/homebrew/origin-build-repository";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { SessionController } from "../../src/lib/identity/session";
import type { FolioCharacter } from "../../src/lib/identity/model";
import type { LibraryVersion } from "../../src/lib/library/model";
import type { OriginSelection } from "../../src/lib/homebrew/origin-build";
import { serializeLibraryRecovery } from "../../src/lib/library/recovery";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  writeBatch,
  deleteDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
let env: RulesTestEnvironment;
const character = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "human",
  classId: "fighter",
  level: 1,
  revision: 1,
  currentAssignment: null,
  sheet: { build: {}, state: {} },
  portraitPath: null,
};
const snapshot: LibraryVersion = {
  schema: 1,
  ownerUid: "owner",
  entryId: "origin",
  version: 1,
  definition: {
    schema: 1,
    family: "species",
    name: "Synthetic",
    description: "",
    tags: [],
    payload: { schema: 1, data: {} },
  },
  provenance: null,
  operationId: "publish",
};
const selection: OriginSelection = {
  id: "root",
  ordinal: 0,
  snapshot,
  answers: {},
  exceptions: [],
};
const path = "folioAccounts/owner/characters/hero/origins/build";
type Selection = typeof selection;
interface RawBuild {
  schema: number;
  character: { ownerUid: string; id: string };
  revision: number;
  selections: Record<string, Selection>;
  lastOperation: { uid: string; opId: string };
}
interface RawOperation {
  kind: string;
  character: { ownerUid: string; id: string };
  targetId: string;
  predecessorId: string | null;
  base: RawBuild | null;
  selection: Selection | null;
  selections: Record<string, Selection>;
  opId: string;
  uid: string;
  scope: { uid: string; campaignId: string | null; activeCharacterId: string | null };
  baseRevision: number;
  authority: { characterRevision: number; assignment: unknown; campaignRevision: null };
}
function operation(): RawOperation {
  return {
    kind: "origin-build",
    character: { ownerUid: "owner", id: "hero" },
    targetId: "root",
    predecessorId: null,
    base: null,
    selection,
    selections: { root: selection },
    opId: crypto.randomUUID(),
    uid: "owner",
    scope: { uid: "owner", campaignId: null, activeCharacterId: "hero" },
    baseRevision: 0,
    authority: { characterRevision: 1, assignment: null, campaignRevision: null },
  };
}
function next(op: ReturnType<typeof operation>) {
  return {
    schema: 1,
    character: op.character,
    revision: op.baseRevision + 1,
    selections: op.selections,
    lastOperation: { uid: op.uid, opId: op.opId },
  };
}
async function raw(db: Firestore, op = operation(), mode = "normal") {
  // Raw fixture carries a convenient selection field; the wire envelope derives it from selections.
  const envelope: Partial<RawOperation> = { ...op };
  delete envelope.selection;
  const batch = writeBatch(db);
  batch.set(doc(db, `folioAccounts/${op.uid}/operations/${op.opId}`), {
    operation: envelope,
    revision: op.baseRevision + 1,
  });
  if (mode !== "detached") batch.set(doc(db, path), next(op));
  if (mode === "sibling")
    batch.set(doc(db, "folioAccounts/owner/characters/other/origins/build"), next(op));
  return batch.commit();
}
function client(uid = "owner") {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore;
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-d20folio",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const uid of ["owner", "member", "admin", "blocked"]) {
      await setDoc(doc(db, "users/" + uid), {
        status: uid === "blocked" ? "blocked" : "active",
        role: uid === "admin" ? "admin" : "user",
      });
    }
    await setDoc(doc(db, "folioAccounts/owner/characters/hero"), character);
    await setDoc(doc(db, "folioAccounts/owner/library/origin/versions/1"), snapshot);
  });
});
it("authorizes one root with exact snapshot and atomic receipt", async () => {
  const db = client();
  await raw(db);
  expect((await getDoc(doc(db, path))).data()?.revision).toBe(1);
});
it("rejects detached receipt, sibling write and fabricated root snapshot", async () => {
  await assertFails(raw(client(), operation(), "detached"));
  await assertFails(raw(client(), operation(), "sibling"));
  const op = operation();
  op.selection = {
    ...selection,
    snapshot: { ...snapshot, definition: { ...snapshot.definition, name: "Spoof" } },
  };
  op.selections = { root: op.selection };
  await assertFails(raw(client(), op));
});
it("rejects peer and admin fabricated consent", async () => {
  for (const uid of ["member", "admin", "blocked"]) {
    const op = {
      ...operation(),
      uid,
      scope: { uid, campaignId: null, activeCharacterId: "hero" },
    };
    await assertFails(raw(client(uid), op));
  }
});
it("rejects two root introductions", async () => {
  const op = operation();
  Object.assign(op.selections, { second: { ...selection, id: "second", ordinal: 1 } });
  await assertFails(raw(client(), op));
});

function edit(
  base: RawBuild,
  targetId = "root",
  value: Selection | null = selection
): RawOperation {
  return {
    ...operation(),
    base,
    baseRevision: base.revision,
    targetId,
    predecessorId:
      Object.values(base.selections).sort((a, b) => b.ordinal - a.ordinal)[0]?.id ?? null,
    selection: value,
    selections: value
      ? { ...base.selections, [targetId]: value }
      : Object.fromEntries(
          Object.entries(base.selections).filter(([id]) => id !== targetId)
        ),
  };
}
it("CAS rejects stale aggregate and character assignment, preserves exact base", async () => {
  const db = client(),
    first = operation();
  await raw(db, first);
  const base = next(first);
  const changed = { ...selection, answers: { choice: ["named"] } };
  const a = edit(base, "root", changed),
    b = edit(base, "root", { ...changed, answers: { choice: ["other"] } });
  await raw(db, a);
  await assertFails(raw(db, b));
  expect(
    ((await getDoc(doc(db, path))).data() as RawBuild | undefined)?.selections.root
      ?.answers
  ).toEqual({
    choice: ["named"],
  });
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), "folioAccounts/owner/characters/hero"), { revision: 2 })
  );
  await assertFails(raw(db, edit(next(a), "root", selection)));
});
it("answer edits and removal survive source deletion, replacements require exact new source", async () => {
  const db = client(),
    first = operation();
  await raw(db, first);
  await env.withSecurityRulesDisabled(async (c) =>
    deleteDoc(doc(c.firestore(), "folioAccounts/owner/library/origin/versions/1"))
  );
  const changed = edit(next(first), "root", {
    ...selection,
    answers: { choice: ["retained"] },
  });
  await raw(db, changed);
  await assertFails(
    raw(
      db,
      edit(next(changed), "root", { ...selection, snapshot: { ...snapshot, version: 2 } })
    )
  );
  const removed = edit(next(changed), "root", null);
  await raw(db, removed);
  expect((await getDoc(doc(db, path))).data()?.selections).toEqual({});
});
it("authorized roster reader needs no source access and revocation/archive deny reads", async () => {
  const db = client(),
    first = operation();
  await raw(db, first);
  const assignment = { campaignId: "party", assignmentId: "join", version: 1 };
  await env.withSecurityRulesDisabled(async (c) => {
    await updateDoc(doc(c.firestore(), "folioAccounts/owner/characters/hero"), {
      currentAssignment: assignment,
    });
    await setDoc(doc(c.firestore(), "folioCampaigns/party"), {
      schema: 1,
      id: "party",
      name: "Party",
      dmUid: "member",
      members: ["owner", "member"],
      revision: 1,
      archived: false,
      joinOpen: false,
    });
    await setDoc(doc(c.firestore(), "folioCampaigns/party/roster/owner~hero"), {
      ownerUid: "owner",
      characterId: "hero",
      assignmentId: "join",
      version: 1,
    });
  });
  expect((await getDoc(doc(client("member"), path))).exists()).toBe(true);
  await assertFails(
    getDoc(doc(client("member"), "folioAccounts/owner/library/origin/versions/1"))
  );
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party"), { archived: true })
  );
  await assertFails(getDoc(doc(client("member"), path)));
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party"), {
      archived: false,
      members: ["owner"],
    })
  );
  await assertFails(getDoc(doc(client("member"), path)));
  expect((await getDoc(doc(db, path))).exists()).toBe(true);
});
it("blocked owner cannot write or read even with admin role", async () => {
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(doc(c.firestore(), "users/owner"), { status: "blocked", role: "admin" })
  );
  await assertFails(raw(client()));
  await assertFails(getDoc(doc(client(), path)));
});
it("keeps 32 roots and a 32-node flat bundle in a single source-checked mutation", async () => {
  const db = client();
  const base: RawBuild = {
    schema: 1,
    character: { ownerUid: "owner", id: "hero" },
    revision: 1,
    selections: Object.fromEntries(
      Array.from({ length: 31 }, (_, i) => [
        "root" + String(i),
        { ...selection, id: "root" + String(i), ordinal: i },
      ])
    ),
    lastOperation: { uid: "owner", opId: "seed" },
  };
  const bundled = {
    ...snapshot,
    definition: {
      ...snapshot.definition,
      payload: {
        schema: 1 as const,
        data: {
          dependencies: Object.fromEntries(
            Array.from({ length: 32 }, (_, i) => [
              "node" + String(i),
              { source: "private", version: 1, name: "Node " + String(i) },
            ])
          ),
        },
      },
    },
  };
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), path), base);
    await setDoc(
      doc(c.firestore(), "folioAccounts/owner/library/origin/versions/1"),
      bundled
    );
  });
  const op = edit(base, "last", {
    ...selection,
    id: "last",
    ordinal: 31,
    snapshot: bundled,
  });
  await raw(db, op);
  expect(
    Object.keys(
      ((await getDoc(doc(db, path))).data() as RawBuild | undefined)?.selections ?? {}
    )
  ).toHaveLength(32);
  await assertFails(
    raw(db, edit(next(op), "overflow", { ...selection, id: "overflow", ordinal: 32 }))
  );
});
it("rejects ordinal changes, stale receipt reuse, unknown sibling paths and anonymous reads", async () => {
  const db = client(),
    first = operation();
  await raw(db, first);
  await assertFails(raw(db, edit(next(first), "root", { ...selection, ordinal: 3 })));
  await assertFails(raw(db, first));
  await assertFails(
    setDoc(doc(db, "folioAccounts/owner/characters/hero/origins/other"), next(first))
  );
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
});
it("requires exact append ordinal and bounded choice/exception shapes", async () => {
  const op = operation();
  op.selection = { ...selection, ordinal: 8 };
  op.selections = { root: op.selection };
  await assertFails(raw(client(), op));
  const excessive = operation();
  excessive.selection = {
    ...selection,
    answers: Object.fromEntries(
      Array.from({ length: 1025 }, (_, i) => ["root/choice" + String(i), ["option"]])
    ),
  };
  excessive.selections = { root: excessive.selection };
  await assertFails(raw(client(), excessive));
});

function repository() {
  const db = client();
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  return { db, session, repo: createOriginBuildRepository(db, session) };
}
async function reusable() {
  const value: OriginSelection = {
    ...selection,
    snapshot: {
      ...snapshot,
      schema: 1,
      definition: { ...initializeDefinition("species"), name: "Synthetic species" },
    },
  };
  await env.withSecurityRulesDisabled(async (c) =>
    setDoc(
      doc(c.firestore(), "folioAccounts/owner/library/origin/versions/1"),
      value.snapshot
    )
  );
  return value;
}
it("repository duplicate retry and exact reload reconciliation never replays", async () => {
  const value = await reusable(),
    { repo } = repository();
  const op = repo.saveIntent(character as FolioCharacter, null, "root", value);
  const receipt = await repo.commit(op);
  expect(await repo.commit(op)).toEqual(receipt);
  expect((await repo.read(character))?.revision).toBe(1);
  const reload = repository().repo;
  expect(await reload.reconcile(structuredClone(op))).toEqual(receipt);
  await expect(reload.commit(op)).rejects.toThrow("stale-session");
  await expect(reload.reconcile({ ...op, targetId: "forged" })).rejects.toThrow(
    "intent-mismatch"
  );
});
it("repository stale concurrent bases retain original and session invalidation fences send", async () => {
  const value = await reusable(),
    a = repository(),
    b = repository();
  const op = a.repo.saveIntent(character as FolioCharacter, null, "root", value),
    concurrent = b.repo.saveIntent(character as FolioCharacter, null, "root", value);
  await a.repo.commit(op);
  await expect(b.repo.commit(concurrent)).rejects.toThrow("stale-base");
  expect(concurrent.base).toBeNull();
  const loaded = await a.repo.read(character);
  if (!loaded) throw new Error("missing");
  const remove = a.repo.saveIntent(character as FolioCharacter, loaded, "root", null);
  a.session.transition({ uid: "owner", campaignId: null, activeCharacterId: "other" });
  a.session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  await expect(a.repo.commit(remove)).rejects.toThrow("stale-session");
  expect((await a.repo.read(character))?.revision).toBe(1);
});
it("raw malformed answers can corrupt only the owner build and read exposes exact recovery", async () => {
  const value = await reusable();
  const op = operation();
  op.selection = {
    ...value,
    answers: { "root/choice": Array(33).fill("option") },
  };
  op.selections = { root: op.selection };
  await raw(client(), op);
  const original = (await getDoc(doc(client(), path))).data();
  const { repo } = repository();
  let issues: OriginBuildIssue[] = [];
  const stop = repo.watchIssues((v) => {
    issues = v;
  });
  await expect(repo.read(character)).rejects.toThrow("incompatible-origin-build");
  expect(issues[0]?.original).toEqual(serializeLibraryRecovery(original));
  const fresh = repo.saveIntent(character as FolioCharacter, null, "root", value);
  await expect(repo.commit(fresh)).rejects.toThrow("stale-base");
  expect((await getDoc(doc(client(), path))).data()).toEqual(original);
  stop();
});
it("unknown aggregate shape never silently presents an imported baseline", async () => {
  const original = { schema: 99, future: { typed: ["retained"] } };
  await env.withSecurityRulesDisabled(async (c) =>
    setDoc(doc(c.firestore(), path), original)
  );
  const { repo } = repository();
  let issue: OriginBuildIssue | undefined;
  repo.watchIssues((v) => {
    issue = v[0];
  });
  await expect(repo.read(character)).rejects.toThrow("incompatible-origin-build");
  expect(issue?.original).toBe(serializeLibraryRecovery(original));
});
it("real committed response loss reconciles the exact receipt without another mutation", async () => {
  const value = await reusable(),
    { repo } = repository();
  const op = repo.saveIntent(character as FolioCharacter, null, "root", value);
  const { OperationController } = await import("../../src/lib/shared/controller");
  let sends = 0;
  const controller = new OperationController(op, {
    commit: async (envelope, check) => {
      sends++;
      await repo.commit(envelope, check);
      throw new Error("simulated-response-loss-after-real-commit");
    },
    reconcile: (envelope) => repo.reconcile(envelope),
  });
  await controller.submit();
  expect(controller.state.status).toBe("unknown");
  expect((await repo.read(character))?.revision).toBe(1);
  await controller.retry();
  expect(controller.state.status).toBe("acknowledged");
  expect(sends).toBe(1);
  expect((await repo.read(character))?.revision).toBe(1);
});
it("watch reports malformed originals and drops callbacks after scope invalidation", async () => {
  const { repo, session } = repository();
  const value = await reusable();
  const op = repo.saveIntent(character as FolioCharacter, null, "root", value);
  await repo.commit(op);
  const values: unknown[] = [];
  let errors = 0;
  const received = new Promise<void>((resolve, reject) => {
    repo.watch(
      character,
      (v) => {
        values.push(v);
        resolve();
      },
      reject
    );
  });
  await received;
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: "other" });
  await env.withSecurityRulesDisabled(async (c) =>
    setDoc(doc(c.firestore(), path), { schema: 99 })
  );
  expect(values).toHaveLength(1);
  const malformed = new Promise<void>((resolve) => {
    repo.watch(
      character,
      () => {
        throw new Error("unexpected compatible value");
      },
      () => {
        errors++;
        resolve();
      }
    );
  });
  await malformed;
  expect(errors).toBe(1);
});
it("persists an owned root bundle containing a private feat without any child library authority", async () => {
  const { includeOriginDependency, originNodePath } =
    await import("../../src/lib/homebrew/origins");
  const value = await reusable();
  const feat = initializeDefinition("feat");
  feat.name = "Private bundled feat";
  feat.payload.data.choices = [
    {
      id: "gift",
      name: "Gift",
      count: 1,
      parent: null,
      options: [
        {
          id: "insight",
          name: "Insight",
          benefits: [{ kind: "proficiency", category: "skill", id: "insight" }],
        },
      ],
    },
  ];
  const child: LibraryVersion = {
    ...snapshot,
    ownerUid: "private-creator",
    entryId: "private-feat",
    definition: feat,
  };
  const bundled = includeOriginDependency(value.snapshot.definition, child);
  bundled.definition.payload.data.benefits = [
    { kind: "reference", dependency: bundled.key },
  ];
  value.snapshot = { ...value.snapshot, definition: bundled.definition };
  value.answers = { [originNodePath("root", bundled.key) + "/gift"]: ["insight"] };
  await env.withSecurityRulesDisabled(async (c) =>
    setDoc(
      doc(c.firestore(), "folioAccounts/owner/library/origin/versions/1"),
      value.snapshot
    )
  );
  const { repo, db } = repository();
  await assertFails(
    getDoc(doc(db, "folioAccounts/private-creator/library/private-feat/versions/1"))
  );
  await repo.commit(repo.saveIntent(character as FolioCharacter, null, "root", value));
  expect((await repo.read(character))?.selections.root?.snapshot).toEqual(value.snapshot);
});
it("concurrent identical origin sends acknowledge one exact receipt", async () => {
  const value = await reusable(),
    { repo } = repository();
  for (let i = 0; i < 8; i++) {
    const base = await repo.read(character);
    const op = repo.saveIntent(character as FolioCharacter, base, "root", {
      ...value,
      answers: { "root/retained": [String(i)] },
    });
    const receipts = await Promise.all([repo.commit(op), repo.commit(op)]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect((await repo.read(character))?.revision).toBe(i + 1);
  }
});
