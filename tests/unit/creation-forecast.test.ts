vi.mock("firebase/firestore", () => ({}));
import { describe, expect, it, vi } from "vitest";
import { catalogueSnapshot } from "@/lib/character-creation/catalogue";
import { previewCreation } from "@/lib/character-creation/compose";
import {
  answerCreationChoice,
  newCreationDraft,
  selectCreationSource,
  type CreationDraft,
  type CreationRole,
} from "@/lib/character-creation/model";
import { forecastCreation, speculate } from "@/lib/views/creation-forecast";

function start(classId: string, speciesId: string | null, backgroundId = "soldier") {
  let draft = newCreationDraft("owner", "new-character");
  draft.name = "Example";
  draft.scores = {
    strength: 15,
    dexterity: 14,
    constitution: 13,
    intelligence: 12,
    wisdom: 10,
    charisma: 8,
  };
  draft.languages = ["elvish", "dwarvish"];
  const sources: [CreationRole, string | null][] = [
    ["species", speciesId && "species:" + speciesId],
    ["background", "background:" + backgroundId],
    ["class", "class:" + classId],
  ];
  for (const [role, key] of sources)
    if (key) draft = selectCreationSource(draft, role, catalogueSnapshot(key));
  return answerCreationChoice(draft, "background", "root/background-abilities", [
    "strength:2",
    "constitution:1",
  ]);
}
function complete(draft: CreationDraft) {
  for (let round = 0; round < 50; round++) {
    const preview = previewCreation(draft);
    const choice = preview.composition.activeChoices.find(
      (c) => c.active && c.selected.length !== c.choice.count
    );
    if (!choice) return draft;
    const options = preview.options(choice);
    const selected = options.slice(0, choice.choice.count).map((o) => o.option.id);
    const snapshots = options
      .filter((o) => selected.includes(o.option.id))
      .flatMap((o) => (o.snapshot ? [o.snapshot] : []));
    draft = answerCreationChoice(
      draft,
      choice.selectionId as CreationRole,
      choice.path,
      selected,
      snapshots
    );
  }
  throw new Error("creation-cascade-did-not-settle");
}
const line = (result: ReturnType<typeof speculate>, key: string) =>
  result.forecast.lines.find((l) => l.key === key);

describe("creation consequence forecast", () => {
  it("lists the traits and the HP a species adds to a draft without one", () => {
    const draft = complete(start("fighter", null));
    const result = speculate(draft, (d) =>
      selectCreationSource(d, "species", catalogueSnapshot("species:dwarf"))
    );
    expect(result.forecast.added.some((s) => s.includes('"resistance"'))).toBe(true);
    expect(result.forecast.added.some((s) => s.includes('"poison"'))).toBe(true);
    expect(result.forecast.added.some((s) => s.includes('"hp-per-level"'))).toBe(true);
    expect(result.forecast.removed).toEqual([]);
    const hp = line(result, "maxHp");
    expect(hp?.kind).toBe("number");
    expect(Number(hp?.after)).toBeGreaterThan(Number(hp?.before));
    expect(line(result, "issueCount")?.after).toBe(0);
    expect(line(result, "valid")).toEqual({
      key: "valid",
      before: "invalid",
      after: "valid",
      kind: "text",
    });
  });
  it("reports lower HP and more open choices when a Fighter becomes a Wizard", () => {
    const draft = complete(start("fighter", "dwarf"));
    const result = speculate(draft, (d) =>
      selectCreationSource(d, "class", catalogueSnapshot("class:wizard"))
    );
    const hp = line(result, "maxHp");
    expect(Number(hp?.after)).toBeLessThan(Number(hp?.before));
    const open = line(result, "activeChoiceCount");
    expect(open?.before).toBe(0);
    expect(Number(open?.after)).toBeGreaterThan(0);
    expect(result.forecast.removed.length).toBeGreaterThan(0);
  });
  it("forecasts nothing between identical previews", () => {
    const preview = previewCreation(complete(start("rogue", "halfling")));
    expect(forecastCreation(preview, preview)).toEqual({
      lines: [],
      added: [],
      removed: [],
    });
  });
  it("skips a line whose sides are equal and names every ability", () => {
    const draft = complete(start("cleric", "dwarf"));
    const result = speculate(draft, (d) => {
      const next = structuredClone(d);
      next.scores.wisdom = 16;
      return next;
    });
    expect(result.forecast.lines.map((l) => l.key)).toEqual([
      "ability.wisdom",
      "valid",
      "issueCount",
    ]);
  });
  it("never mutates the draft it speculates on", () => {
    const draft = complete(start("fighter", "dwarf"));
    const witness = structuredClone(draft);
    speculate(draft, (d) => {
      d.name = "Mutated";
      return selectCreationSource(d, "class", catalogueSnapshot("class:wizard"));
    });
    expect(draft).toEqual(witness);
  });
});
