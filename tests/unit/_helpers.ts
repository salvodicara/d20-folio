import type {
  CharacterDoc,
  CharacterData,
  ClassEntry,
  SessionState,
} from "@/types/character";
import { resolveClassId, subclassIdByName, asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";

/**
 * R4 test ergonomics — fold a per-test override object that uses the LEGACY single-
 * class keys (`class`/`classId`/`subclass`/`subclassId`/`level`) into the `classes[]`
 * source of truth, stripping those keys. A factory spreads the RESULT over its base
 * character literal: `...foldLegacyClass(over, "rogue")`. When the override carries
 * no class-ish key, the base literal's `classes` is left untouched (undefined here).
 */
export function foldLegacyClass(
  over:
    | (Partial<CharacterData> & {
        class?: string;
        classId?: string;
        subclass?: string;
        subclassId?: string;
        level?: number;
      })
    | undefined,
  baseClassId: string,
  baseSubclassId?: string,
  baseLevel = 5
): Partial<CharacterData> {
  const o = over ?? {};
  const { class: cls, classId, subclass, subclassId, level, classes, ...rest } = o;
  if (classes) return { ...rest, classes };
  if (!cls && !classId && !subclass && !subclassId && level === undefined) {
    return rest; // no class-ish override → keep the base literal's classes
  }
  const entry: ClassEntry = {
    // `classId` wins; else resolve the display `class` label → its id (so a legacy
    // `{ class: "Bardo" }` folds to "bard"), mirroring `getClasses`.
    classId: classId ?? (cls ? resolveClassId(cls) : baseClassId),
    level: level ?? baseLevel,
  };
  // `subclassId` wins; else resolve the display `subclass` label → its id.
  const sub =
    subclassId ?? (subclass ? subclassIdByName(subclass) || subclass : baseSubclassId);
  if (sub) entry.subclassId = sub;
  return { ...rest, classes: [entry] };
}

/**
 * Shared test fixture: a minimal valid CharacterDoc with sensible defaults.
 * Pass `char` / `session` partials to override. Use this instead of re-declaring
 * the full doc shape in every test (addresses the duplicated-fixture smell).
 */
export function makeCharacterDoc(
  charIn: Partial<CharacterData> & {
    class?: string;
    subclass?: string;
    classId?: string;
    subclassId?: string;
    level?: number;
  } = {},
  session: Partial<SessionState> = {}
): CharacterDoc {
  // R4 — fold the legacy single-class override keys (`class`/`classId`/`subclass`/
  // `subclassId`/`level`) into the `classes[]` source of truth for test ergonomics
  // (the single fold helper resolves display labels → ids, like `getClasses`).
  const hasClassOverride =
    charIn.class != null ||
    charIn.classId != null ||
    charIn.subclass != null ||
    charIn.subclassId != null ||
    charIn.level != null ||
    charIn.classes != null;
  const folded = foldLegacyClass(charIn, "fighter");
  const { classes: foldedClasses, ...char } = folded;
  const resolvedClasses = hasClassOverride ? foldedClasses : undefined;
  return {
    id: "test-char",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "fighter", level: 5 }],
      background: "soldier",
      alignment: asAlignmentId("neutral-good"),
      playerName: "",
      speed: "30 ft",
      ac: 16,
      armorNote: "",
      hp: { max: 44 },
      hitDieType: 10,
      languageIds: [],
      customLanguages: [],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      abilityBudget: 27,
      proficiencyBonusOverride: null,
      levelUpChecklist: null,
      backgroundAsi: {},
      humanOriginFeat: "",
      bgFeat: "",
      lore: {
        traits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        backstory: "",
        age: "",
        height: "",
        weight: "",
        eyes: "",
        hair: "",
        skin: "",
      },
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
      skills: {},
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: [],
      equipment: [],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
      ...char,
      ...(resolvedClasses ? { classes: resolvedClasses } : {}),
      // Re-brand the name AFTER the caller spread so a `name: "Foo"` override (a
      // plain string) becomes a `NonEmptyString` — the branded `CharacterData.name`
      // can't accept a bare string. Falls back to "Test" if a test passes an empty
      // override (a test never wants a nameless fixture).
      name: assertNonEmptyString(char.name ?? "Test"),
    },
    session: {
      hp: { current: 44, temp: 0 },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      concentration: "",
      initiative: "",
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      inspiration: false,
      exhaustion: 0,
      pinnedActions: [],
      unpinnedActions: [],
      notes: "",
      logEntries: [],
      ...session,
    },
  };
}
