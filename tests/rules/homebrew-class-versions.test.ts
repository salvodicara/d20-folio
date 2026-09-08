import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { SessionController } from "../../src/lib/identity/session";
import { createLibraryRepository } from "../../src/lib/library/repository";
import { serializeLibraryRecovery } from "../../src/lib/library/recovery";
import { OperationController } from "../../src/lib/shared/controller";
import type { LibraryDefinition, LibraryVersion } from "../../src/lib/library/model";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { blankClassLevel } from "../../src/lib/homebrew/classes";
import { blankAdvancedRow } from "../../src/lib/homebrew/advanced";
import { conformDefinition } from "../../src/lib/homebrew/conformance";
import { includeOriginDependency } from "../../src/lib/homebrew/origins";
import { decodePortable, encodePortable } from "../../src/lib/homebrew/portable";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-d20folio",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    for (const uid of ["class-owner", "class-recipient"])
      await setDoc(doc(context.firestore(), "users/" + uid), {
        status: "active",
        role: "user",
      });
  });
});
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing class version fixture");
  return value;
}
function client(uid = "class-owner") {
  const session = new SessionController();
  session.transition({ uid, campaignId: null, activeCharacterId: null });
  const db = env.authenticatedContext(uid).firestore() as unknown as Firestore;
  return { db, session, repo: createLibraryRepository(db, session) };
}
function classDefinition(): LibraryDefinition {
  const value = initializeDefinition("class");
  value.name = "Sentinel of the lantern";
  value.description =
    "A synthetic class for immutable version and recovery verification.";
  value.payload.data.mechanicId = "synthetic-lantern-class";
  value.payload.data.progression = [1, 3, 5].map((level) =>
    blankClassLevel(level)
  ) as unknown as import("../../src/lib/library/model").JsonValue;
  return value;
}
function subclassDefinition(parent: LibraryVersion): LibraryDefinition {
  const value = initializeDefinition("subclass");
  value.name = "Order of the lantern";
  value.description = "A synthetic subclass pinned to one exact parent version.";
  value.payload.data.mechanicId = "synthetic-lantern-subclass";
  const included = includeOriginDependency(value, parent);
  included.definition.payload.data.parentClass = {
    dependency: included.key,
    mechanicId: required(parent.definition.payload.data.mechanicId),
  };
  return included.definition;
}
async function publish(
  a: ReturnType<typeof client>,
  id: string,
  definition: LibraryDefinition
) {
  expect(conformDefinition(definition)).toEqual([]);
  await a.repo.load(id);
  await a.repo.commit(a.repo.saveIntent(null, definition, id));
  const head = required(await a.repo.load(id));
  const intent = required(await a.repo.publishIntent(head, head.draft));
  const receipt = await a.repo.commit(intent);
  expect(await a.repo.reconcile(intent)).toEqual(receipt);
  return a.repo.readVersion({ ownerUid: "class-owner", id }, 1);
}

it("publishes real class and subclass versions; later class edits cannot mutate either pinned v1", async () => {
  const a = client();
  const first = await publish(a, "lantern", classDefinition());
  const child = await publish(a, "order", subclassDefinition(first));
  const base = required(await a.repo.load("lantern"));
  await a.repo.commit(
    a.repo.saveIntent(base, { ...base.draft, name: "Lantern revised" })
  );
  const next = required(await a.repo.load("lantern"));
  await a.repo.commit(required(await a.repo.publishIntent(next, next.draft)));
  expect((await a.repo.readVersion(base, 2)).definition.name).toBe("Lantern revised");
  expect(await a.repo.readVersion(base, 1)).toEqual(first);
  expect(await a.repo.readVersion({ ownerUid: "class-owner", id: "order" }, 1)).toEqual(
    child
  );
  for (const id of ["lantern", "order"])
    await assertFails(
      updateDoc(doc(a.db, `folioAccounts/class-owner/library/${id}/versions/1`), {
        definition: classDefinition(),
      })
    );
  for (const version of [first, child]) {
    const original = encodePortable(version.definition, version);
    const decoded = decodePortable(original);
    expect(decoded).toMatchObject({ ok: true, original, version });
    if (!decoded.ok) throw new Error("Portable class version unexpectedly rejected");
    expect(conformDefinition(decoded.definition)).toEqual([]);
  }
});

it("delivers the complete parent closure once and preserves the recipient copy after source revocation", async () => {
  const a = client(),
    b = client("class-recipient");
  const parent = await publish(a, "lantern", classDefinition());
  const child = await publish(a, "order", subclassDefinition(parent));
  await a.repo.commit(a.repo.offerIntent(child, "class-recipient"));
  const offer = required((await b.repo.listOffers())[0]);
  const accept = await b.repo.acceptIntent(offer);
  const receipt = await b.repo.commit(accept);
  expect(await b.repo.commit(accept)).toEqual(receipt);
  const copy = required((await b.repo.list())[0]);
  expect(await b.repo.list()).toHaveLength(1);
  expect(copy.draft).toEqual(child.definition);
  expect(copy.provenance).toMatchObject({
    source: { ownerUid: "class-owner", id: "order" },
    sourceVersion: 1,
  });
  expect(await a.repo.readGrant(offer)).toMatchObject({
    entryId: copy.id,
    sourceVersion: 1,
  });
  await a.repo.commit(a.repo.revokeIntent(offer));
  expect((await b.repo.readVersion(copy, 1)).definition).toEqual(child.definition);
  expect(conformDefinition(required(await b.repo.load(copy.id)).draft)).toEqual([]);
  await assertFails(
    getDoc(doc(b.db, "folioAccounts/class-owner/library/lantern/versions/1"))
  );
  await assertFails(getDoc(doc(b.db, "folioAccounts/class-owner/library/order")));
  expect(await b.repo.reconcile(accept)).toEqual(receipt);
});

it("roundtrips conditional choices and level-bound resource programs in a shared subclass parent closure", async () => {
  const a = client();
  const value = classDefinition();
  value.payload.data.resources = [
    { ...blankAdvancedRow("resource"), id: "light", name: "Lantern light", capacity: 3 },
  ];
  value.payload.data.programs = [
    {
      ...blankAdvancedRow("program"),
      id: "glow",
      name: "Kindle the lantern",
      resourceId: "light",
      resourceCost: 1,
    },
  ];
  value.payload.data.progression = [
    {
      ...blankClassLevel(1),
      resourceCapacities: [{ resourceId: "light", capacity: 1 }],
      programIds: ["glow"],
      choices: [
        {
          id: "path",
          name: "Lantern path",
          count: 1,
          parent: null,
          options: [{ id: "watch", name: "Watch", benefits: [] }],
        },
        {
          id: "watch-skill",
          name: "Watch training",
          count: 1,
          parent: { choiceId: "path", optionId: "watch" },
          options: [
            {
              id: "perception",
              name: "Perception",
              benefits: [{ kind: "proficiency", category: "skill", id: "perception" }],
            },
          ],
        },
      ],
    },
    { ...blankClassLevel(3), resourceCapacities: [{ resourceId: "light", capacity: 2 }] },
    { ...blankClassLevel(5), resourceCapacities: [{ resourceId: "light", capacity: 3 }] },
  ] as unknown as import("../../src/lib/library/model").JsonValue;
  const parent = await publish(a, "composed-class", value);
  const child = await publish(a, "composed-subclass", subclassDefinition(parent));
  const read = await a.repo.readVersion(
    { ownerUid: "class-owner", id: "composed-subclass" },
    1
  );
  expect(read).toEqual(child);
  expect(decodePortable(encodePortable(read.definition, read))).toMatchObject({
    ok: true,
    definition: child.definition,
    version: child,
  });
});

it("rejects stale class saves and reconciles the exact successful envelope after a later write", async () => {
  const a = client(),
    b = client();
  await publish(a, "lantern", classDefinition());
  const base = required(await a.repo.load("lantern"));
  const first = a.repo.saveIntent(base, { ...base.draft, name: "First revision" });
  const stale = b.repo.saveIntent(base, { ...base.draft, name: "Stale revision" });
  const receipt = await a.repo.commit(first);
  await expect(b.repo.commit(stale)).rejects.toThrow();
  expect(await b.repo.reconcile(stale)).toBeNull();
  const next = required(await a.repo.load("lantern"));
  await a.repo.commit(a.repo.saveIntent(next, { ...next.draft, name: "Later revision" }));
  expect(await b.repo.reconcile(first)).toEqual(receipt);
  expect((await a.repo.load("lantern"))?.draft.name).toBe("Later revision");
});

it("preserves unknown and future class payloads exactly across real draft storage and portable recovery", async () => {
  const a = client();
  for (const variant of ["unknown", "future"] as const) {
    const value = classDefinition();
    if (variant === "unknown")
      value.payload.data.futureProgression = {
        label: "雪 · futura",
        values: [1, null, false],
      };
    else value.payload.data.authoringVersion = 99;
    const original = " \n" + JSON.stringify(value, null, 3) + "\n ";
    const parsed = decodePortable(original);
    expect(parsed).toMatchObject({ ok: true, original, definition: value });
    expect(
      conformDefinition(value).some((issue) => issue.severity === "unsupported")
    ).toBe(true);
    await a.repo.load(variant);
    await a.repo.commit(a.repo.saveIntent(null, value, variant));
    expect((await a.repo.load(variant))?.draft).toEqual(value);
    const head = required(await a.repo.load(variant));
    await a.repo.commit(required(await a.repo.publishIntent(head, head.draft)));
    expect((await a.repo.readVersion(head, 1)).definition).toEqual(value);
    expect(decodePortable(encodePortable(value))).toMatchObject({
      ok: true,
      definition: value,
    });
  }
  const incompatible = '  {"format":"d20-folio-homebrew","schema":99,"raw":"雪"}\n';
  expect(decodePortable(incompatible)).toEqual({
    ok: false,
    original: incompatible,
    error: "incompatible-portable",
  });
});

it("keeps a wrong-parent subclass as a draft but rejects publication at intent and commit", async () => {
  const a = client();
  const parent = await publish(a, "lantern", classDefinition());
  const valid = subclassDefinition(parent);
  await a.repo.load("order");
  await a.repo.commit(a.repo.saveIntent(null, valid, "order"));
  const base = required(await a.repo.load("order"));
  const approved = required(await a.repo.publishIntent(base, base.draft));
  const invalid = structuredClone(valid);
  const binding = invalid.payload.data.parentClass as Record<
    string,
    import("../../src/lib/library/model").JsonValue
  >;
  binding.mechanicId = "another-class";
  expect(conformDefinition(invalid).some((issue) => issue.severity === "invalid")).toBe(
    true
  );
  // Preserve a valid CAS base while changing only the submitted declaration: the commit boundary,
  // rather than a stale-base error, must reject this forged publication.
  await expect(a.repo.commit({ ...approved, definition: invalid })).rejects.toThrow();
  expect(await a.repo.reconcile(approved)).toBeNull();
  expect(await a.repo.listVersions("order")).toEqual([]);
  await a.repo.commit(a.repo.saveIntent(base, invalid));
  const draft = required(await a.repo.load("order"));
  expect(draft.draft).toEqual(invalid);
  await expect(a.repo.publishIntent(draft, draft.draft)).rejects.toThrow();
  expect(await a.repo.listVersions("order")).toEqual([]);
});

it("stores the maximum twenty level rows without truncation and preserves rejected oversize input", async () => {
  const a = client();
  const value = classDefinition();
  value.payload.data.progression = Array.from({ length: 20 }, (_, index) => ({
    ...blankClassLevel(index + 1),
    name: `Level ${index + 1} ` + "x".repeat(1000),
  })) as unknown as import("../../src/lib/library/model").JsonValue;
  const version = await publish(a, "twenty-levels", value);
  expect(version.definition).toEqual(value);
  expect(version.definition.payload.data.progression).toHaveLength(20);
  const large = structuredClone(value);
  large.payload.data.preservedFutureText = "雪".repeat(200001);
  const original = JSON.stringify(large);
  expect(decodePortable(original)).toEqual({
    ok: false,
    original,
    error: "incompatible-portable",
  });
  const base = required(await a.repo.load("twenty-levels"));
  expect(() => a.repo.saveIntent(base, large)).toThrow("incompatible-library");
  expect(await a.repo.readVersion(base, 1)).toEqual(version);
});

it("rejects a conformant multibyte class whose complete write exceeds the operation budget before sending", async () => {
  const a = client();
  const value = classDefinition();
  value.payload.data.progression = Array.from({ length: 20 }, (_, index) => ({
    ...blankClassLevel(index + 1),
    name: "雪".repeat(9000),
  })) as unknown as import("../../src/lib/library/model").JsonValue;
  expect(conformDefinition(value)).toEqual([]);
  const original = encodePortable(value);
  expect(decodePortable(original)).toMatchObject({
    ok: true,
    original,
    definition: value,
  });
  await a.repo.load("multibyte");
  await a.repo.commit(a.repo.saveIntent(null, value, "multibyte"));
  const base = required(await a.repo.load("multibyte"));
  expect(() =>
    a.repo.saveIntent(base, { ...value, name: "Changed large class" })
  ).toThrow("library-operation-too-large");
  expect(await a.repo.load("multibyte")).toEqual(base);
  expect(encodePortable(value)).toBe(original);
});

it("isolates an incompatible stored class version and retains its server original for recovery", async () => {
  const a = client();
  const version = await publish(a, "lantern", classDefinition());
  const original = {
    ...version,
    schema: 99,
    version: 2,
    futureClass: { name: "雪", level: 21 },
  };
  await env.withSecurityRulesDisabled((context) =>
    setDoc(
      doc(context.firestore(), "folioAccounts/class-owner/library/lantern/versions/2"),
      original
    )
  );
  let issues: import("../../src/lib/library/model").LibraryIssue[] = [];
  const stop = a.repo.watchIssues((value) => {
    issues = value;
  });
  try {
    expect(await a.repo.listVersions("lantern")).toEqual([version]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe("folioAccounts/class-owner/library/lantern/versions/2");
    expect(required(issues[0]).original).toBe(serializeLibraryRecovery(original));
    expect(
      await a.repo.readVersion({ ownerUid: "class-owner", id: "lantern" }, 1)
    ).toEqual(version);
  } finally {
    stop();
  }
});

it("bounds both repeated class snapshots in acceptance before creating a recipient operation", async () => {
  const a = client(),
    b = client("class-recipient");
  const version = await publish(a, "lantern", classDefinition());
  await a.repo.commit(a.repo.offerIntent(version, "class-recipient"));
  const offer = required((await b.repo.listOffers())[0]);
  const value = classDefinition();
  value.payload.data.progression = Array.from({ length: 20 }, (_, index) => ({
    ...blankClassLevel(index + 1),
    name: "雪".repeat(6000),
  })) as unknown as import("../../src/lib/library/model").JsonValue;
  expect(conformDefinition(value)).toEqual([]);
  const oversized = { ...offer, definition: value };
  const original = JSON.stringify(oversized);
  await expect(b.repo.acceptIntent(oversized)).rejects.toThrow(
    "library-operation-too-large"
  );
  expect(JSON.stringify(oversized)).toBe(original);
  expect(await b.repo.list()).toEqual([]);
  expect(await a.repo.readGrant(offer)).toBeNull();
});

it("reconciles a real committed class write after a withheld acknowledgement without resending", async () => {
  const a = client();
  await publish(a, "lantern", classDefinition());
  const base = required(await a.repo.load("lantern"));
  const operation = a.repo.saveIntent(base, {
    ...base.draft,
    name: "Committed before response loss",
  });
  let release = () => {},
    sends = 0;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  const controller = new OperationController(
    operation,
    {
      commit: async (envelope, check) => {
        sends++;
        const receipt = await a.repo.commit(envelope, check);
        await response;
        return receipt;
      },
      reconcile: (envelope) => a.repo.reconcile(envelope),
    },
    { timeoutMs: 20 }
  );
  try {
    void controller.submit();
    await vi.waitFor(async () =>
      expect((await client().repo.load("lantern"))?.draft.name).toBe(
        "Committed before response loss"
      )
    );
    await vi.waitFor(() => expect(controller.state.status).toBe("unknown"));
    await controller.retry();
    expect(controller.state.status).toBe("acknowledged");
    expect(sends).toBe(1);
    expect((await a.repo.load("lantern"))?.revision).toBe(base.revision + 1);
  } finally {
    release();
  }
});
