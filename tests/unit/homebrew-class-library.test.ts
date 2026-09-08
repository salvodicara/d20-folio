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
