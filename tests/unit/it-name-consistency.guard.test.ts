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
  findCollisions,
  findUntranslated,
  findRetiredNames,
  findRetiredInProse,
  PUBLIC_SRD_I18N,
} from "./__helpers__/it-name-registry";
import { BASE_ACTIONS } from "@/lib/smart-tracker";

const ents = loadEntities([PUBLIC_SRD_I18N]);

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
    expect(findRetiredInProse(ents)).toEqual([]);
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
