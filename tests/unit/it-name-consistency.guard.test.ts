/// <reference types="node" />
/**
 * IT-name-consistency guard (public / SRD-only). Fails the build on Italian-name drift:
 * distinct-entity collisions, untranslated regressions, retired names, and retired cross-reference
 * lexemes reappearing in prose. The composed cross-repo check (SRD + content-pack) lives in
 * content-pack/tests/unit/it-name-consistency.guard.pack.test.ts (pack mode only).
 * Authority: docs/IT_NAME_REGISTRY.md · docs/GOLDEN_RULES.md (D2).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  loadEntities,
  loadSubEntityProse,
  loadUiStrings,
  findCollisions,
  findUntranslated,
  findRetiredNames,
  findRetiredInProse,
  findRetiredInUi,
  PUBLIC_SRD_I18N,
  type AllowedCollision,
  type Ent,
} from "./__helpers__/it-name-registry";
import { BASE_ACTIONS } from "@/lib/smart-tracker";

const ents = loadEntities([PUBLIC_SRD_I18N]);
// The sub-keyed catalogue rows (grant / action / trait blurbs) — user-visible prose
// the entity loader skips, scanned by the retired-lexeme check alongside `ents`.
const subProse = loadSubEntityProse([PUBLIC_SRD_I18N]);

/**
 * The canonical Italian NOUN names of the 2024 generic actions (IT SRD 5.2.1 "Azioni" table /
 * glossary). These are the single source every prose cross-reference must agree with (D2); the
 * lock below pins the `BASE_ACTIONS` `name.it` values so a future edit can't quietly reintroduce a
 * verb form (W2 renamed Cercare→Ricerca, and added Influenza/Magia/Studio/Utilizzo).
 */
const EXPECTED_BASE_ACTION_IT: Record<string, string> = {
  "base-dash": "Scatto",
  "base-dodge": "Schivata",
  "base-disengage": "Disimpegno",
  "base-help": "Aiuto",
  "base-hide": "Nascondersi",
  "base-influence": "Influenza",
  "base-magic": "Magia",
  "base-ready": "Prepararsi",
  "base-search": "Ricerca",
  "base-study": "Studio",
  "base-utilize": "Utilizzo",
  "base-grapple": "Afferrare",
  "base-shove": "Spingere",
  "base-opportunity-attack": "Attacco di Opportunità",
};

/**
 * Retired base-action VERB forms. The 2024 IT SRD 5.2.1 renamed the generic actions to nouns
 * (Attacco / Utilizzo / Studio …); prose (spell action lists like Velocità, cursed-weapon
 * compulsions) must reference the noun, never the retired infinitive (Attaccare / Utilizzare /
 * Esaminare). Scanned as CAPITALIZED whole words: in Italian an action name is the only reason such
 * an infinitive is capitalized (an ordinary verb is lowercase), so a hit is always an action
 * reference — no "azione " prefix needed, which also catches list-form members ("…o Utilizzare").
 */
const RETIRED_ACTION_VERBS = ["Attaccare", "Utilizzare", "Esaminare"] as const;

/**
 * The canonical Italian names of the 15 conditions (IT SRD 5.2.1 "Condizioni" / the closed-set core
 * glossary in docs/IT_NAME_REGISTRY.md). Conditions are the most cross-referenced closed set in the
 * app — the rail rubric, the combat limiter banner, every spell's prose — so their lexemes are
 * PINNED here: post-sweep defect PS-B shipped "Sfinimento" in the combat chrome while the rail
 * rendered the canonical "Indebolimento" on the SAME screen. The `name` fields stay the source of
 * truth; this map is the lock that stops one drifting.
 */
const EXPECTED_CONDITION_IT: Record<string, string> = {
  blinded: "Accecato",
  charmed: "Affascinato",
  deafened: "Assordato",
  exhaustion: "Indebolimento",
  frightened: "Spaventato",
  grappled: "Afferrato",
  incapacitated: "Incapacitato",
  invisible: "Invisibile",
  paralyzed: "Paralizzato",
  petrified: "Pietrificato",
  poisoned: "Avvelenato",
  prone: "Prono",
  restrained: "Trattenuto",
  stunned: "Stordito",
  unconscious: "Privo di Sensi",
};
const IT_SRD_DIR = resolve(PUBLIC_SRD_I18N, "it", "srd");

describe("IT name consistency (public SRD)", () => {
  it("loads the SRD entity set", () => {
    expect(ents.length).toBeGreaterThan(300);
  });
  it("has no distinct-entity name collisions", () => {
    expect(findCollisions(ents)).toEqual([]);
  });
  it("has no untranslated names outside the proper-noun allowlist", () => {
    expect(findUntranslated(ents)).toEqual([]);
  });
  it("never revives a retired name as a canonical name", () => {
    expect(findRetiredNames(ents)).toEqual([]);
  });
  it("never revives a retired cross-reference lexeme in prose", () => {
    // Entity prose AND the sub-keyed grant / action / trait blurbs (the blind spot
    // PS-J found: an action summary can drift while the feature name is right).
    expect(subProse.length).toBeGreaterThan(100);
    expect(findRetiredInProse([...ents, ...subProse])).toEqual([]);
  });
  it("pins the base-action IT names to the official 2024 nouns", () => {
    const drift: string[] = [];
    for (const [id, expected] of Object.entries(EXPECTED_BASE_ACTION_IT)) {
      const action = BASE_ACTIONS.find((a) => a.id === id);
      if (!action) drift.push(`${id} missing from BASE_ACTIONS`);
      else if (action.name.it !== expected)
        drift.push(`${id}: "${action.name.it}" ≠ official "${expected}"`);
    }
    // Every BASE_ACTIONS entry must be pinned (a new action must be added to the map above).
    const unpinned = BASE_ACTIONS.filter((a) => !(a.id in EXPECTED_BASE_ACTION_IT)).map(
      (a) => a.id
    );
    expect({ drift, unpinned }).toEqual({ drift: [], unpinned: [] });
  });
  // Pins the NARROWNESS of ALLOWED_COLLISIONS (the l-m Mago pair et al.): an allowlist entry
  // exempts EXACTLY its named pair sharing its IT name — any other member set re-flags. Uses
  // synthetic entities so it stays independent of the live corpus (docs/IT_NAME_REGISTRY.md).
  describe("ALLOWED_COLLISIONS exemption is exact-pair-narrow", () => {
    const ent = (kind: string, id: string, en: string, it: string): Ent => ({
      kind,
      id,
      en,
      it,
      itFields: [],
    });
    const allow: AllowedCollision[] = [
      {
        itName: "Sinnome",
        members: ["classes:alpha", "monsters:beta"],
        justification: "test",
      },
    ];

    it("exempts the exact sanctioned pair (control)", () => {
      const ents = [
        ent("classes", "alpha", "Alpha", "Sinnome"),
        ent("monsters", "beta", "Beta", "Sinnome"),
      ];
      expect(findCollisions(ents, allow)).toEqual([]);
    });

    it("re-flags a 3-member group whose first two members match the sanctioned pair", () => {
      const ents = [
        ent("classes", "alpha", "Alpha", "Sinnome"),
        ent("monsters", "beta", "Beta", "Sinnome"),
        ent("monsters", "gamma", "Gamma", "Sinnome"),
      ];
      const hits = findCollisions(ents, allow);
      expect(hits).toHaveLength(1);
      expect(hits[0]?.members).toEqual([
        "classes:alpha (Alpha)",
        "monsters:beta (Beta)",
        "monsters:gamma (Gamma)",
      ]);
    });

    it("flags a 2-member group with one non-matching member", () => {
      const ents = [
        ent("classes", "alpha", "Alpha", "Sinnome"),
        ent("monsters", "delta", "Delta", "Sinnome"),
      ];
      const hits = findCollisions(ents, allow);
      expect(hits).toHaveLength(1);
      expect(hits[0]?.members).toEqual([
        "classes:alpha (Alpha)",
        "monsters:delta (Delta)",
      ]);
    });
  });

  it("pins the condition IT names to the official 2024 closed-set glossary", () => {
    const conditions = ents.filter((e) => e.kind === "conditions");
    const drift = conditions
      .filter((c) => EXPECTED_CONDITION_IT[c.id] !== c.it)
      .map(
        (c) => `${c.id}: "${c.it}" ≠ official "${EXPECTED_CONDITION_IT[c.id] ?? "?"}"`
      );
    // Every shipped condition must be pinned (a new one must be added to the map above).
    const unpinned = conditions
      .filter((c) => !(c.id in EXPECTED_CONDITION_IT))
      .map((c) => c.id);
    expect({ drift, unpinned }).toEqual({ drift: [], unpinned: [] });
  });

  // The chrome cross-references the same closed set the catalogues do, so the retired-lexeme scan
  // runs over `it/ui/*.json` too — where PS-B's "Sfinimento" actually shipped.
  it("never revives a retired lexeme in the Italian CHROME strings", () => {
    expect(findRetiredInUi(loadUiStrings(PUBLIC_SRD_I18N))).toEqual([]);
  });

  it("never cross-references a base action by a retired verb form (RA-W6/W8 prose sweep)", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(IT_SRD_DIR).filter((f) => f.endsWith(".json"))) {
      const text = readFileSync(resolve(IT_SRD_DIR, file), "utf8");
      for (const verb of RETIRED_ACTION_VERBS) {
        if (new RegExp(`\\b${verb}\\b`).test(text))
          offenders.push(`${file} revives "${verb}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
