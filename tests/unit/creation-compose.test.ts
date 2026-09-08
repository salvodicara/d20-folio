vi.mock("firebase/firestore", () => ({}));
import type { Firestore } from "firebase/firestore";
import { createCreationRepository } from "@/lib/character-creation/repository";
import { SessionController } from "@/lib/identity/session";
import {
  composeAcquisitionBuilds,
  projectAcquisitionCharacter,
} from "@/lib/homebrew/origin-build";
import { verifyCatalogueSnapshot } from "@/lib/character-creation/catalogue";
import { resolveCreationPool } from "@/lib/character-creation/catalogue-pools";
import { describe, expect, it, vi } from "vitest";
import {
  newCreationDraft,
  selectCreationSource,
  answerCreationChoice,
} from "@/lib/character-creation/model";
import { catalogueSnapshot } from "@/lib/character-creation/catalogue";
import {
  previewCreation,
  creationCandidate,
  validateCreationCandidate,
} from "@/lib/character-creation/compose";
import { creationSources } from "@/lib/character-creation/catalogue-source";

function start(
  classId: string,
  speciesId = "dwarf",
  backgroundId = "soldier",
  broadScores = false
) {
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
  if (broadScores) {
    draft.method = "manual";
    draft.scores = {
      strength: 18,
      dexterity: 18,
      constitution: 18,
      intelligence: 18,
      wisdom: 18,
      charisma: 18,
    };
  }
  for (const [role, key] of [
    ["species", "species:" + speciesId],
    ["background", "background:" + backgroundId],
    ["class", "class:" + classId],
  ] as const)
    draft = selectCreationSource(draft, role, catalogueSnapshot(key));
  const background = catalogueSnapshot("background:" + backgroundId).definition.payload
    .data;
  return answerCreationChoice(
    draft,
    "background",
    "root/background-abilities",
    broadScores
      ? [(background.ability1 as string) + ":2", (background.ability2 as string) + ":1"]
      : ["strength:2", "constitution:1"]
  );
}
function complete(
  classId: string,
  speciesId = "dwarf",
  backgroundId = "soldier",
  broadScores = false
) {
  let draft = start(classId, speciesId, backgroundId, broadScores);
  for (let round = 0; round < 50; round++) {
    const preview = previewCreation(draft);
    const choice = preview.composition.activeChoices.find(
      (c) => c.active && c.selected.length !== c.choice.count
    );
    if (!choice) return { draft, preview };
    const selected = choice.choice.options.slice(0, choice.choice.count).map((o) => o.id);
    const snapshots = preview
      .options(choice)
      .filter((o) => selected.includes(o.option.id))
      .flatMap((o) => (o.snapshot ? [o.snapshot] : []));
    draft = answerCreationChoice(
      draft,
      choice.selectionId as "species" | "background" | "class",
      choice.path,
      selected,
      snapshots
    );
  }
  throw new Error("creation-cascade-did-not-settle");
}
function expectRetainable(draft: ReturnType<typeof newCreationDraft>) {
  const session = new SessionController();
  session.transition({ uid: draft.ownerUid, campaignId: null, activeCharacterId: null });
  const repository = createCreationRepository({} as Firestore, session, {
    verifyCatalogue: verifyCatalogueSnapshot,
    validateCandidate: validateCreationCandidate,
  });
  const operation = repository.intent(creationCandidate(draft));
  expect(() => repository.validateRecovered(structuredClone(operation))).not.toThrow();
}
describe("guided creation composition", () => {
  it.each(creationSources("class"))("completes and retains class $id", (source) => {
    const { draft, preview } = complete(source.id);
    expectRetainable(draft);
    expect(preview.issues, source.key).toEqual([]);
    expect(preview.valid, source.key).toBe(true);
  });
  it.each(creationSources("species"))("completes and retains species $id", (source) => {
    const { draft, preview } = complete("wizard", source.id, "soldier", true);
    expect(preview.issues, source.key).toEqual([]);
    expectRetainable(draft);
  });
  it.each(creationSources("background"))(
    "completes and retains background $id",
    (source) => {
      const { draft, preview } = complete("wizard", "dwarf", source.id, true);
      expect(preview.issues, source.key).toEqual([]);
      expectRetainable(draft);
    }
  );
  it("derives starting HP and currency once without duplicating origin or class facts", () => {
    const { preview } = complete("fighter");
    expect(preview.abilities.constitution).toBe(14);
    expect(preview.maxHp).toBe(13);
    expect(preview.loadout.instances).not.toEqual({});
    expect(preview.character.sheet.build).not.toHaveProperty("classes");
    expect(preview.character.sheet.build).not.toHaveProperty("equipment");
    expect(preview.character.sheet.state.hp).toEqual({ current: 13, temp: 0 });
  });
  it("keeps selected expertise visible when reviewing the completed choices", () => {
    const { preview } = complete("rogue");
    const expertise = preview.composition.activeChoices.find(
      (c) => c.choice.selectedGrant?.kind === "expertise"
    );
    expect(expertise).toBeDefined();
    if (!expertise) throw new Error("missing-test-expertise");
    expect(preview.options(expertise).map((o) => o.option.id)).toEqual(
      expertise.choice.options.map((o) => o.id)
    );
  });
  it("recomputes initial personal state at the repository boundary", () => {
    const { draft } = complete("fighter");
    const candidate = creationCandidate(draft);
    expect(() => validateCreationCandidate(candidate)).not.toThrow();
    const forged = structuredClone(candidate);
    forged.character.sheet.state.hp = { current: 999, temp: 0 };
    expect(() => validateCreationCandidate(forged)).toThrow("invalid-creation");
  });
});

import { initializeDefinition } from "@/lib/homebrew/model";
it("review: inactive spell snapshots never replace the active selected source", () => {
  const { draft, preview } = complete("wizard");
  expect(preview.valid).toBe(true);
  const key = draft.sources.class;
  if (!key) throw Error("fixture");
  const cls = draft.selections[key];
  if (!cls) throw Error("fixture");
  const spell = preview.composition.facts.find(
    (f) => f.selectionId === "class" && f.benefit.kind === "spell"
  );
  if (!spell || spell.benefit.kind !== "spell") throw Error("fixture");
  const definition = initializeDefinition("spell");
  definition.name = "Inactive replacement";
  definition.payload.data.mechanicId = spell.benefit.id;
  const inactive = {
    schema: 1 as const,
    ownerUid: "owner",
    entryId: "inactive-spell",
    version: 1,
    definition,
    provenance: null,
    operationId: "publish",
  };
  cls.resolvedChoices = { "root/obsolete": [inactive], ...cls.resolvedChoices };
  expect(previewCreation(draft).valid).toBe(true);
  const candidate = creationCandidate(draft);
  expect(() => validateCreationCandidate(candidate)).not.toThrow();
  expect(
    Object.values(candidate.loadout.instances).some(
      (i) => i.snapshot.definition.name === "Inactive replacement"
    )
  ).toBe(false);
});
import { includeOriginDependency } from "@/lib/homebrew/origins";
it("review: an included custom spell receives an exact bundled personal copy", () => {
  let { draft } = complete("fighter");
  const spellDefinition = initializeDefinition("spell");
  spellDefinition.name = "Private included spell";
  spellDefinition.payload.data.mechanicId = "private-spell";
  const spell = {
    schema: 1 as const,
    ownerUid: "owner",
    entryId: "private-spell",
    version: 1,
    definition: spellDefinition,
    provenance: null,
    operationId: "publish",
  };
  let definition = initializeDefinition("species");
  definition.name = "Custom species";
  definition = includeOriginDependency(definition, spell).definition;
  definition.payload.data.benefits = [
    { kind: "spell", id: "private-spell", ability: "wisdom", policy: "known" },
  ];
  const root = {
    schema: 1 as const,
    ownerUid: "owner",
    entryId: "custom-species",
    version: 1,
    definition,
    provenance: null,
    operationId: "publish",
  };
  draft = selectCreationSource(draft, "species", root);
  expect(previewCreation(draft).valid).toBe(true);
  const candidate = creationCandidate(draft);
  expect(() => validateCreationCandidate(candidate)).not.toThrow();
  expect(
    Object.values(candidate.loadout.instances).some(
      (i) => i.snapshot.definition.name === "Private included spell"
    )
  ).toBe(true);
});

it("evaluates catalogue armor prerequisites against actual class training", () => {
  const { draft, preview } = complete("fighter", "dwarf", "soldier", true);
  const source = creationSources("feat").find(
    (s) => s.kind === "feat" && s.value.prereq?.armorTraining === "medium"
  );
  if (!source) return; // Private catalogue owns the current examples; generic synthetic coverage runs SRD-only.
  const snapshot = catalogueSnapshot(source.key);
  const requirements = snapshot.definition.payload.data.prerequisites as unknown as {
    kind: string;
  }[];
  const selection = {
    id: "armor-feat",
    ordinal: 2,
    snapshot,
    answers: {},
    exceptions: requirements.flatMap((r, i) =>
      r.kind === "level"
        ? [
            {
              path: "root/prerequisites/" + String(i),
              code: "prerequisite-level",
              reason: "Owner permits a level-one feat",
              authorUid: draft.ownerUid,
            },
          ]
        : []
    ),
  };
  const origins = structuredClone(preview.origins);
  origins.selections[selection.id] = selection;
  const result = composeAcquisitionBuilds(preview.character, origins, preview.classes, {
    verifyCatalogue: verifyCatalogueSnapshot,
    resolvePool: resolveCreationPool,
  });
  expect(
    result.diagnostics.filter(
      (d) => d.selectionId === selection.id && d.code === "prerequisite-training"
    )
  ).toEqual([]);
  const missing = composeAcquisitionBuilds(preview.character, origins, null, {
    verifyCatalogue: verifyCatalogueSnapshot,
    resolvePool: resolveCreationPool,
  });
  expect(
    missing.diagnostics.some(
      (d) => d.selectionId === selection.id && d.code === "prerequisite-training"
    )
  ).toBe(true);
});

it("projects one class/origin composition with canonical catalogue identity and unchanged personal state", () => {
  const { preview } = complete("fighter");
  const projection = projectAcquisitionCharacter(
    preview.character,
    preview.origins,
    preview.classes,
    { verifyCatalogue: verifyCatalogueSnapshot, resolvePool: resolveCreationPool }
  );
  expect(projection.projectedCharacter.speciesId).toBe("dwarf");
  expect(projection.projectedCharacter.classId).toBe("fighter");
  expect(projection.projectedCharacter.sheet.build.classes).toEqual([
    { classId: "fighter", level: 1 },
  ]);
  expect(projection.abilities).toEqual(preview.abilities);
  expect(projection.projectedCharacter.sheet.state).toEqual(
    preview.character.sheet.state
  );
});
