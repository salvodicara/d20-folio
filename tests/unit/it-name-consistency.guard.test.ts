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
  loadLocaleStrings,
  findFeetDistances,
  findCoverDrift,
  loadStringPairs,
  loadNamedEntities,
  findMissingCrossRefs,
  findSameEnDifferentIt,
  COVER_DEGREES_IT,
  PUBLIC_SRD_I18N,
  type AllowedCollision,
  type Ent,
} from "./__helpers__/it-name-registry";
import { BASE_ACTIONS } from "@/lib/smart-tracker";
import { baseActionKey } from "@/lib/base-action-states";
import { COVER_REFERENCE, coverKey } from "@/data/cover";
import { srd } from "@tests/_harness/loc";

/** A base action's IT name, as its card shows it. */
const baseActionNameIt = (id: string): string =>
  srd("rule", baseActionKey(id), "name", "it");

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
  "base-object-interaction": "Interagisci con un oggetto",
  "base-grapple": "Afferrare",
  "base-shove": "Spingere",
  "base-opportunity-attack": "Attacco di Opportunità",
  // Not a named SRD action (the Unarmed Strike escape rule): the owner's imperative.
  "base-escape-grapple": "Liberati",
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

/**
 * The 13 damage types as the official IT SRD 5.2.1 prints them, pinned in the two chrome shapes:
 * the bare type (`srd.damage_*`, singular masculine) and the tray label (`combat.damageTray.
 * damageOf.*`). Radiant is «radioso»/«radiosi» in the IT SRD, never «radiante».
 */
const EXPECTED_DAMAGE_IT: Record<string, [type: string, tray: string]> = {
  acid: ["Acido", "Danni da Acido"],
  bludgeoning: ["Contundente", "Danni Contundenti"],
  cold: ["Freddo", "Danni da Freddo"],
  fire: ["Fuoco", "Danni da Fuoco"],
  force: ["Forza", "Danni da Forza"],
  lightning: ["Fulmine", "Danni da Fulmine"],
  necrotic: ["Necrotico", "Danni Necrotici"],
  piercing: ["Perforante", "Danni Perforanti"],
  poison: ["Veleno", "Danni da Veleno"],
  psychic: ["Psichico", "Danni Psichici"],
  radiant: ["Radioso", "Danni Radiosi"],
  slashing: ["Tagliente", "Danni Taglienti"],
  thunder: ["Tuono", "Danni da Tuono"],
};

/** The 14 creature types and 6 sizes, as the IT SRD 5.2.1 prints them ("Tipi di creature", "Taglie"). */
const EXPECTED_CREATURE_TYPE_IT: Record<string, string> = {
  aberration: "Aberrazione",
  beast: "Bestia",
  celestial: "Celestiale",
  construct: "Costrutto",
  dragon: "Drago",
  elemental: "Elementale",
  fey: "Folletto",
  fiend: "Immondo",
  giant: "Gigante",
  humanoid: "Umanoide",
  monstrosity: "Mostruosità",
  ooze: "Melma",
  plant: "Vegetale",
  undead: "Non Morto",
};
const EXPECTED_SIZE_IT: Record<string, string> = {
  tiny: "Minuscola",
  small: "Piccola",
  medium: "Media",
  large: "Grande",
  huge: "Enorme",
  gargantuan: "Mastodontica",
};

/** The chrome keys under one prefix of `ui/srd.json` (`damage_`, `creatureType_`, `size_`). */
function srdChrome(prefix: string): Record<string, string> {
  const shard = JSON.parse(
    readFileSync(resolve(PUBLIC_SRD_I18N, "it", "ui", "srd.json"), "utf8")
  ) as { srd: Record<string, string> };
  return Object.fromEntries(
    Object.entries(shard.srd)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v])
  );
}

/**
 * Single-word EN names the cross-reference check reads as names. A bare one-word name is usually
 * an ordinary English word ("Light", "Prone" as "knocks prone"), so only closed-set terms that are
 * never ordinary prose are listed.
 */
const SINGLE_WORD_CROSS_REFS = ["Expertise", "Spellbook"];

/**
 * Cross-references the matcher cannot see but that are correct: the EN sentence distributes one
 * noun over a list ("Light, Medium, or Heavy armor"), and Italian distributes it the other way
 * ("un'armatura Leggera, Media o Pesante"). Exact lines; a new one is a miss until ruled on here.
 */
const LIST_FORM_CROSS_REFS = [
  "srd/feats:defense.description «Heavy armor» → «Armatura pesante»",
  "srd/class-features:fighter-weapon-mastery.description «Martial weapons» → «Armi da guerra»",
  "srd/class-features:ranger-weapon-mastery.description «Martial weapons» → «Armi da guerra»",
  "srd/class-features:rogue-weapon-mastery.description «Martial weapons» → «Armi da guerra»",
  "srd/class-features:sorcerer-metamagic.description «Twinned Spell» → «Incantesimo Raddoppiato»",
];

/**
 * RATCHET: cross-reference misses known and not yet fixed. It may only shrink — a new miss fails,
 * and a fixed one must be deleted from here. Empty since the 2026-11-04 terminology sweep.
 */
const KNOWN_CROSS_REF_MISSES: string[] = [];

/** Pairs that are not prose: the icon credits name each artwork by its English title. */
const NOT_PROSE = new Set(["ui/legal:legal.licenses.iconsDesc"]);

/**
 * EN names the IT SRD 5.2.1 itself prints two ways, because they are two different things: the
 * Light weapon property (Leggera) and the Light cantrip (Luce); the Nightmare creature (Cavallo
 * degli incubi) and the night hag's Nightmare action (Sogno spaventoso); the Orc species (Orco)
 * and the Orc language (Orchesco); the Tree Stride spell (Traslazione arborea) and the dryad's
 * Tree Stride action (Passo arboreo).
 */
const SANCTIONED_SPLITS = ["Light", "Nightmare", "Orc", "Tree Stride"];

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
      else if (baseActionNameIt(id) !== expected)
        drift.push(`${id}: "${baseActionNameIt(id)}" ≠ official "${expected}"`);
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

  // Every Italian sentence, catalogue and chrome alike: what a beginner reads at the table.
  const itStrings = loadLocaleStrings(PUBLIC_SRD_I18N);

  it("measures distances in metres, never in feet", () => {
    expect(itStrings.length).toBeGreaterThan(5000);
    expect(findFeetDistances(itStrings)).toEqual([]);
  });

  it("names the degrees of cover only with the official IT SRD 5.2.1 terms", () => {
    expect(findCoverDrift(itStrings)).toEqual([]);
  });

  it("titles the cover states with the official IT SRD 5.2.1 terms", () => {
    const names = COVER_REFERENCE.map((c) => srd("rule", coverKey(c.id), "name", "it"));
    expect(names.map((name) => name.toLowerCase())).toEqual([...COVER_DEGREES_IT]);
  });

  it("pins the damage-type IT names in the chrome to the official IT SRD 5.2.1", () => {
    const combat = JSON.parse(
      readFileSync(resolve(PUBLIC_SRD_I18N, "it", "ui", "combat.json"), "utf8")
    ) as { combat: { damageTray: { damageOf: Record<string, string> } } };
    const types = srdChrome("damage_");
    const tray = combat.combat.damageTray.damageOf;
    const pinned = (i: 0 | 1) =>
      Object.fromEntries(Object.entries(EXPECTED_DAMAGE_IT).map(([k, v]) => [k, v[i]]));
    expect(types).toEqual(pinned(0));
    expect(tray).toEqual(pinned(1));
  });

  it("never names Radiant damage «Radiante»: the IT SRD 5.2.1 prints «radioso»", () => {
    expect(
      itStrings
        .filter((s) => /(?<!\p{L})radiant[ei](?!\p{L})/iu.test(s.value))
        .map((s) => s.file + ": " + s.value.slice(0, 80))
    ).toEqual([]);
  });

  it("pins the creature types and sizes in the chrome to the official IT SRD 5.2.1", () => {
    expect(srdChrome("creatureType_")).toEqual(EXPECTED_CREATURE_TYPE_IT);
    expect(srdChrome("size_")).toEqual(EXPECTED_SIZE_IT);
  });

  // A retired lexeme is a variant someone already met. A NEW variant («Individuazione del
  // Pensiero» for Detect Thoughts) is invisible to that list: these two read every name from the
  // JSON and check each EN cross-reference against the IT string at the same key.
  const named = loadNamedEntities(PUBLIC_SRD_I18N);
  const topLevel = named.filter((e) => !e.id.includes("."));

  it("carries every cross-referenced entity's canonical IT name (ratchet)", () => {
    const pairs = loadStringPairs(PUBLIC_SRD_I18N).filter(
      (p) => !NOT_PROSE.has(p.file + ":" + p.key)
    );
    expect(pairs.length).toBeGreaterThan(5000);
    const sanctioned = new Set([...LIST_FORM_CROSS_REFS, ...KNOWN_CROSS_REF_MISSES]);
    const misses = findMissingCrossRefs(pairs, topLevel, SINGLE_WORD_CROSS_REFS);
    const fresh = misses.filter((m) => !sanctioned.has(m));
    const stale = [...sanctioned].filter((m) => !misses.includes(m));
    expect({ fresh, stale }).toEqual({ fresh: [], stale: [] });
  });

  it("translates one EN name one way across entities and sub-entities", () => {
    expect(named.length).toBeGreaterThan(topLevel.length);
    expect(findSameEnDifferentIt(named, SANCTIONED_SPLITS)).toEqual([]);
  });

  describe("cross-reference helpers (synthetic)", () => {
    const ent = (id: string, en: string, it: string) => ({ kind: "spells", id, en, it });
    const ents = [
      ent("detect-thoughts", "Detect Thoughts", "Individuazione dei Pensieri"),
    ];
    const pair = (en: string, it: string) => ({ file: "ui/x", key: "k", en, it });

    it("flags a variant and accepts the canonical name, inflected", () => {
      expect(
        findMissingCrossRefs(
          [pair("Cast Detect Thoughts.", "Lancia Individuazione del Pensiero.")],
          ents
        )
      ).toEqual(["ui/x:k «Detect Thoughts» → «Individuazione dei Pensieri»"]);
      expect(
        findMissingCrossRefs(
          [pair("Cast Detect Thoughts.", "individuazione dei pensieri")],
          ents
        )
      ).toEqual([]);
    });

    it("treats «di» and the elided «d'» as one", () => {
      const wm = [ent("wm", "Weapon Mastery", "Padronanza d'Armi")];
      expect(
        findMissingCrossRefs([pair("Weapon Mastery", "Padronanza di Armi")], wm)
      ).toEqual([]);
      expect(
        findMissingCrossRefs([pair("Weapon Mastery", "Padronanza Armi")], wm)
      ).toHaveLength(1);
    });

    it("reads a one-word name only when allowed", () => {
      const ex = [ent("ex", "Expertise", "Maestria")];
      expect(findMissingCrossRefs([pair("Expertise", "Competenza Doppia")], ex)).toEqual(
        []
      );
      expect(
        findMissingCrossRefs([pair("Expertise", "Competenza Doppia")], ex, ["Expertise"])
      ).toHaveLength(1);
    });

    it("flags one EN name with two IT names, case and accents aside", () => {
      const rows = [
        ent("a", "Redirect Attack", "Sviare Attacco"),
        ent("b.actions.x", "Redirect Attack", "sviare attacco"),
        ent("c.actions.y", "Redirect Attack", "Devia Attacco"),
      ];
      expect(findSameEnDifferentIt(rows)).toEqual([
        "Redirect Attack → Devia Attacco | Sviare Attacco",
      ]);
      expect(findSameEnDifferentIt(rows, ["Redirect Attack"])).toEqual([]);
    });
  });
});
