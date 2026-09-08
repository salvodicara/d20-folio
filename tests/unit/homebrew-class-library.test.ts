import { describe, expect, it } from "vitest";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { SessionController } from "@/lib/identity/session";
import { createLibraryRepository } from "@/lib/library/repository";
import { blankDefinition, type LibraryEntry } from "@/lib/library/model";

describe("class publication boundary", () => {
  it.each(["class", "subclass"] as const)(
    "retains an incomplete %s draft but refuses a stable version",
    async (family) => {
      const app = initializeApp(
        { projectId: "demo-d20folio", apiKey: "synthetic" },
        family
      );
      try {
        const session = new SessionController();
        session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
        const repo = createLibraryRepository(getFirestore(app), session);
        const draft = { ...blankDefinition(family), name: "Incomplete class" };
        const base: LibraryEntry = {
          schema: 1,
          ownerUid: "owner",
          id: "one",
          revision: 1,
          stableVersion: 0,
          provenance: null,
          draft,
          lastOperation: { uid: "owner", opId: "saved" },
        };
        expect(repo.saveIntent(base, draft).definition).toEqual(draft);
        await expect(repo.publishIntent(base, draft)).rejects.toThrow(
          "invalid-definition"
        );
        expect(base.draft).toEqual(draft);
      } finally {
        await deleteApp(app);
      }
    }
  );
});
it("bounds repeated multibyte class drafts before issuing an operation and preserves both originals", async () => {
  const app = initializeApp(
    { projectId: "demo-d20folio", apiKey: "synthetic" },
    "budget"
  );
  try {
    const session = new SessionController();
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
    const repo = createLibraryRepository(getFirestore(app), session);
    const draft = {
      ...blankDefinition("class"),
      name: "Large class",
      description: "漢".repeat(100000),
    };
    const base: LibraryEntry = {
      schema: 1,
      ownerUid: "owner",
      id: "large",
      revision: 1,
      stableVersion: 0,
      provenance: null,
      draft,
      lastOperation: { uid: "owner", opId: "saved" },
    };
    const before = JSON.stringify(base);
    expect(() => repo.saveIntent(base, draft)).toThrow("library-operation-too-large");
    expect(JSON.stringify(base)).toBe(before);
    expect(draft.description).toHaveLength(100000);
  } finally {
    await deleteApp(app);
  }
});
it("refuses an offer whose final operation identifier crosses the receipt byte budget", async () => {
  const app = initializeApp(
    { projectId: "demo-d20folio", apiKey: "synthetic" },
    "offer-budget"
  );
  try {
    const session = new SessionController();
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
    const repo = createLibraryRepository(getFirestore(app), session);
    const definition = {
      ...blankDefinition("class"),
      name: "A",
      description: "漢".repeat(100000),
    };
    definition.payload.data = { unknown: "a".repeat(98000) };
    const version = {
      schema: 1 as const,
      ownerUid: "owner",
      entryId: "one",
      version: 1,
      definition,
      provenance: null,
      operationId: "published",
    };
    // A final offer carries this definition once; tune its multibyte size to cross only when opId is added.
    let previousSize = 0,
      rejected = false;
    for (let n = 99000; n <= 100000; n++) {
      definition.payload.data.unknown = "漢".repeat(n);
      try {
        const op = repo.offerIntent(structuredClone(version), "recipient");
        previousSize = new TextEncoder().encode(
          JSON.stringify({ operation: op, revision: op.baseRevision + 1 })
        ).byteLength;
        expect(previousSize).toBeLessThanOrEqual(600000);
      } catch (error) {
        if (error instanceof Error && error.message === "library-operation-too-large") {
          rejected = true;
          break;
        }
        throw error;
      }
    }
    expect(rejected).toBe(true);
    expect(previousSize).toBeGreaterThan(599900);
  } finally {
    await deleteApp(app);
  }
});
