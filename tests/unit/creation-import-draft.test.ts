vi.mock("firebase/firestore", () => ({}));
import { describe, expect, it, vi } from "vitest";
import { parseImportDraft } from "@/lib/character-creation/import-draft";
import { analyzeImport, reviewImport } from "@/lib/character-creation/import-review";
import { CreationDraftStorage } from "@/lib/character-creation/draft";
const original =
  "\n" +
  JSON.stringify({
    schema: 3,
    build: {
      name: "Iris",
      classes: [{ classId: "wizard", level: 1 }],
      customs: { futureFamily: { power: 12 } },
      overrides: { futureDefense: 7 },
    },
    state: {},
  }) +
  "\n";
const draft = () => ({
  schema: 1 as const,
  ownerUid: "owner",
  original,
  review: reviewImport(analyzeImport(original), "unknown", []),
  target: null,
  base: null,
});
describe("retained import review", () => {
  it("keeps exact original bytes and unresolved mechanics across reload", () => {
    const restored = parseImportDraft(JSON.parse(JSON.stringify(draft())), "owner");
    expect(restored.original).toBe(original);
    expect(restored.review.unresolved).toContain("unrecognized");
    expect(() =>
      parseImportDraft(
        { ...draft(), review: { ...draft().review, unresolved: [] } },
        "owner"
      )
    ).toThrow();
  });
  it("quarantines foreign ownership, mismatched comparison and unknown fields", () => {
    expect(() => parseImportDraft(draft(), "other")).toThrow();
    expect(() =>
      parseImportDraft(
        { ...draft(), review: { ...draft().review, reviewed: ["spells"] } },
        "owner"
      )
    ).toThrow();
    expect(() => parseImportDraft({ ...draft(), extra: true }, "owner")).toThrow();
  });
  it("archives a previous valid comparison before replacing it and never loses it when storage fails", () => {
    const records = new Map<string, string>();
    const storage = {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        records.set(key, value);
      },
      removeItem: (key: string) => {
        records.delete(key);
      },
    };
    const store = new CreationDraftStorage(storage, "draft", (value) =>
      parseImportDraft(value, "owner")
    );
    store.save(draft());
    const previous = records.get("draft");
    storage.setItem = () => {
      throw Error("full");
    };
    expect(() =>
      store.recover({
        ...draft(),
        review: reviewImport(analyzeImport(original), "2014", []),
      })
    ).toThrow();
    expect(records.get("draft")).toBe(previous);
  });
});
