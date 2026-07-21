/**
 * STAGE 1 — the v2 portable-character codec (the single supported import/export
 * format). Pins the contract from `docs/CHARACTER_SCHEMA.md`:
 *
 *  - byte-identity: `serialize(parse(x)) === x` for any canonical v2 `x`;
 *  - tolerance: unknown fields are ignored, missing optional fields default;
 *  - state restoration: vitals / currency / conditions / spent slots / log survive;
 *  - override-safety: a manual override survives and never breaks the sheet;
 *  - single-format: a document with NO `schema` is rejected.
 */
import { describe, it, expect } from "vitest";
import {
  serializeCharacter,
  parseCharacter,
  SCHEMA_VERSION,
  SCHEMA_2_REJECTED_REASON,
} from "@/lib/character-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";
import type { ConcentrationRef } from "@/types/ids";
import { conc } from "./__helpers__/concentration";

function lift(res: ReturnType<typeof parseCharacter>): CharacterDoc {
  if (!res.success) throw new Error(`parse failed: ${res.error}`);
  return { id: "x", createdAt: new Date(0), updatedAt: new Date(0), ...res.doc };
}

/** The canonical v2 string for a doc (one parse→serialize cycle = a fixed point). */
function canonical(doc: CharacterDoc, portrait?: string | null): string {
  return serializeCharacter(
    lift(parseCharacter(serializeCharacter(doc, portrait))),
    portrait
  );
}

const ALL_DOCS: Array<[string, CharacterDoc]> = [
  ["mock", MOCK_CHARACTER],
  ...Object.entries(DEV_SCENARIOS).map(([k, spec]): [string, CharacterDoc] => [
    k,
    buildScenario(spec),
  ]),
];

// REGRESSION (owner 2026-06-08): the portrait is embedded for portability — its
// image (base64 data URL) AND its framing CROP both ride under `meta`, and the crop
// must survive to the TOP-LEVEL `result.portraitCrop` (what `use-character-import`
// re-attaches), not just the doc. Previously serialize dropped the crop and parse
// read it from a stale top-level field, so an imported portrait lost its framing.
const PORTRAIT =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const CROP = { x: 10, y: 20, width: 50, height: 60 };

describe("codec — portrait + crop round-trip (embedded for portability)", () => {
  it("embeds the image + crop under meta and restores BOTH on parse", () => {
    const doc: CharacterDoc = { ...MOCK_CHARACTER, portraitCrop: CROP };
    const json = serializeCharacter(doc, PORTRAIT);
    const env = JSON.parse(json) as {
      meta?: { portrait?: string; portraitCrop?: unknown };
    };
    expect(env.meta?.portrait).toBe(PORTRAIT);
    expect(env.meta?.portraitCrop).toEqual(CROP);

    const res = parseCharacter(json);
    if (!res.success) throw new Error(res.error);
    expect(res.portraitBase64).toBe(PORTRAIT);
    // The import flow reads `result.portraitCrop`; the doc carries it too.
    expect(res.portraitCrop).toEqual(CROP);
    expect(res.doc.portraitCrop).toEqual(CROP);
  });

  it("omits `meta` entirely when there is no portrait", () => {
    const env = JSON.parse(serializeCharacter(MOCK_CHARACTER)) as { meta?: unknown };
    expect(env.meta).toBeUndefined();
  });

  it("round-trips byte-identically with a portrait + crop", () => {
    const doc: CharacterDoc = { ...MOCK_CHARACTER, portraitCrop: CROP };
    const x = canonical(doc, PORTRAIT);
    expect(serializeCharacter(lift(parseCharacter(x)), PORTRAIT)).toBe(x);
  });
});

describe("codec — byte-identity round-trip", () => {
  for (const [name, doc] of ALL_DOCS) {
    it(`${name}: serialize(parse(x)) === x`, () => {
      const x = canonical(doc);
      const again = serializeCharacter(lift(parseCharacter(x)));
      expect(again).toBe(x);
      // The envelope is well-formed.
      const env = JSON.parse(x) as { schema: number; build: unknown; state: unknown };
      expect(env.schema).toBe(SCHEMA_VERSION);
      expect(env.build).toBeTruthy();
    });
  }

  // Solo-round consolidation: `state.round` left the portable format (the round now lives
  // only in the `combat/state` subdoc + the turn engine). A LEGACY export that still carries
  // `state.round` must import CLEANLY (round read-and-dropped, one-way at the boundary) and
  // re-export WITHOUT it — the sanctioned fixture-migration proof.
  it("a legacy state.round imports cleanly and is dropped on re-export (one-way boundary)", () => {
    const legacy = JSON.parse(canonical(MOCK_CHARACTER)) as {
      schema: number;
      build: unknown;
      state: Record<string, unknown>;
    };
    legacy.state.round = 5; // a solo player mid-combat in an OLD export
    const reExported = serializeCharacter(lift(parseCharacter(JSON.stringify(legacy))));
    const env = JSON.parse(reExported) as { state: Record<string, unknown> };
    expect(env.state.round).toBeUndefined(); // dropped — round is a subdoc fact now
    // And the re-export equals the canonical WITHOUT round (nothing else shifted).
    expect(reExported).toBe(canonical(MOCK_CHARACTER));
  });

  it("ids — build stores race/classes/background/alignment as ids, never labels", () => {
    const env = JSON.parse(canonical(MOCK_CHARACTER)) as {
      build: {
        race: string;
        classes: Array<{ classId: string; subclassId?: string; level: number }>;
        background: string;
        alignment?: string;
      };
    };
    expect(env.build.race).toBe(env.build.race.toLowerCase());
    // R4 — the multiclass `classes[]` is the source of truth; no stored display
    // `class`/`subclass` string. The primary entry is id-first.
    expect(env.build).not.toHaveProperty("class");
    expect(env.build).not.toHaveProperty("subclass");
    expect(env.build.classes[0]?.classId).toBe("bard");
    expect(env.build.classes[0]?.subclassId).toBe("college-of-lore");
    // No display-string leakage (a label would have an uppercase letter / space).
    expect(env.build.race).not.toMatch(/[A-Z\s]/);
    expect(env.build.background).not.toMatch(/[A-Z\s]/);
    if (env.build.alignment) expect(env.build.alignment).not.toMatch(/[A-Z]/);
  });

  it("portrait — meta.portrait round-trips byte-identically", () => {
    const portrait = "data:image/png;base64,AAAA";
    const x = canonical(MOCK_CHARACTER, portrait);
    const res = parseCharacter(x);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.portraitBase64).toBe(portrait);
    expect(serializeCharacter(lift(res), res.portraitBase64)).toBe(x);
    // No portrait → no meta key.
    expect(JSON.parse(serializeCharacter(MOCK_CHARACTER))).not.toHaveProperty("meta");
  });
});

describe("codec — schema-3 is the ONLY supported format (no upgrade-on-read)", () => {
  it("REJECTS a schema-2 file with the stable sentinel reason (owner regenerates it)", () => {
    const v2 = JSON.stringify({
      schema: 2,
      build: {
        name: "Test Fighter",
        race: "human",
        class: "fighter",
        subclass: "",
        level: 3,
        background: "soldier",
        alignment: "lawful-good",
        abilities: { STR: 15, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      },
      state: {},
    });
    const res = parseCharacter(v2);
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toBe(SCHEMA_2_REJECTED_REASON);
  });

  it("a schema-3 fighter round-trips (parse → rehydrate → re-serialize is byte-stable)", () => {
    const v3 = JSON.stringify(
      {
        schema: 3,
        build: {
          name: "Test Fighter",
          race: "human",
          classes: [{ classId: "fighter", level: 3 }],
          background: "soldier",
          alignment: "lawful-good",
          abilities: { STR: 15, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 8 },
        },
        state: {},
      },
      null,
      2
    );
    const res = parseCharacter(v3);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.doc.character.race).toBe("human");
    expect(res.doc.character.classes).toEqual([{ classId: "fighter", level: 3 }]);
    const out = serializeCharacter(lift(res));
    const env = JSON.parse(out) as { schema: number; build: { class?: unknown } };
    expect(env.schema).toBe(3);
    expect(env.build).not.toHaveProperty("class");
    expect(serializeCharacter(lift(res))).toBe(out);
  });

  it("a schema-3 multiclass character carries every entry + its per-class picks", () => {
    const res = parseCharacter(
      JSON.stringify({
        schema: 3,
        build: {
          name: "EK",
          race: "human",
          classes: [
            {
              classId: "fighter",
              subclassId: "battle-master",
              level: 5,
              maneuverChoices: ["trip-attack", "riposte"],
              weaponMasteries: ["longsword"],
            },
          ],
          background: "soldier",
          abilities: { STR: 16, DEX: 12, CON: 14, INT: 13, WIS: 10, CHA: 8 },
        },
        state: {},
      })
    );
    expect(res.success).toBe(true);
    if (!res.success) return;
    const entry = res.doc.character.classes[0];
    expect(entry?.classId).toBe("fighter");
    expect(entry?.subclassId).toBe("battle-master");
    expect(entry?.maneuverChoices).toEqual(["trip-attack", "riposte"]);
    expect(entry?.weaponMasteries).toEqual(["longsword"]);
  });

  it("a schema-3 character carries build.toolChoices (the id-based tool-choice home)", () => {
    // The tool-CHOICE pick is stored as STABLE TOOL IDS in `build.toolChoices`,
    // keyed by the namespaced choice slot — parsed back into in-memory `toolChoices`
    // and re-serialized byte-stably (passthrough). The proficiency is DERIVED from
    // these ids on render (never a baked free-text string).
    const v3 = JSON.stringify({
      schema: 3,
      build: {
        name: "Kai",
        race: "dwarf",
        classes: [{ classId: "monk", level: 1 }],
        background: "soldier",
        abilities: { STR: 14, DEX: 15, CON: 14, INT: 10, WIS: 13, CHA: 8 },
        toolChoices: {
          "class:monk::tool-slot-0": ["smiths-tools"],
          "soldier::tool-slot-0": ["dice-set"],
        },
      },
      state: {},
    });
    const res = parseCharacter(v3);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.doc.character.toolChoices).toEqual({
      "class:monk::tool-slot-0": ["smiths-tools"],
      "soldier::tool-slot-0": ["dice-set"],
    });
    // Byte-stable round-trip — `build.toolChoices` survives serialize(parse(x)).
    const env = JSON.parse(serializeCharacter(lift(res))) as {
      build: { toolChoices?: Record<string, string[]> };
    };
    expect(env.build.toolChoices).toEqual({
      "class:monk::tool-slot-0": ["smiths-tools"],
      "soldier::tool-slot-0": ["dice-set"],
    });
  });

  it("an empty toolChoices is DROPPED on minimize (a choice-less doc stays clean)", () => {
    const v3 = JSON.stringify({
      schema: 3,
      build: {
        name: "NoTools",
        race: "human",
        classes: [{ classId: "fighter", level: 1 }],
        background: "soldier",
        abilities: { STR: 15, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 8 },
        toolChoices: {},
      },
      state: {},
    });
    const res = parseCharacter(v3);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const env = JSON.parse(serializeCharacter(lift(res))) as {
      build: Record<string, unknown>;
    };
    expect(env.build).not.toHaveProperty("toolChoices");
  });
});

// ── GR10 — proficiency override KEY conform-on-read (token migration) ──────────
//
// The armor/weapon proficiency override maps are keyed by a stable ProficiencyToken
// (`light-armor`). A LIVE doc written before the migration keyed them by the English
// label ("Light armor"). The codec conforms each legacy key to its token ON READ so
// the override still applies — one-way (never written back as English), no override
// lost. A value already a token (post-migration re-read) maps to itself.
describe("codec — proficiency override keys conform EN label → token (GR10)", () => {
  function parseWithOverrides(overrides: Record<string, Record<string, boolean>>) {
    const res = parseCharacter(
      JSON.stringify({
        schema: 3,
        build: {
          name: "Override",
          race: "human",
          classes: [{ classId: "fighter", level: 3 }],
          background: "soldier",
          abilities: { STR: 15, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 8 },
          overrides,
        },
        state: {},
      })
    );
    return res.success ? res.doc : null;
  }

  it("conforms a legacy English armor/weapon override key to its token", () => {
    const doc = parseWithOverrides({
      armorProficiencies: { "Light armor": true, Shields: false },
      weaponProficiencies: { Longswords: true, "Martial weapons": false },
    });
    expect(doc).not.toBeNull();
    expect(doc?.character.armorProficiencyOverrides).toEqual({
      "light-armor": true,
      shields: false,
    });
    expect(doc?.character.weaponProficiencyOverrides).toEqual({
      longswords: true,
      "martial-weapons": false,
    });
  });

  it("is idempotent — an already-token key re-reads to itself", () => {
    const doc = parseWithOverrides({
      armorProficiencies: { "light-armor": true },
      weaponProficiencies: { "hand-crossbows": true },
    });
    expect(doc?.character.armorProficiencyOverrides).toEqual({ "light-armor": true });
    expect(doc?.character.weaponProficiencyOverrides).toEqual({
      "hand-crossbows": true,
    });
  });

  it("collapses both legacy forms of one kind to ONE token (false wins a conflict)", () => {
    // "Light" and "Light armor" both → `light-armor`; a force-remove (false) wins.
    const doc = parseWithOverrides({
      armorProficiencies: { Light: true, "Light armor": false },
    });
    expect(doc?.character.armorProficiencyOverrides).toEqual({ "light-armor": false });
  });

  it("drops an unrecognised override key (it can no longer match anything)", () => {
    const doc = parseWithOverrides({
      weaponProficiencies: { "Homebrew Whip": true, Rapiers: true },
    });
    expect(doc?.character.weaponProficiencyOverrides).toEqual({ rapiers: true });
  });
});

describe("codec — tolerance", () => {
  it("ignores unknown top-level + build + state fields", () => {
    const res = parseCharacter(
      JSON.stringify({
        schema: 3,
        future: "ignored",
        build: {
          name: "X",
          race: "elf",
          classes: [{ classId: "wizard", level: 5 }],
          background: "sage",
          abilities: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
          futureBuildKey: 42,
        },
        state: { futureStateKey: true },
      })
    );
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.doc.character.name).toBe("X");
    expect(res.doc.character.race).toBe("elf");
  });

  it("fills missing optional fields with defaults (bare build = empty session)", () => {
    const res = parseCharacter(
      JSON.stringify({
        schema: 3,
        build: {
          name: "Y",
          race: "dwarf",
          classes: [{ classId: "cleric", level: 1 }],
          background: "acolyte",
          abilities: { STR: 14, DEX: 10, CON: 15, INT: 8, WIS: 16, CHA: 12 },
        },
      })
    );
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.doc.session.hp.current).toBe(0);
    expect(res.doc.session.currency.gp).toBe(0);
    expect(res.doc.session.logEntries).toEqual([]);
    expect(res.doc.character.languageIds).toEqual([]);
    expect(res.doc.character.lore.traits).toBe("");
  });
});

describe("codec — must-have-field rejection (non-nullability, owner 2026-06-15)", () => {
  // A well-formed build the per-field cases mutate by dropping ONE must-have field,
  // proving the parse REJECTS each (rather than tolerating a nonsensical character).
  const goodBuild = {
    name: "Valid Hero",
    race: "elf",
    classes: [{ classId: "wizard", level: 5 }],
    background: "sage",
    abilities: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
  } as const;
  const parseBuild = (build: Record<string, unknown>) =>
    parseCharacter(JSON.stringify({ schema: 3, build }));

  it("the good build parses (control)", () => {
    expect(parseBuild({ ...goodBuild }).success).toBe(true);
  });

  it("REJECTS an empty name", () => {
    expect(parseBuild({ ...goodBuild, name: "" }).success).toBe(false);
  });

  it("REJECTS a whitespace-only name (the leak the old `!name` check let through)", () => {
    expect(parseBuild({ ...goodBuild, name: "   " }).success).toBe(false);
  });

  it("REJECTS a missing species", () => {
    expect(parseBuild({ ...goodBuild, race: "" }).success).toBe(false);
  });

  it("REJECTS an empty classes array", () => {
    expect(parseBuild({ ...goodBuild, classes: [] }).success).toBe(false);
  });

  it("a corrupt doc is REJECTED gracefully — never throws, never invents a name", () => {
    expect(() =>
      parseCharacter(JSON.stringify({ schema: 3, build: { name: "" } }))
    ).not.toThrow();
    const res = parseCharacter(JSON.stringify({ schema: 3, build: { name: "" } }));
    expect(res.success).toBe(false);
    if (res.success) return;
    // No fake "Unnamed"/"Senza nome" placeholder leaks into the error path.
    expect(res.error.toLowerCase()).not.toContain("unnamed");
  });
});

describe("codec — single-format guard", () => {
  it("rejects a document with no schema field", () => {
    const res = parseCharacter(JSON.stringify({ build: { name: "X" }, state: {} }));
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/schema/i);
  });

  it("rejects the legacy _minimal and version 3.0 envelopes", () => {
    expect(parseCharacter('{"_minimal":true,"character":{"name":"X"}}').success).toBe(
      false
    );
    expect(parseCharacter('{"version":"3.0","character":{},"session":{}}').success).toBe(
      false
    );
  });

  it("rejects invalid JSON and non-objects without throwing", () => {
    expect(() => parseCharacter("not json {{{")).not.toThrow();
    expect(parseCharacter("not json {{{").success).toBe(false);
    expect(parseCharacter("[]").success).toBe(false);
    expect(parseCharacter("42").success).toBe(false);
  });

  it("rejects a future schema version", () => {
    const res = parseCharacter(JSON.stringify({ schema: 999, build: {}, state: {} }));
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/schema 999/);
  });
});

describe("codec — state restoration", () => {
  it("restores HP, currency, conditions, spent slots, trackers, and the log", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        hp: { current: 31, temp: 5 },
        currency: { pp: 1, gp: 27, ep: 0, sp: 4, cp: 0 },
        conditions: ["poisoned"],
        exhaustion: 2,
        spellSlots: { "1": { used: 2 }, "2": { used: 0 } },
        trackers: { "bard-bardic-inspiration": { used: 1 } },
        concentration: conc("hold-monster"),
        inspiration: true,
        logEntries: [
          {
            event: {
              kind: "action-use",
              action: { srd: { kind: "spell", key: "magic-missile", field: "name" } },
              effect: "spell-cast",
              slot: "action",
            },
            ts: 123,
            id: "log-1",
          },
        ],
      },
    };
    const res = parseCharacter(serializeCharacter(doc));
    expect(res.success).toBe(true);
    if (!res.success) return;
    const s = res.doc.session;
    expect(s.hp.current).toBe(31);
    expect(s.hp.temp).toBe(5);
    expect(s.currency).toEqual({ pp: 1, gp: 27, ep: 0, sp: 4, cp: 0 });
    expect(s.conditions).toEqual(["poisoned"]);
    expect(s.exhaustion).toBe(2);
    expect(s.spellSlots["1"]).toEqual({ used: 2 });
    expect(s.spellSlots["2"]).toBeUndefined(); // spent 0 → omitted, re-defaults absent
    expect(s.trackers["bard-bardic-inspiration"]).toEqual({ used: 1 });
    expect(s.concentration).toBe(conc("hold-monster"));
    expect(s.inspiration).toBe(true);
    expect(s.logEntries[0]).toMatchObject({
      event: {
        kind: "action-use",
        action: { srd: { kind: "spell", key: "magic-missile", field: "name" } },
        effect: "spell-cast",
        slot: "action",
      },
      ts: 123,
      id: "log-1",
    });

    // And the populated state survives a full byte-identical round-trip.
    const x = canonical(doc);
    expect(serializeCharacter(lift(parseCharacter(x)))).toBe(x);
  });

  it("FRONTIER-S3 — round-trips effectTimers (the maxRounds countdown)", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        activeFeatures: ["barbarian-rage"],
        effectTimers: { "barbarian-rage": { roundsLeft: 7 } },
      },
    };
    const res = parseCharacter(serializeCharacter(doc));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.doc.session.effectTimers).toEqual({
      "barbarian-rage": { roundsLeft: 7 },
    });
    // Byte-identical round-trip.
    const x = canonical(doc);
    expect(serializeCharacter(lift(parseCharacter(x)))).toBe(x);
  });

  it("FRONTIER-S3 — back-compat: absent effectTimers stays absent (no timers)", () => {
    const res = parseCharacter(serializeCharacter(MOCK_CHARACTER));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.doc.session.effectTimers).toBeUndefined();
  });

  it("RA-12 — round-trips hiddenDc (the Hide action's find-DC); absent stays absent", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        conditions: ["invisible"],
        hiddenDc: 17,
      },
    };
    const res = parseCharacter(serializeCharacter(doc));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.doc.session.hiddenDc).toBe(17);
    // Byte-identical round-trip.
    const x = canonical(doc);
    expect(serializeCharacter(lift(parseCharacter(x)))).toBe(x);
    // Additive-only: a doc without the field keeps not having it.
    const bare = parseCharacter(serializeCharacter(MOCK_CHARACTER));
    if (bare.success) expect(bare.doc.session.hiddenDc).toBeUndefined();
  });
});

describe("codec — override-safety", () => {
  it("a manual AC override survives and a NaN override is neutralized", () => {
    const withAc: CharacterDoc = {
      ...MOCK_CHARACTER,
      character: { ...MOCK_CHARACTER.character, acOverride: 21 },
    };
    const res = parseCharacter(serializeCharacter(withAc));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.doc.character.acOverride).toBe(21);
    expect(res.doc.character.ac).toBe(21); // stamped effectiveAC honors the override

    const poisoned: CharacterDoc = {
      ...MOCK_CHARACTER,
      character: { ...MOCK_CHARACTER.character, acOverride: Number.NaN },
    };
    const res2 = parseCharacter(serializeCharacter(poisoned));
    expect(res2.success).toBe(true);
    if (!res2.success) return;
    expect(Number.isFinite(res2.doc.character.ac)).toBe(true);
    expect(res2.doc.character.ac).toBeGreaterThan(0);
  });
});

describe("read path conforms a legacy concentration LOG event.spell (GR10 boundary)", () => {
  // A pre-id doc froze a concentration log row's spell as a localized NAME. The codec
  // (the seam shared by Firestore single-load AND JSON-import) must conform it so it can
  // never reach the STRICT concentrationLabel resolver (a ⟦…⟧ sentinel / GR7 leak in
  // prod, a throw in dev). This drives the REAL serialize→parse pipeline, not the helper
  // in isolation — the gap the adversarial verify caught was the codec NOT wiring it.
  const withConcLog = (spell: string): CharacterDoc => ({
    ...MOCK_CHARACTER,
    session: {
      ...MOCK_CHARACTER.session,
      logEntries: [
        {
          event: { kind: "concentration-start", spell: spell as ConcentrationRef },
          ts: 1,
          id: "c1",
        },
      ],
    },
  });

  it("a bare spell NAME → custom: through serialize→parse", () => {
    const parsed = lift(
      parseCharacter(serializeCharacter(withConcLog("Hypnotic Pattern")))
    );
    expect(parsed.session.logEntries[0]?.event).toMatchObject({
      kind: "concentration-start",
      spell: "custom:Hypnotic Pattern",
    });
  });

  it("a stable spell id round-trips unchanged", () => {
    const parsed = lift(
      parseCharacter(serializeCharacter(withConcLog("hypnotic-pattern")))
    );
    expect(parsed.session.logEntries[0]?.event).toMatchObject({
      kind: "concentration-start",
      spell: "hypnotic-pattern",
    });
  });
});
