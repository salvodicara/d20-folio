import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
// Intent-only unit checks; real SDK I/O is verified by the demo rules and runtime suites.
vi.mock("firebase/firestore");
import { SessionController } from "@/lib/identity/session";
import { createLibraryRepository } from "@/lib/library/repository";
import { blankDefinition, type LibraryEntry } from "@/lib/library/model";

describe("class publication boundary", () => {
  it.each(["class", "subclass"] as const)(
    "retains an incomplete %s draft but refuses a stable version",
    async (family) => {
      const session = new SessionController();
      session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
      const repo = createLibraryRepository({} as Firestore, session);
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
      await expect(repo.publishIntent(base, draft)).rejects.toThrow("invalid-definition");
      expect(base.draft).toEqual(draft);
    }
  );
});
it("bounds repeated multibyte class drafts before issuing an operation and preserves both originals", () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const repo = createLibraryRepository({} as Firestore, session);
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
});
it("refuses an offer whose final operation identifier crosses the receipt byte budget", () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const repo = createLibraryRepository({} as Firestore, session);
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
});
