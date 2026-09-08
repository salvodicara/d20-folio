import { expect, it } from "vitest";
import {
  newCreationDraft,
  selectCreationSource,
  answerCreationChoice,
  parseCreationDraft,
} from "@/lib/character-creation/model";
import {
  catalogueSnapshot,
  verifyCatalogueSnapshot,
} from "@/lib/character-creation/catalogue";
it("retains each source's answers across switches without copying active draft authority", () => {
  let draft = newCreationDraft("owner", "new-character");
  draft = selectCreationSource(draft, "species", catalogueSnapshot("species:human"));
  draft = answerCreationChoice(draft, "species", "root/size", ["small"]);
  draft = selectCreationSource(draft, "species", catalogueSnapshot("species:dwarf"));
  expect(draft.selections[draft.sources.species ?? ""]?.answers).toEqual({});
  draft = selectCreationSource(draft, "species", catalogueSnapshot("species:human"));
  expect(draft.selections[draft.sources.species ?? ""]?.answers["root/size"]).toEqual([
    "small",
  ]);
  expect(Object.keys(draft.selections)).toHaveLength(2);
  expect(
    parseCreationDraft(
      JSON.parse(JSON.stringify(draft)),
      "owner",
      verifyCatalogueSnapshot
    )
  ).toEqual(draft);
});
it("does not accept another account's retained draft or forged pinned source", () => {
  const draft = selectCreationSource(
    newCreationDraft("owner", "new-character"),
    "species",
    catalogueSnapshot("species:human")
  );
  expect(() => parseCreationDraft(draft, "different", verifyCatalogueSnapshot)).toThrow(
    "incompatible-creation-draft"
  );
  const forged = structuredClone(draft);
  const selection = forged.selections[forged.sources.species ?? ""];
  if (!selection) throw new Error("missing-test-selection");
  selection.snapshot.definition.name = "Forged";
  expect(() => parseCreationDraft(forged, "owner", verifyCatalogueSnapshot)).toThrow(
    "incompatible-creation-draft"
  );
  const wrongRole = structuredClone(draft);
  wrongRole.sources.background = wrongRole.sources.species;
  expect(() => parseCreationDraft(wrongRole, "owner", verifyCatalogueSnapshot)).toThrow(
    "incompatible-creation-draft"
  );
});
