import { describe, it, expect } from "vitest";
import {
  canonicalizeForCompare,
  minimizeCharacter,
  rehydrateCharacter,
  type MinimalCharacter,
} from "@/lib/character-minimal";
import { buildCharacterCache } from "@/lib/character-cache";
import { sanitizeCharacter } from "@/lib/sanitize-character";
import { primaryClassEntry } from "@/lib/classes";
import { subclassNameById } from "@/data/srd-names";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import { MOCK_CHARACTER, MOCK_MULTICLASS_CHARACTER } from "@/lib/mock";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import { totalLevel } from "@/lib/classes";
import { deriveSpellSlots, applySlotMaxOverrides } from "@/lib/multiclass-slots";
import type { CharacterData } from "@/types/character";

const mock = MOCK_CHARACTER.character;

describe("character-minimal — the MULTICLASS mock round-trips + uses the multiclass table", () => {
  const mc = MOCK_MULTICLASS_CHARACTER.character; // Bard 7 / Wizard 2 (total 9)
  it("totalLevel sums the two class entries", () => {
    expect(totalLevel(mc)).toBe(9);
    expect(mc.classes.map((e) => e.classId)).toEqual(["bard", "wizard"]);
  });
  it("the codec preserves every class entry through minimize → rehydrate", () => {
    const round = rehydrateCharacter(minimizeCharacter(mc));
    expect(round.classes).toEqual([
      { classId: "bard", subclassId: "college-of-lore", level: 7 },
      { classId: "wizard", subclassId: "evoker", level: 2 },
    ]);
  });
  it("spell slots come from the 2024 Multiclass Spellcaster table (caster level 9)", () => {
    const round = rehydrateCharacter(minimizeCharacter(mc));
    // Two full casters → combined caster level 9 → [4,3,3,3,1] (more than either alone).
    expect(round.spellSlots).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 3 },
      { level: 4, total: 3 },
      { level: 5, total: 1 },
    ]);
  });
});

// REGRESSION (owner 2026-06-08): the roster + hero header showed a BLANK Speed.
// The minimizer DROPS `speed` when it equals the species default; the SRD-free
// roster reads the unified-codec `cache.speed` (so the WRITE must STAMP it via
// `buildCharacterCache`), and the cockpit load path runs `sanitizeCharacter`
// (which coerces an absent speed to "") BEFORE rehydrate — so rehydrate must
// re-derive speed from `""`, not only `undefined`.
describe("speed snapshot — never blank on the roster or the cockpit", () => {
  it("buildCharacterCache STAMPS the effective speed even when minimize drops it", () => {
    expect("speed" in (minimizeCharacter(mock) as Record<string, unknown>)).toBe(false);
    const cache = buildCharacterCache(mock, MOCK_CHARACTER.session);
    expect(cache.speed).toBe(mock.speed);
    expect(typeof cache.speed).toBe("string");
    expect(cache.speed).not.toBe("");
  });

  it("rehydrate re-derives speed when the read seam coerced it to '' (firestore load)", () => {
    // Simulate the firestore read path: minimize drops speed → sanitizeCharacter
    // coerces it to "" → rehydrate must still produce the species speed.
    const min = minimizeCharacter(mock) as Record<string, unknown>;
    const sanitized = sanitizeCharacter(min);
    expect(sanitized.speed).toBe(""); // the seam coerced it
    const re = rehydrateCharacter(sanitized as unknown as MinimalCharacter);
    expect(re.speed).toBe(mock.speed);
    expect(re.speed).not.toBe("");
  });
});

/**
 * Compare the RENDERED-equivalent of a doc. `spells[]` is intentionally MINIMAL
 * after rehydrate — inferred always-prepared spells (subclass Oath/Domain/Circle +
 * `always-prepared-spell` grants) are re-inferred at render by
 * `resolveEffectiveSpells`, not re-stored (symmetric with how creation appends
 * them and how derived FEATURES are re-merged). So the lossless round-trip
 * invariant holds on the EFFECTIVE spell list (order-independent), not the raw
 * stored array. Everything else is compared byte-for-byte.
 */
function renderEquivalent(doc: CharacterData): unknown {
  const effective = resolveEffectiveSpells(doc, { grantBundleChoices: undefined })
    .slice()
    .sort((a, b) =>
      ("custom" in a ? `c:${a.name}` : `s:${a.srdId}`).localeCompare(
        "custom" in b ? `c:${b.name}` : `s:${b.srdId}`
      )
    );
  return canonicalizeForCompare({ ...doc, spells: effective });
}

describe("character-minimal — lossless round-trip", () => {
  it("rehydrate(minimize(x)) === rehydrate(x) — minimizing is invisible on load (MOCK)", () => {
    // The app loads every doc through rehydrate (which merges derived class/subclass
    // features), so the invariant is that minimize-then-load renders identically to
    // load — not that minimize→rehydrate reproduces the RAW stored array.
    const round = rehydrateCharacter(minimizeCharacter(mock));
    expect(renderEquivalent(round)).toEqual(renderEquivalent(rehydrateCharacter(mock)));
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(mock);
    minimizeCharacter(mock);
    expect(JSON.stringify(mock)).toBe(before);
  });
});

describe("character-minimal — skills are choices-only; JoaT is derived (#57)", () => {
  const min = minimizeCharacter(mock) as Record<string, unknown>;
  const minSkills = (min.skills ?? {}) as Record<string, string>;

  it("stores ONLY real proficient / expertise picks — never a derived half", () => {
    expect(Object.values(minSkills).every((v) => v !== "halfProficiency")).toBe(true);
    expect(minSkills.performance).toBe("expertise");
    expect(minSkills.perception).toBe("proficient");
  });
  it("round-trips losslessly — stored skills stay choices-only (no baked half)", () => {
    // Jack-of-All-Trades half-proficiency is filled at RENDER by
    // `mergeSkillProficiencies`, NOT baked into stored skills — so the minimized
    // and full docs rehydrate to the SAME choices-only skill map (no half-profs).
    const round = rehydrateCharacter(minimizeCharacter(mock));
    const full = rehydrateCharacter(mock);
    expect(canonicalizeForCompare(round.skills)).toEqual(
      canonicalizeForCompare(full.skills)
    );
    expect(Object.values(round.skills).every((v) => v !== "halfProficiency")).toBe(true);
  });
});

describe("character-minimal — minimize drops inferable + default fields", () => {
  const min = minimizeCharacter(mock) as Record<string, unknown>;

  it("drops saving throws that match the class (Bard DEX/CHA)", () => {
    expect("savingThrows" in min).toBe(false);
  });
  it("drops the hit die that matches the class (Bard d8)", () => {
    expect("hitDieType" in min).toBe(false);
  });
  it("drops the base species Speed (Elf 30)", () => {
    expect("speed" in min).toBe(false);
  });
  it("drops the default point-buy budget (27)", () => {
    expect("abilityBudget" in min).toBe(false);
  });
  it("drops empty backgroundAsi and humanOriginFeat", () => {
    expect("backgroundAsi" in min).toBe(false);
    expect("humanOriginFeat" in min).toBe(false);
  });
  it("drops null/derive-default override fields", () => {
    expect("levelUpChecklist" in min).toBe(false);
    expect("proficiencyBonusOverride" in min).toBe(false);
  });
  it("drops the derived background Origin feat (bgFeat empty → Musician inferred)", () => {
    expect("bgFeat" in min).toBe(false);
  });
});

describe("character-minimal — minimize KEEPS explicit choices + non-default overrides", () => {
  const min = minimizeCharacter(mock) as Record<string, unknown>;

  it("keeps the AC OVERRIDE (a choice) but DROPS the derived `ac` snapshot", () => {
    expect(min.acOverride).toBe(17);
    // `ac` is a derived snapshot (= effectiveAC), not a choice — dropped from the
    // minimal model (the Firestore write re-stamps it; the cockpit computes live).
    expect("ac" in min).toBe(false);
  });
  it("keeps explicit picks (skills, spells, features)", () => {
    expect(min.skills).toBeDefined();
    expect(Array.isArray(min.spells)).toBe(true);
    expect(Array.isArray(min.features)).toBe(true);
  });
  it("drops the fully-derived spellcasting block (matches the class-table inference)", () => {
    // Lyra's Bard-9 block (ability CHA, preparedMax 14, no overrides) equals the
    // `inferSpellcasting` value, so it carries no information and drops — the read
    // path re-infers it. A real *Override would deviate and keep it stored.
    expect("spellcasting" in min).toBe(false);
  });
  it("stores class identity in classes[] by ID (display + projection derived), keeps race", () => {
    // R4 — `classes[]` is the multiclass source of truth (single-class = one entry,
    // id-first). The `class`/`subclass`/`classId`/`subclassId`/`level` projection is
    // derived on rehydrate, so the minimal record drops every projection field.
    expect(min.classes).toEqual([
      { classId: "bard", subclassId: "college-of-lore", level: 9 },
    ]);
    expect("class" in min).toBe(false);
    expect("classId" in min).toBe(false);
    expect("subclass" in min).toBe(false);
    expect("subclassId" in min).toBe(false);
    expect("level" in min).toBe(false);
    // Race is the stable, branded RaceId now (golden rule 7) — the codec
    // serializes it verbatim, so the minimal record keeps the id, never a name.
    expect(min.race).toBe("elf");
  });
});

describe("character-minimal — a STANDARD caster drops its derived spellcasting block", () => {
  // A scenario is built via `inferSpellcasting`/`inferSpeed` (declare the choices,
  // infer the rest), so its derived blocks equal the inferred values and drop. A
  // block only stays stored when a player *Override makes it deviate.
  const clericSpec = DEV_SCENARIOS["life-cleric"];
  if (!clericSpec) throw new Error("life-cleric scenario missing");
  const cleric = buildScenario(clericSpec).character;
  const min = minimizeCharacter(cleric) as Record<string, unknown>;

  it("drops the class-fixed spellcasting block (ability/preparedMax)", () => {
    expect("spellcasting" in min).toBe(false);
  });
  it("drops the species Speed", () => {
    expect("speed" in min).toBe(false);
  });
  it("drops the derived class/subclass/species feature set (inferFeatures)", () => {
    // No chosen feats / custom features → features[] equals the derived set, so it
    // never has to be stored; the read path refills it for the Features tab AND the
    // combat grant-source pipeline.
    expect("features" in min).toBe(false);
  });
  it("round-trips losslessly: rehydrate(minimize(x)) === rehydrate(x)", () => {
    const round = rehydrateCharacter(minimizeCharacter(cleric));
    expect(renderEquivalent(round)).toEqual(renderEquivalent(rehydrateCharacter(cleric)));
  });
});

describe("character-minimal — features SUBSET minimization (mixed character)", () => {
  // A mixed character: derived class/subclass features + a CHOSEN feat (Tough) +
  // a CUSTOM feature. Subset minimize drops the derived refs but keeps the
  // chosen/custom; rehydrate merges the derived ones back.
  const clericSpec = DEV_SCENARIOS["life-cleric"];
  if (!clericSpec) throw new Error("life-cleric scenario missing");
  const base = buildScenario(clericSpec).character;
  const mixed: CharacterData = {
    ...base,
    features: [
      ...base.features, // derived class+subclass
      { srdId: "tough" }, // a chosen feat (NOT derived)
      { custom: true, name: "Heirloom Blessing", description: "A boon." },
    ] as CharacterData["features"],
  };
  const min = minimizeCharacter(mixed) as Record<string, unknown>;

  it("keeps ONLY the non-derived entries (chosen feat + custom)", () => {
    const stored = (min.features ?? []) as Array<{ srdId?: string; custom?: boolean }>;
    const derivedIds = new Set(
      base.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []))
    );
    expect(stored.some((f) => f.srdId === "tough")).toBe(true);
    expect(stored.some((f) => f.custom)).toBe(true);
    // None of the derived class/subclass refs are stored.
    expect(stored.every((f) => f.custom || !derivedIds.has(f.srdId ?? ""))).toBe(true);
    expect(stored.length).toBe(2);
  });

  it("rehydrate merges the derived refs back in front of the kept ones", () => {
    const round = rehydrateCharacter(minimizeCharacter(mixed));
    const ids = round.features.flatMap((f) => ("srdId" in f ? [f.srdId] : ["<custom>"]));
    expect(ids).toContain("tough");
    expect(ids).toContain("<custom>");
    // Derived class features are present again (length > the 2 stored extras).
    expect(round.features.length).toBeGreaterThan(2);
    // And it renders identically to loading the full mixed doc.
    expect(renderEquivalent(round)).toEqual(renderEquivalent(rehydrateCharacter(mixed)));
  });
});

describe("character-minimal — the byte-size meter shrinks", () => {
  it("the minimal character serializes smaller than the full character", () => {
    const full = JSON.stringify(mock).length;
    const small = JSON.stringify(minimizeCharacter(mock)).length;
    expect(small).toBeLessThan(full);
  });
});

describe("character-minimal — overrides survive the round-trip", () => {
  it("a deviating saving-throw set is kept (not dropped) and restored", () => {
    // Force an illegal/deviating save set so it cannot match the class default.
    const deviated: CharacterData = {
      ...mock,
      savingThrows: ["STR", "CON"],
    };
    const min = minimizeCharacter(deviated) as Record<string, unknown>;
    expect(min.savingThrows).toEqual(["STR", "CON"]);
    const round = rehydrateCharacter(minimizeCharacter(deviated));
    expect(round.savingThrows).toEqual(["STR", "CON"]);
  });

  it("a non-default proficiency-bonus override is kept and restored", () => {
    const deviated: CharacterData = { ...mock, proficiencyBonusOverride: 5 };
    const round = rehydrateCharacter(minimizeCharacter(deviated));
    expect(round.proficiencyBonusOverride).toBe(5);
  });
});

describe("character-minimal — hp.max is the average (drops) but a rolled value is kept", () => {
  const monk = (max: number): CharacterData => ({
    ...mock,
    classes: [{ classId: "monk", level: 3 }],
    abilityScores: { ...mock.abilityScores, CON: 14 },
    hp: { max },
  });

  it("drops a standard average hp.max (Monk d8, CON 14, L3 → 24) and re-infers it", () => {
    const min = minimizeCharacter(monk(24));
    expect(min.hp).toBeUndefined();
    expect(rehydrateCharacter(min).hp.max).toBe(24);
  });

  it("KEEPS a deviating (rolled / HP-feat) hp.max verbatim", () => {
    const min = minimizeCharacter(monk(31));
    expect(min.hp).toEqual({ max: 31 });
    expect(rehydrateCharacter(min).hp.max).toBe(31);
  });
});

describe("character-minimal — stores subclass by ID, derives the display string", () => {
  // "Store by id, not display string": the minimal model keeps `subclassId` (the
  // source of truth) and DROPS the `subclass` display label, which rehydrate
  // reconstructs from the SRD by id.
  const monk: CharacterData = {
    ...mock,
    classes: [{ classId: "monk", subclassId: "open-hand", level: 3 }],
  };

  it("minimal output stores subclassId in the class entry and NO display string", () => {
    const min = minimizeCharacter(monk) as Record<string, unknown>;
    expect(min.classes).toEqual([{ classId: "monk", subclassId: "open-hand", level: 3 }]);
    expect("subclass" in min).toBe(false);
    expect("subclassId" in min).toBe(false);
  });

  it("rehydrate keeps the subclass id on the class entry; the display derives from it", () => {
    const round = rehydrateCharacter(minimizeCharacter(monk));
    expect(primaryClassEntry(round).subclassId).toBe("open-hand");
    expect(subclassNameById("open-hand")).toBe("Warrior of the Open Hand");
  });
});

describe("character-minimal — re-infers stale DERIVED spellcasting sub-fields", () => {
  // v3 imports stored a wrong `preparedMax` (Paladin L3 → 7 instead of the table's
  // 4; Bard → 0) that deviated from inference and was preserved. These fields are
  // class-fixed — the player deltas live in the *Override fields — so the engine's
  // table value is authoritative on load; a stale stored count must never render.
  it("corrects a stale preparedMax to the class-table value, keeping overrides", () => {
    const stale: CharacterData = {
      ...mock,
      classes: [{ classId: "paladin", level: 3 }],
      spellcasting: {
        ability: "CHA",
        preparedCaster: true,
        preparedMax: 7, // STALE — must re-infer to the table value (4)
        saveDCOverride: 15, // a real override — must be kept
        attackBonusOverride: null,
      },
    };
    const round = rehydrateCharacter(stale);
    expect(round.spellcasting?.preparedMax).toBe(4);
    expect(round.spellcasting?.saveDCOverride).toBe(15);
  });

  it("respects an explicit preparedMaxOverride (the player's manual count wins in the UI)", () => {
    const withOverride: CharacterData = {
      ...mock,
      classes: [{ classId: "paladin", level: 3 }],
      spellcasting: {
        ability: "CHA",
        preparedCaster: true,
        preparedMax: 7,
        saveDCOverride: null,
        attackBonusOverride: null,
        preparedMaxOverride: 9,
      },
    };
    const round = rehydrateCharacter(withOverride);
    // The derived base is re-inferred (4) but the explicit override is preserved.
    expect(round.spellcasting?.preparedMax).toBe(4);
    expect(round.spellcasting?.preparedMaxOverride).toBe(9);
  });
});

describe("character-minimal — HAND-AUTHORED content is irreducible (always exported)", () => {
  // Owner clarification (2026-06-07): anything the player types by hand — notes,
  // bio/lore, and CUSTOM spells / items / features / conditions — counts as
  // override/custom content. It can't be inferred, so the minimizer must KEEP it
  // verbatim and the round-trip must restore it exactly. This pins that promise.
  const withCustom: CharacterData = {
    ...mock,
    quote: "Owes a debt to the Harpers; afraid of deep water.",
    customConditions: ["Cursed by the Raven Queen"],
    spells: [
      ...mock.spells,
      {
        custom: true,
        name: "Homebrew Hex Bolt",
        level: 1,
        school: "evocation",
        castingTime: "1 action",
        range: "60 feet",
        components: { v: true, s: true, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "A crackling bolt of borrowed luck.",
        prepared: true,
      },
    ],
    features: [
      ...mock.features,
      {
        custom: true,
        title: "Pact of the Wandering Star",
        emoji: "✨",
        source: "Homebrew",
        tags: [],
        contentBlocks: [],
      },
    ],
    weapons: [
      ...mock.weapons,
      {
        custom: true,
        name: "Grandfather's Saber",
        quantity: 1,
        damageDie: "1d8",
        damageType: "slashing",
        attackStat: "DEX",
        properties: "finesse",
      },
    ],
    equipment: [
      ...mock.equipment,
      {
        custom: true,
        name: "Locket of the Lost Sister",
        description: "A tarnished silver locket; holds a faded portrait.",
        quantity: 1,
      },
    ],
  };

  it("keeps custom spells / features / weapons / equipment in the minimal output", () => {
    const min = minimizeCharacter(withCustom) as Record<string, unknown>;
    const spells = (min.spells ?? []) as Array<Record<string, unknown>>;
    const features = (min.features ?? []) as Array<Record<string, unknown>>;
    const weapons = (min.weapons ?? []) as Array<Record<string, unknown>>;
    const equipment = (min.equipment ?? []) as Array<Record<string, unknown>>;
    expect(spells.some((s) => s.custom === true && s.name === "Homebrew Hex Bolt")).toBe(
      true
    );
    expect(
      features.some((f) => f.custom === true && f.title === "Pact of the Wandering Star")
    ).toBe(true);
    expect(
      weapons.some((w) => w.custom === true && w.name === "Grandfather's Saber")
    ).toBe(true);
    expect(
      equipment.some((e) => e.custom === true && e.name === "Locket of the Lost Sister")
    ).toBe(true);
  });

  it("keeps free-text the player typed (quote/bio, custom conditions)", () => {
    const min = minimizeCharacter(withCustom) as Record<string, unknown>;
    expect(min.quote).toBe("Owes a debt to the Harpers; afraid of deep water.");
    expect(min.customConditions).toEqual(["Cursed by the Raven Queen"]);
  });

  it("round-trips every piece of hand-authored content losslessly", () => {
    const round = rehydrateCharacter(minimizeCharacter(withCustom));
    const full = rehydrateCharacter(withCustom);
    // The custom entries (which the engine can never infer) survive on the
    // rendered sheet identically to loading the full doc.
    expect(canonicalizeForCompare(round.spells)).toEqual(
      canonicalizeForCompare(full.spells)
    );
    expect(canonicalizeForCompare(round.weapons)).toEqual(
      canonicalizeForCompare(full.weapons)
    );
    expect(canonicalizeForCompare(round.equipment)).toEqual(
      canonicalizeForCompare(full.equipment)
    );
    expect(round.quote).toBe(full.quote);
    expect(round.customConditions).toEqual(full.customConditions);
    // The custom feature survives the subset-minimize / merge-on-rehydrate.
    expect(
      round.features.some(
        (f) => "custom" in f && f.title === "Pact of the Wandering Star"
      )
    ).toBe(true);
  });
});

describe("rehydrate drops the deleted legacy `initiativeBonus` field (rule 10)", () => {
  it("a cached minimal doc carrying a stray legacy `initiativeBonus` rehydrates WITHOUT it", () => {
    // The field was DELETED from CharacterData; `rehydrateCharacter` is a bounded
    // ONE-WAY read-normalization at the cache boundary — it must drop an incoming
    // legacy key (never re-emit it), so a legacy-cached doc and a clean one rehydrate
    // identically. Inject the key through an untyped record (the boundary's reality).
    const min = minimizeCharacter(mock);
    (min as Record<string, unknown>).initiativeBonus = 7;
    const round = rehydrateCharacter(min);
    expect("initiativeBonus" in round).toBe(false);
    // The legacy value never leaks into the live override channel.
    expect(round.initiativeBonusOverride).not.toBe(7);
  });
});

describe("character-minimal — RA-33 slot-count overrides round-trip", () => {
  it("a caster WITHOUT a slot override never gains a slotMaxOverrides key (fixture-safe)", () => {
    // The 6 team fixtures carry no override — the derived spellSlots + inferred
    // spellcasting block minimize byte-identically to pre-RA-33, and rehydrate never
    // introduces the key.
    const round = rehydrateCharacter(minimizeCharacter(mock));
    expect(round.spellcasting?.slotMaxOverrides).toBeUndefined();
  });

  it("a caster WITH a slot override keeps the block + array and round-trips unchanged", () => {
    const doc = structuredClone(mock);
    if (!doc.spellcasting) throw new Error("mock is a caster");
    doc.spellcasting.slotMaxOverrides = { "1": 5 };
    doc.spellSlots = applySlotMaxOverrides(deriveSpellSlots(doc.classes), { "1": 5 });

    const min = minimizeCharacter(doc) as Record<string, unknown>;
    // Both deviate from their derived defaults, so both are kept in the minimal doc.
    expect("spellcasting" in min).toBe(true);
    expect("spellSlots" in min).toBe(true);

    const round = rehydrateCharacter(minimizeCharacter(doc));
    expect(round.spellcasting?.slotMaxOverrides).toEqual({ "1": 5 });
    expect(
      round.spellSlots.find((s) => s.level === 1 && s.pactMagic !== true)?.total
    ).toBe(5);
  });
});
