/**
 * Import / export / persistence ROBUSTNESS — the engine must never break, and
 * overrides (class / subclass / spells / features) must recalculate consistently.
 *
 * Owner mandate (2026-06-08): "make this import/export engine robust and perfect…
 * nothing can break it. Overrides should never break it; the engine should
 * recalculate and be consistent."
 */
import { describe, it, expect } from "vitest";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { primaryClassId, primarySubclassId, primaryClassName } from "@/lib/classes";
import { importCharacter, serializeCharacter } from "@/lib/character-io";
import {
  rehydrateCharacter,
  minimizeCharacter,
  type MinimalCharacter,
} from "@/lib/character-minimal";
import { buildCharacterCache, cacheToRosterDoc } from "@/lib/character-cache";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sanitizeCharacter } from "@/lib/sanitize-character";
import { sanitizeSession } from "@/lib/sanitize-session";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import { effectiveAC } from "@/lib/aggregate-character";
import { MOCK_CHARACTER } from "@/lib/mock";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import type { CharacterData, CharacterDoc } from "@/types/character";

// ════════════════════════════════════════════════════════════════════════════
// 1. importCharacter NEVER throws — for ANY input it returns success | error.
// ════════════════════════════════════════════════════════════════════════════
describe("importCharacter never throws", () => {
  const inputs: Array<[string, string]> = [
    ["not json", "this is not json {{{"],
    ["empty string", ""],
    ["json null", "null"],
    ["json array", "[]"],
    ["json number", "42"],
    ["json string", '"hello"'],
    ["empty object", "{}"],
    ["schema-less (rejected)", '{"build":{"name":"X"}}'],
    ["v2, no build", '{"schema":2}'],
    ["v2, empty build", '{"schema":2,"build":{}}'],
    ["v2, name only", '{"schema":2,"build":{"name":"X"}}'],
    ["v2, unknown class", '{"schema":2,"build":{"name":"X","class":"jester","level":3}}'],
    [
      "v2, garbage field types",
      '{"schema":2,"build":{"name":1,"class":2,"level":"x","abilities":null,"skills":[],"spells":"no"}}',
    ],
    ["v2, level negative", '{"schema":2,"build":{"name":"X","class":"bard","level":-5}}'],
    ["deeply nested junk", '{"a":{"b":{"c":[1,2,{"d":null}]}}}'],
  ];
  for (const [name, json] of inputs) {
    it(`handles: ${name}`, () => {
      expect(() => importCharacter(json)).not.toThrow();
      const res = importCharacter(json);
      // Either a clean error or a coherent doc — never a throw, never undefined doc.
      if (res.success) {
        expect(res.doc.character).toBeDefined();
        expect(res.doc.session).toBeDefined();
      } else {
        expect(typeof res.error).toBe("string");
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. The SRD-free read seams never throw + always produce a safe shape.
// ════════════════════════════════════════════════════════════════════════════
describe("sanitizeCharacter / sanitizeSession never throw on garbage", () => {
  const charInputs: Array<[string, Record<string, unknown>]> = [
    ["empty", {}],
    ["garbage types", { name: 1, class: 2, level: "x", hp: "bad", classId: 9 }],
    ["hp non-object", { hp: "nope" }],
    ["hp NaN", { hp: { max: Number.NaN } }],
    ["ac Infinity", { ac: Number.POSITIVE_INFINITY, classId: "bard" }],
    ["skills as array", { skills: [1, 2, 3] }],
    ["level negative", { classId: "monk", level: -3 }],
  ];
  for (const [name, raw] of charInputs) {
    it(`sanitizeCharacter: ${name}`, () => {
      expect(() => sanitizeCharacter(raw)).not.toThrow();
      const out = sanitizeCharacter(raw);
      // R4 — `classes[]` is always a non-empty array (the source of truth); the
      // legacy `class`/`level` projection no longer lingers.
      expect(Array.isArray(out.classes)).toBe(true);
      expect((out.classes as unknown[]).length).toBeGreaterThan(0);
      expect((out.hp as { max: unknown }).max).toEqual(expect.any(Number));
    });
  }

  const sessInputs: Array<[string, Record<string, unknown>]> = [
    ["empty", {}],
    ["logEntries not array", { logEntries: "nope" }],
    ["logEntries with junk", { logEntries: [null, "x", { msg: "ok", t: 5 }, 42] }],
    ["hp string", { hp: "bad" }],
    ["currency garbage", { currency: { gp: "x" } }],
  ];
  for (const [name, raw] of sessInputs) {
    it(`sanitizeSession: ${name}`, () => {
      expect(() => sanitizeSession(raw)).not.toThrow();
      const out = sanitizeSession(raw);
      expect(Array.isArray(out.logEntries)).toBe(true);
      // Every surviving log entry is renderable: a structured event (string
      // `kind`), a stable id, and a finite ts. A pre-events `{ msg }` / `{ text }`
      // row is read-normalized to a `legacy` event (frozen text rendered verbatim).
      for (const e of out.logEntries) {
        expect(typeof e.event.kind).toBe("string");
        expect(typeof e.id).toBe("string");
        expect(Number.isFinite(e.ts)).toBe(true);
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. rehydrateCharacter never throws on a partial / malformed minimal doc.
// ════════════════════════════════════════════════════════════════════════════
describe("rehydrateCharacter never throws on partial input", () => {
  const inputs: Array<[string, Record<string, unknown>]> = [
    ["empty", {}],
    ["name only", { name: "X" }],
    ["unknown class", { name: "X", classId: "jester", level: 3 }],
    ["no abilityScores", { name: "X", classId: "bard", level: 3 }],
    ["garbage", { name: 1, class: 2, level: "x" }],
  ];
  for (const [name, raw] of inputs) {
    it(`rehydrate: ${name}`, () => {
      expect(() => rehydrateCharacter(raw as unknown as MinimalCharacter)).not.toThrow();
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Round-trip fidelity — export → import renders identically (+ idempotent).
// ════════════════════════════════════════════════════════════════════════════
describe("minimal round-trip is render-identical + idempotent", () => {
  const docs: Array<[string, CharacterDoc]> = [
    ["mock", MOCK_CHARACTER],
    ...Object.entries(DEV_SCENARIOS).map(([k, spec]): [string, CharacterDoc] => [
      k,
      buildScenario(spec),
    ]),
  ];
  const effIds = (c: CharacterData): string[] =>
    resolveEffectiveSpells(c, { grantBundleChoices: undefined })
      .flatMap((s) => ("custom" in s ? [`c:${s.name}`] : [s.srdId]))
      .sort();
  const featIds = (c: CharacterData): string[] =>
    c.features.flatMap((f) => ("srdId" in f ? [f.srdId] : ["custom"])).sort();

  for (const [name, doc] of docs) {
    it(`${name}: spells + features + AC survive export→import`, () => {
      const minimal = serializeCharacter(doc);
      const res = importCharacter(minimal);
      expect(res.success).toBe(true);
      if (!res.success) return;
      const back = rehydrateCharacter(res.doc.character);
      expect(effIds(back)).toEqual(effIds(rehydrateCharacter(doc.character)));
      expect(featIds(back)).toEqual(featIds(rehydrateCharacter(doc.character)));
      expect(effectiveAC(back, res.doc.session)).toBe(
        effectiveAC(doc.character, doc.session)
      );
      // Idempotent: re-exporting the re-imported doc yields a stable minimal form.
      const minimal2 = serializeCharacter({ ...res.doc, id: "x" } as CharacterDoc);
      const res2 = importCharacter(minimal2);
      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(effIds(rehydrateCharacter(res2.doc.character))).toEqual(
          effIds(doc.character)
        );
      }
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Override consistency — a build change RECALCULATES derived data.
// ════════════════════════════════════════════════════════════════════════════
describe("overrides recalculate consistently (never stale, never crash)", () => {
  it("changing the class entry on the minimal form re-infers the new class's features", () => {
    // R4 — the minimal model stores the multiclass `classes[]` (source of truth) and
    // DROPS the derived class features. Changing the class entry (as the Bio tab does)
    // must re-derive the NEW class's features on rehydrate, with no leftover Bard.
    const minimalBard = minimizeCharacter(MOCK_CHARACTER.character) as unknown as Record<
      string,
      unknown
    >;
    const changed = {
      ...minimalBard,
      classes: [{ classId: "wizard", subclassId: "diviner", level: 9 }],
    };
    const back = rehydrateCharacter(changed as unknown as MinimalCharacter);
    const feats = back.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []));
    expect(feats.some((id) => id.startsWith("wizard-"))).toBe(true);
    expect(feats.some((id) => id.startsWith("bard-"))).toBe(false);
    // The primary class entry reflects the new class/subclass.
    expect(primaryClassId(back)).toBe("wizard");
    expect(primarySubclassId(back)).toBe("diviner");
  });

  it("a non-finite numeric override is neutralized (never NaN AC)", () => {
    const poisoned: CharacterData = {
      ...MOCK_CHARACTER.character,
      acOverride: Number.NaN,
    };
    const doc: CharacterDoc = { ...MOCK_CHARACTER, character: poisoned };
    const res = importCharacter(serializeCharacter(doc));
    expect(res.success).toBe(true);
    if (!res.success) return;
    const back = rehydrateCharacter(res.doc.character);
    const ac = effectiveAC(back, res.doc.session);
    expect(Number.isFinite(ac)).toBe(true);
    expect(ac).toBeGreaterThan(0);
  });

  it("a stored spell foreign to the class is preserved without crashing", () => {
    const withForeignSpell: CharacterData = {
      ...MOCK_CHARACTER.character,
      classes: [{ classId: "fighter", level: 5 }],
      spells: [{ srdId: "fireball", prepared: true }],
    };
    const doc: CharacterDoc = { ...MOCK_CHARACTER, character: withForeignSpell };
    const res = importCharacter(serializeCharacter(doc));
    expect(res.success).toBe(true);
    if (!res.success) return;
    const back = rehydrateCharacter(res.doc.character);
    expect(() =>
      resolveEffectiveSpells(back, { grantBundleChoices: undefined })
    ).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Full persistence path — every doc renders on the SRD-free roster.
// ════════════════════════════════════════════════════════════════════════════
describe("full persistence path (import → store → roster read)", () => {
  const docs: Array<[string, CharacterDoc]> = [
    ["mock", MOCK_CHARACTER],
    ...Object.entries(DEV_SCENARIOS).map(([k, spec]): [string, CharacterDoc] => [
      k,
      buildScenario(spec),
    ]),
  ];
  for (const [name, doc] of docs) {
    it(`${name}: roster sees class + positive AC + positive HP`, () => {
      const res = importCharacter(serializeCharacter(doc));
      expect(res.success).toBe(true);
      if (!res.success) return;
      // The unified-codec write + SRD-free roster read: stamp the cache, then
      // materialize the roster doc from the cache + state ALONE (no parse).
      const cache = buildCharacterCache(res.doc.character, res.doc.session);
      const env = serializeCharacterEnvelope({
        character: res.doc.character,
        session: res.doc.session,
      } as CharacterDoc);
      const rosterDoc = cacheToRosterDoc(
        "x",
        { cache, state: env.state },
        {
          createdAt: new Date(0),
          updatedAt: new Date(0),
          portraitUrl: null,
          portraitCrop: null,
          shareId: null,
          status: "active",
        }
      );
      // A valid cache (non-empty name) always yields a doc — narrow off `null`.
      if (!rosterDoc) throw new Error("expected a roster doc for a valid cache");
      const roster = rosterDoc.character;
      expect(primaryClassName(roster)).toBeTruthy();
      expect(roster.ac).toBeGreaterThan(0);
      expect(roster.hp.max).toBeGreaterThan(0);
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Adversarial-audit regressions (2026-06-08) — every breakage the audit found.
// ════════════════════════════════════════════════════════════════════════════
describe("audit regressions — crashes, NaN render, and the v3 subclass bug", () => {
  it("CRASH: a non-string background does not crash import", () => {
    const json =
      '{"schema":2,"build":{"name":"X","class":"bard","level":3,"background":12345,"abilities":{"STR":10,"DEX":10,"CON":10,"INT":10,"WIS":10,"CHA":10}}}';
    expect(() => importCharacter(json)).not.toThrow();
  });

  it("CRASH: a character missing `hp` does not crash the roster cache stamp", () => {
    const noHp = { ...MOCK_CHARACTER.character } as Record<string, unknown>;
    delete noHp.hp;
    expect(() =>
      buildCharacterCache(noHp as unknown as CharacterData, MOCK_CHARACTER.session)
    ).not.toThrow();
    const cache = buildCharacterCache(
      noHp as unknown as CharacterData,
      MOCK_CHARACTER.session
    );
    expect(cache.hpMax).toBe(0);
  });

  it("NaN: garbage abilityScores are conformed to finite numbers (never NaN AC)", () => {
    const back = rehydrateCharacter({
      name: "X",
      classes: [{ classId: "bard", level: 3 }],
      abilityScores: { STR: "12" },
    } as unknown as MinimalCharacter);
    for (const code of ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const) {
      expect(Number.isFinite(back.abilityScores[code])).toBe(true);
    }
    expect(Number.isFinite(effectiveAC(back, sanitizeSession({})))).toBe(true);
  });

  it("NaN: sanitizeCharacter conforms `ac` to a finite default + a valid classes[] level", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "bard", level: 0 }],
    }) as unknown as {
      classes: Array<{ level: number }>;
      ac: number;
    };
    // A level < 1 is clamped up to a valid integer ≥ 1 by `normalizeEntry`.
    expect(out.classes[0]?.level).toBe(1);
    expect(out.ac).toBe(0);
    const out2 = sanitizeCharacter({
      classes: [{ classId: "bard", level: 1 }],
      ac: Infinity,
    }) as unknown as { ac: number };
    expect(Number.isFinite(out2.ac)).toBe(true);
  });

  it("skills arriving as an array are coerced to a clean map", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "bard", level: 1 }],
      skills: [1, 2, 3],
    });
    expect(Array.isArray(out.skills)).toBe(false);
    expect(typeof out.skills).toBe("object");
  });

  it("duplicate stored feature refs are deduped on rehydrate", () => {
    const back = rehydrateCharacter({
      name: assertNonEmptyString("X"),
      classes: [{ classId: "fighter", level: 3 }],
      features: [{ srdId: "tough" }, { srdId: "tough" }, { srdId: "tough" }],
    });
    const tough = back.features.filter((f) => "srdId" in f && f.srdId === "tough");
    expect(tough).toHaveLength(1);
  });

  it("an unknown/homebrew class never leaves hitDieType undefined", () => {
    const back = rehydrateCharacter({
      name: assertNonEmptyString("X"),
      classes: [{ classId: "necromancer", level: 3 }],
    });
    expect(typeof back.hitDieType).toBe("number");
    expect(back.hitDieType).toBeGreaterThan(0);
  });
});
