import { describe, expect, it } from "vitest";
import {
  createCharacterBuild,
  parseCharacterBuild,
  serializeCharacterBuild,
} from "@/lib/character-build-io";
import type { CharacterBuild } from "@/types/character-build";

const SEED = {
  identity: {
    name: "Lyra Voss",
    playerName: "Sal",
    quote: "The road remembers.",
    speciesId: "elf",
    backgroundId: "wayfarer",
    backgroundFeatOverrideId: null,
    alignmentId: "chaotic-good",
  },
  classes: [
    {
      classId: "bard",
      subclassId: "college-of-lore",
      level: 5,
      choices: {
        weaponMasteryIds: [],
        metamagicIds: [],
        invocationIds: [],
        maneuverIds: [],
        fightingStyleIds: [],
      },
    },
  ],
  abilityScores: { STR: 8, DEX: 16, CON: 14, INT: 12, WIS: 10, CHA: 18 },
} as const;

const DAMAGE_PROGRAM = {
  version: 1,
  id: "lantern-flare",
  phases: [
    {
      id: "resolve",
      trigger: { kind: "resolve" },
      steps: [
        {
          id: "flare",
          kind: "damage",
          scope: "target",
          subject: "target",
          amount: { kind: "fixed", value: 1 },
          damageType: { kind: "fixed", damageType: "radiant" },
        },
      ],
    },
  ],
} as const;

function minimal(): CharacterBuild {
  return createCharacterBuild(SEED);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("expected record");
  }
  return value as Record<string, unknown>;
}

function richBuild(): unknown {
  return {
    ...minimal(),
    classes: [
      {
        classId: "bard",
        subclassId: "college-of-lore",
        level: 5,
        choices: {
          weaponMasteryIds: ["rapier", "dagger", "rapier"],
          metamagicIds: [],
          invocationIds: [],
          maneuverIds: [],
          fightingStyleIds: ["dueling"],
        },
      },
      {
        classId: "warlock",
        subclassId: null,
        level: 2,
        choices: {
          weaponMasteryIds: [],
          metamagicIds: [],
          invocationIds: ["repelling-blast", "agonizing-blast", "agonizing-blast"],
          maneuverIds: [],
          fightingStyleIds: [],
        },
      },
    ],
    origin: { speciesFeatId: "magic-initiate", speciesSpellAbility: "CHA" },
    proficiencies: {
      skills: { stealth: "expertise", arcana: "proficient" },
      languageIds: ["elvish", "common", "elvish"],
      customLanguages: ["Deep Cant", "Auran", "Deep Cant"],
      toolIds: ["lute", "thieves-tools"],
      customTools: ["Star compass"],
      toolChoices: { "bard::tool-slot-0": ["viol", "lute", "viol"] },
    },
    spells: {
      "spell:z": {
        source: { kind: "feature", featureId: "magic-initiate" },
        definition: { kind: "catalogue", spellId: "fire-bolt" },
        notes: "Blue flame.",
        tags: [
          { label: "Damage", color: "red" },
          { label: "Arcane", color: "blue" },
        ],
        spellAbilityOverride: "INT",
      },
      "spell:a": {
        source: { kind: "manual" },
        definition: {
          kind: "custom",
          name: "Lantern Step",
          level: 1,
          school: "conjuration",
          castingTime: "bonus",
          range: "Self",
          components: {
            verbal: true,
            somatic: true,
            material: false,
            materialDescription: null,
          },
          duration: "Instantaneous",
          concentration: false,
          description: "Step through a nearby flame.",
          higherLevels: null,
          program: DAMAGE_PROGRAM,
        },
        notes: "Homebrew.",
        tags: [],
        spellAbilityOverride: null,
      },
    },
    features: {
      "feature:z": {
        source: { kind: "class", classId: "bard" },
        definition: { kind: "catalogue", featureId: "bard-bardic-inspiration" },
        notes: "Table ruling.",
        tags: [],
      },
      "feature:a": {
        source: { kind: "manual" },
        definition: {
          kind: "custom",
          title: "Lantern Ward",
          emoji: "🏮",
          subtitle: null,
          sourceLabel: "Homebrew",
          contentBlocks: [
            { type: "text", title: null, text: "A ward made from living light." },
            { type: "list", title: "Effects", items: ["Glow", "Protect"] },
            {
              type: "table",
              title: "Ward",
              table: { headers: ["Level", "Die"], rows: [["1", "d6"]] },
            },
          ],
          resources: {
            "lantern-ward": {
              label: "Lantern Ward",
              spec: {
                kind: "count",
                id: "lantern-ward",
                capacity: {
                  kind: "bounded",
                  amount: { kind: "fixed", value: 1 },
                },
                initial: { kind: "full" },
                recoveries: [
                  { trigger: { kind: "long-rest" }, amount: { kind: "full" } },
                ],
              },
            },
          },
          grants: [{ type: "darkvision", range: 60 }],
          actions: [
            {
              id: "ward",
              slot: "reaction",
              label: "Ward",
              description: "Reduce harm to an ally.",
              cost: {
                selector: {
                  kind: "pool",
                  owner: "owner",
                  resourceId: "lantern-ward",
                },
                amount: { kind: "fixed", value: 1 },
              },
              program: DAMAGE_PROGRAM,
            },
          ],
        },
        notes: "",
        tags: [{ label: "Ward", color: "gold" }],
      },
    },
    overrides: {
      armorClass: 18,
      walkingSpeedFt: 35,
      hitPointMaximumAdjustment: 7,
      proficiencyBonus: null,
      initiativeBonus: 2,
      initiativeRoll: "normal",
      spellcastingByClass: {
        warlock: {
          ability: "CHA",
          saveDifficultyClass: null,
          attackBonus: 9,
          preparedMaximum: null,
        },
      },
      savingThrowBonuses: { WIS: 1, DEX: 2 },
      savingThrowProficiencies: { CHA: false, WIS: true },
      skillBonuses: { stealth: 2, arcana: 1 },
      passiveScores: { perception: 17 },
      sensesFt: { darkvision: 120 },
      speedsFt: { fly: 30 },
      damageResistances: { fire: true },
      damageImmunities: { poison: false },
      damageVulnerabilities: {},
      conditionImmunities: { poisoned: true },
      armorProficiencies: { "light-armor": true },
      weaponProficiencies: { longswords: false },
    },
    lore: {
      traits: "Restless",
      ideals: "Freedom",
      bonds: "The old road",
      flaws: "Proud",
      backstory: "A very long walk.",
      age: "32",
      height: "5'8\"",
      weight: "130 lb",
      eyes: "Grey",
      hair: "Black",
      skin: "Copper",
    },
    combatAlgorithm: [
      {
        emoji: "⚔️",
        title: "Opening",
        steps: [{ question: null, indent: false, bullets: ["Assess", "Act"] }],
      },
    ],
    customConditions: {
      moonlit: {
        label: "Moonlit",
        description: "Silver light exposes hidden paths.",
        grants: [{ type: "darkvision-bonus", amount: 30 }],
        program: null,
      },
      "ash-marked": {
        label: "Ash-marked",
        description: "A narrative scar with no deterministic mechanics.",
        grants: [],
        program: null,
      },
    },
  };
}

describe("canonical CharacterBuild IO", () => {
  it("constructs the minimum frozen build without schema, derivations, or play state", () => {
    const build = minimal();

    expect(build).toMatchObject({
      identity: SEED.identity,
      classes: SEED.classes,
      abilityScores: SEED.abilityScores,
      origin: { speciesFeatId: null, speciesSpellAbility: null },
      proficiencies: {
        skills: {},
        languageIds: [],
        customLanguages: [],
        toolIds: [],
        customTools: [],
        toolChoices: {},
      },
      spells: {},
      features: {},
      overrides: {
        armorClass: null,
        walkingSpeedFt: null,
        hitPointMaximumAdjustment: null,
        proficiencyBonus: null,
        initiativeBonus: null,
        initiativeRoll: null,
      },
      combatAlgorithm: [],
      customConditions: {},
    });
    expect(Object.keys(build)).not.toContain("schema");
    expect(JSON.stringify(build)).not.toMatch(
      /"(?:session|hp|ac|speed|spellSlots|equipment|weapons|prepared)"/
    );
    expect(Object.isFrozen(build)).toBe(true);
    expect(Object.isFrozen(build.classes[0]?.choices)).toBe(true);
    expect(Object.isFrozen(build.overrides.spellcastingByClass)).toBe(true);
  });

  it("round-trips canonical programs, grants, and resource definitions", () => {
    const input = richBuild();
    const parsed = parseCharacterBuild(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.classes[0]?.choices.weaponMasteryIds).toEqual([
      "dagger",
      "rapier",
    ]);
    expect(parsed.value.classes[1]?.choices.invocationIds).toEqual([
      "agonizing-blast",
      "repelling-blast",
    ]);
    expect(Object.keys(parsed.value.spells)).toEqual(["spell:a", "spell:z"]);
    expect(Object.keys(parsed.value.features)).toEqual(["feature:a", "feature:z"]);
    expect(parsed.value.proficiencies.languageIds).toEqual(["common", "elvish"]);
    expect(Object.keys(parsed.value.customConditions)).toEqual(["ash-marked", "moonlit"]);
    expect(parsed.value.customConditions["ash-marked"]?.grants).toEqual([]);
    const custom = parsed.value.features["feature:a"]?.definition;
    expect(custom?.kind).toBe("custom");
    if (custom?.kind !== "custom") return;
    expect(custom.grants).toEqual([{ type: "darkvision", range: 60 }]);
    expect(custom.actions[0]).toMatchObject({
      id: "ward",
      slot: "reaction",
      cost: {
        selector: { kind: "pool", owner: "owner", resourceId: "lantern-ward" },
        amount: { kind: "fixed", value: 1 },
      },
      program: { id: "lantern-flare", version: 1 },
    });
    expect(custom.resources["lantern-ward"]?.spec).toMatchObject({
      kind: "count",
      capacity: { kind: "bounded", amount: { kind: "fixed", value: 1 } },
      initial: { kind: "full" },
    });
    expect(Object.isFrozen(custom.actions[0]?.program)).toBe(true);
    const inputFeatures = record(record(input).features);
    const inputDefinition = record(record(inputFeatures["feature:a"]).definition);
    const inputActions = inputDefinition.actions as unknown[];
    expect(custom.actions[0]?.program).not.toBe(record(inputActions[0]).program);

    const bytes = serializeCharacterBuild(parsed.value);
    const reparsed = parseCharacterBuild(JSON.parse(bytes));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(parsed.value);
    expect(serializeCharacterBuild(reparsed.value)).toBe(bytes);
    expect(Object.isFrozen(reparsed.value.features["feature:a"])).toBe(true);
  });

  it("uses record keys as choice identity and preserves explicit suppression", () => {
    const repeatedChoices = structuredClone(richBuild());
    const spells = record(record(repeatedChoices).spells);
    spells["spell:second-fire-bolt"] = structuredClone(spells["spell:z"]);
    const features = record(record(repeatedChoices).features);
    features["feature:second-inspiration"] = structuredClone(features["feature:z"]);
    const overrides = record(record(repeatedChoices).overrides);
    overrides.sensesFt = { darkvision: 0 };
    overrides.speedsFt = { fly: 0 };

    const parsed = parseCharacterBuild(repeatedChoices);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.spells["spell:z"]?.definition).toEqual(
      parsed.value.spells["spell:second-fire-bolt"]?.definition
    );
    expect(parsed.value.features["feature:z"]?.definition).toEqual(
      parsed.value.features["feature:second-inspiration"]?.definition
    );
    expect(parsed.value.overrides.sensesFt.darkvision).toBe(0);
    expect(parsed.value.overrides.speedsFt.fly).toBe(0);
    expect(parsed.value.overrides.weaponProficiencies.longswords).toBe(false);
    expect(parsed.value.overrides.damageImmunities.poison).toBe(false);
  });

  it("materializes customized definitions while retaining typed provenance", () => {
    const customized = structuredClone(richBuild());
    const spells = record(record(customized).spells);
    record(spells["spell:a"]).source = { kind: "class", classId: "bard" };
    const features = record(record(customized).features);
    record(features["feature:a"]).source = {
      kind: "feat",
      featId: "magic-initiate",
    };

    const parsed = parseCharacterBuild(customized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.spells["spell:a"]?.source).toEqual({
      kind: "class",
      classId: "bard",
    });
    expect(parsed.value.features["feature:a"]?.source).toEqual({
      kind: "feat",
      featId: "magic-initiate",
    });
    expect(parsed.value.spells["spell:a"]?.definition.kind).toBe("custom");
    expect(parsed.value.features["feature:a"]?.definition.kind).toBe("custom");
  });

  it("fails closed on unknown, missing, derived, and play-state fields", () => {
    for (const candidate of [
      { ...minimal(), schema: 4 },
      { ...minimal(), session: {} },
      { ...minimal(), hp: { max: 30 } },
      { ...minimal(), equipment: [] },
      { ...minimal(), overrides: { ...minimal().overrides, initiativeRoll: "off" } },
      (() => {
        const missing = structuredClone(minimal());
        delete record(missing).origin;
        return missing;
      })(),
    ]) {
      expect(parseCharacterBuild(candidate)).toEqual({ ok: false });
    }
  });

  it("rejects inferred copies, material state, and legacy or generic mechanics", () => {
    const bareInferred = {
      ...minimal(),
      features: {
        "class:bardic-inspiration": {
          source: { kind: "class", classId: "bard" },
          definition: { kind: "catalogue", featureId: "bard-bardic-inspiration" },
          notes: "",
          tags: [],
        },
      },
    };
    const preparedSpell = {
      ...minimal(),
      spells: {
        chosen: {
          source: { kind: "manual" },
          definition: { kind: "catalogue", spellId: "fireball" },
          notes: "",
          tags: [],
          spellAbilityOverride: null,
          prepared: true,
        },
      },
    };
    const genericOverride = structuredClone(richBuild());
    const genericFeatures = record(record(genericOverride).features);
    record(genericFeatures["feature:z"]).overrides = { anything: true };

    const legacyCustomFeature = structuredClone(richBuild());
    const legacyFeatures = record(record(legacyCustomFeature).features);
    const legacyDefinition = record(record(legacyFeatures["feature:a"]).definition);
    legacyDefinition.trackers = [];

    const resourceWithState = structuredClone(richBuild());
    const stateFeatures = record(record(resourceWithState).features);
    const stateDefinition = record(record(stateFeatures["feature:a"]).definition);
    const resources = record(stateDefinition.resources);
    record(resources["lantern-ward"]).current = 1;

    const partialSpellMechanics = structuredClone(richBuild());
    const customSpells = record(record(partialSpellMechanics).spells);
    const customSpell = record(customSpells["spell:a"]);
    customSpell.fieldOverrides = { damageFormula: "1d10" };

    for (const candidate of [
      bareInferred,
      preparedSpell,
      genericOverride,
      legacyCustomFeature,
      resourceWithState,
      partialSpellMechanics,
      { ...minimal(), classes: [...minimal().classes, minimal().classes[0]] },
      { ...minimal(), abilityScores: { ...minimal().abilityScores, STR: 31 } },
    ]) {
      expect(parseCharacterBuild(candidate)).toEqual({ ok: false });
    }
  });

  it("rejects malformed programs, grants, resource identities, and action links", () => {
    const badProgram = structuredClone(richBuild());
    const programSpells = record(record(badProgram).spells);
    const programDefinition = record(record(programSpells["spell:a"]).definition);
    record(programDefinition.program).randomDamage = true;

    const badGrant = structuredClone(richBuild());
    const grantFeatures = record(record(badGrant).features);
    const grantDefinition = record(record(grantFeatures["feature:a"]).definition);
    grantDefinition.grants = [{ type: "darkvision", range: "sixty" }];

    const mismatchedResource = structuredClone(richBuild());
    const mismatchFeatures = record(record(mismatchedResource).features);
    const mismatchDefinition = record(record(mismatchFeatures["feature:a"]).definition);
    const mismatchResources = record(mismatchDefinition.resources);
    const mismatchResource = record(mismatchResources["lantern-ward"]);
    record(mismatchResource.spec).id = "another-resource";

    const malformedActionResource = structuredClone(richBuild());
    const actionFeatures = record(record(malformedActionResource).features);
    const actionDefinition = record(record(actionFeatures["feature:a"]).definition);
    const actions = actionDefinition.actions as Array<Record<string, unknown>>;
    const selector = record(record(actions[0]?.cost).selector);
    selector.owner = "nobody";

    for (const candidate of [
      badProgram,
      badGrant,
      mismatchedResource,
      malformedActionResource,
    ]) {
      expect(parseCharacterBuild(candidate)).toEqual({ ok: false });
    }
  });

  it("rejects non-JSON values, dangerous object shapes, cycles, and unsafe ids", () => {
    const accessor = structuredClone(minimal());
    Object.defineProperty(record(accessor).identity, "name", {
      enumerable: true,
      get: () => "Trap",
    });

    const symbol = structuredClone(minimal());
    record(symbol)[Symbol("hidden") as unknown as string] = true;

    const cycle = structuredClone(minimal());
    record(record(cycle).identity).playerName = cycle;

    const sparse = { ...minimal(), classes: new Array(1) };
    const unsafeSkills = JSON.parse('{"__proto__":"proficient"}') as unknown;
    const customPrototype = structuredClone(minimal());
    Object.setPrototypeOf(customPrototype, { inherited: true });
    const nullPrototype = structuredClone(minimal());
    Object.setPrototypeOf(nullPrototype, null);

    for (const candidate of [
      { ...minimal(), abilityScores: { ...minimal().abilityScores, STR: -0 } },
      { ...minimal(), abilityScores: { ...minimal().abilityScores, STR: Number.NaN } },
      { ...minimal(), identity: { ...minimal().identity, name: new Date() } },
      accessor,
      symbol,
      cycle,
      sparse,
      customPrototype,
      nullPrototype,
      {
        ...minimal(),
        proficiencies: { ...minimal().proficiencies, skills: unsafeSkills },
      },
      { ...minimal(), identity: { ...minimal().identity, speciesId: "x".repeat(257) } },
    ]) {
      expect(parseCharacterBuild(candidate)).toEqual({ ok: false });
    }
    expect(() => serializeCharacterBuild(cycle)).toThrow(TypeError);
  });
});
