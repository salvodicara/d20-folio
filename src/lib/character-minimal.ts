/**
 * Minimal-character codec — the import spine.
 *
 * `minimizeCharacter` strips a `CharacterData` down to the irreducible facts: the
 * EXPLICIT CHOICES a player made plus any manual OVERRIDE. Every field a standard
 * 2024 grant determines (saving throws, hit die, spell slots, spellcasting block,
 * species Speed, the background Origin feat, the point-buy budget) is dropped when
 * it equals what the engine would infer; `features[]` is SUBSET-minimized (the
 * derived class/subclass refs drop, chosen feats / custom / race traits stay) —
 * all rebuilt by `rehydrateCharacter` on the way back in.
 *
 * R4 — `classes[]` is the SOLE source of truth for the class breakdown (id-first;
 * single-class = a one-entry array). There is NO legacy `class`/`subclass`/`classId`/
 * `subclassId`/`level` projection — every derivable field is inferred per-entry off
 * `classes[]` (PB/slots from the total + the multiclass table; features per entry).
 *
 * LOSSLESS BY CONSTRUCTION: the invariant is `rehydrate(minimize(x)) ===
 * rehydrate(x)` (on the rendered sheet). A whole-field value drops only when it
 * equals its inferred value; for `features[]` only the derived refs drop (and
 * re-merge). Anything that deviates (an override, a non-default value the engine
 * can't yet infer) is KEPT, so a weaker inferer costs export SIZE, never correctness.
 *
 * Pure + Firebase-free (composes only `character-infer` + `classes` + the slot
 * table) so persistence and CI can both use it — see `pure-modules-guard.test.ts`.
 */

import type {
  CharacterData,
  ClassEntry,
  SrdSpellRef,
  CustomSpell,
  SrdFeatureRef,
  CustomFeature,
} from "@/types/character";
import { conformStoredFeatures } from "@/lib/conform-stored-features";
import {
  ABILITY_BUDGET_DEFAULT,
  inferFeatures,
  inferHitDie,
  inferSavingThrows,
  inferSpeed,
  inferSpellcasting,
  inferSpellSlots,
  inferHpMax,
} from "@/lib/character-infer";
import { effectiveAlwaysPreparedEntries } from "@/lib/expanded-spells";
import { getClasses, primaryClassEntry } from "@/lib/classes";
import { computeMulticlassSpellSlots } from "@/lib/multiclass-slots";

/**
 * A minimized character: a subset of `CharacterData` with derivable + default-valued
 * keys removed. R4 — `classes[]` (the multiclass breakdown) is the always-present
 * source of truth.
 */
export type MinimalCharacter = Partial<CharacterData> &
  Pick<CharacterData, "name" | "classes">;

/**
 * The spell slots a (possibly multiclassed) character has. Single-class uses the
 * primary class table's own per-level slots (a half-caster's generous L1–9
 * progression); multiclass uses the 2024 Multiclass Spellcaster table over the
 * combined caster level plus separate Pact Magic. The two genuinely differ for a
 * half-caster (Paladin L3 single = 3 slots; multiclassed = 2), so we branch on
 * class count — never apply the multiclass rounding to a lone class.
 */
function deriveSpellSlots(
  classes: ClassEntry[]
): Array<{ level: number; total: number }> {
  if (classes.length <= 1) {
    const entry = classes[0];
    return entry ? inferSpellSlots(entry) : [];
  }
  return computeMulticlassSpellSlots(classes);
}

/** Order-sensitive structural equality for the small JSON-shaped values we compare. */
function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEmptyCollection(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/**
 * Fields that are pure functions of the explicit core (`classes[]` + background) or
 * have a fixed default. `derive(c)` yields the value the engine would infer;
 * `minimize` drops the stored field when it matches, `rehydrate` refills it when
 * absent. Both directions read the SAME table, so they can never disagree.
 */
interface DerivableField {
  key: keyof CharacterData;
  /** The value to refill when the field is absent (the inferred / default value). */
  derive: (classes: ClassEntry[], c: CharacterData) => unknown;
  /** Custom "is this the default?" predicate (defaults to exact equality). */
  isDefault?: (value: unknown, classes: ClassEntry[], c: CharacterData) => boolean;
}

const DERIVABLE: DerivableField[] = [
  { key: "savingThrows", derive: (classes) => inferSavingThrows(primaryEntry(classes)) },
  { key: "hitDieType", derive: (classes) => inferHitDie(primaryEntry(classes)) },
  {
    // Single-class → the class table's own slots. Multiclass → the 2024 Multiclass
    // Spellcaster table (combined, rounded-DOWN caster level) + separate Pact Magic.
    key: "spellSlots",
    derive: (classes) => deriveSpellSlots(classes),
  },
  { key: "speed", derive: (_classes, c) => inferSpeed({ race: c.race }) },
  {
    key: "spellcasting",
    derive: (classes) => inferSpellcasting(primaryEntry(classes)),
  },
  {
    // `bgFeat` is the player's Origin-feat OVERRIDE; "" means "derive from the
    // background" (the 2024 default). Only the empty marker is dropped.
    key: "bgFeat",
    derive: () => "",
    isDefault: (value) => value === "",
  },
  { key: "abilityBudget", derive: () => ABILITY_BUDGET_DEFAULT },
  { key: "levelUpChecklist", derive: () => null },
  { key: "proficiencyBonusOverride", derive: () => null },
  { key: "humanOriginFeat", derive: () => "" },
  { key: "backgroundAsi", derive: () => ({}) },
  // `hp.max` is the standard average for the class breakdown — drops + re-infers
  // when it matches; a rolled value or HP-feat total (Tough) DEVIATES and is kept.
  {
    key: "hp",
    derive: (classes, c) => ({ max: inferHpMax(classes, c.abilityScores.CON) }),
  },
];

/** The primary (highest-level, ties → first) entry of a non-empty classes array. */
function primaryEntry(classes: ClassEntry[]): ClassEntry {
  return classes.reduce((best, e) => (e.level > best.level ? e : best));
}

/**
 * Optional collection fields whose ABSENCE is the documented default. When empty
 * they carry no information, so they are dropped on minimize and simply left
 * absent on rehydrate (no refill needed — the type allows their omission).
 */
const OPTIONAL_EMPTY_KEYS: ReadonlyArray<keyof CharacterData> = [
  "savingThrowBonusOverrides",
  "skillBonusOverrides",
  "senseRangeOverrides",
  "speedOverrides",
  "damageResistanceOverrides",
  "damageImmunityOverrides",
  "damageVulnerabilityOverrides",
  "conditionImmunityOverrides",
  "armorProficiencyOverrides",
  "weaponProficiencyOverrides",
  // Tool-CHOICE picks: an empty `{}` (no choice made) carries no information —
  // drop on minimize, leave absent on rehydrate (the type allows omission).
  "toolChoices",
  // MANUAL language / tool picks as id arrays + custom labels — an empty `[]`
  // carries no information; drop on minimize, refilled to `[]` on rehydrate.
  "languageIds",
  "customLanguages",
  "toolProficiencyIds",
  "customToolProficiencies",
];

/** The srdIds the engine DERIVES into `features[]` (class + subclass, every entry)
 *  — the ones a minimal document never stores; race/origin/chosen/custom are kept. */
function derivedFeatureIds(classes: ClassEntry[]): Set<string> {
  return new Set(inferFeatures(classes).map((f) => f.srdId));
}

/** A feature ref the minimizer keeps: custom, or an srdId NOT in the derived set. */
function isStoredFeature(f: unknown, derivedIds: Set<string>): boolean {
  if (f && typeof f === "object" && "custom" in f) return true;
  const srdId = (f as { srdId?: string }).srdId;
  return typeof srdId === "string" && !derivedIds.has(srdId);
}

/** The only keys a BARE inferred always-prepared spell ref carries. A ref with
 * anything else (notes, an ability override, a free-cast source, mastery /
 * signature flags) holds player data and must be kept. */
const BARE_SPELL_KEYS: ReadonlySet<string> = new Set([
  "srdId",
  "prepared",
  "alwaysPrepared",
]);

/**
 * A spell ref the minimizer can DROP: a BARE SRD ref whose id the engine re-infers
 * as always-prepared. The read seam (`resolveEffectiveSpells`) re-adds it
 * identically, so storing it is redundant. Custom spells, non-inferred picks, an
 * explicit `prepared:false` opt-out, and any ref carrying extra player data are KEPT.
 */
function isDroppableSpell(
  s: SrdSpellRef | CustomSpell,
  inferredIds: ReadonlySet<string>
): boolean {
  if ("custom" in s) return false;
  if (!inferredIds.has(s.srdId)) return false;
  if (s.prepared === false) return false; // explicit un-prepare is a player signal
  for (const k of Object.keys(s)) {
    if (!BARE_SPELL_KEYS.has(k)) return false; // carries extra player data → keep
  }
  return true;
}

const ENTRY_PICK_KEYS = [
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const;

/**
 * The minimal `classes[]` for storage: the canonical entry array (id-first; single-
 * class = one entry), each entry minimized to drop empty pick arrays. Field order
 * mirrors the ClassEntry shape (classId · subclassId · level · picks) for readable
 * fixtures; subclassId is omitted before the subclass level. Order-stable.
 */
function minimizeClasses(character: CharacterData): ClassEntry[] {
  return getClasses(character).map((e) => {
    const out: ClassEntry = { classId: e.classId } as ClassEntry;
    if (e.subclassId) out.subclassId = e.subclassId;
    out.level = e.level;
    for (const key of ENTRY_PICK_KEYS) {
      const v = e[key];
      if (v?.length) out[key] = v;
    }
    return out;
  });
}

/**
 * Strip a `CharacterData` to its minimal form. Drops: null/undefined override
 * fields (their default is "derive"); derivable fields that equal their inferred
 * value; empty optional collections; and the DERIVED class/subclass entries of
 * `features[]` (SUBSET minimization — chosen feats, custom features, and race
 * traits are kept; the derived ones are merged back on rehydrate). Everything
 * else — explicit choices, non-default overrides, free text — is kept verbatim.
 */
export function minimizeCharacter(character: CharacterData): MinimalCharacter {
  const classes = getClasses(character);
  const source = character as unknown as Record<string, unknown>;

  // Compute the set of keys to omit, then build by INCLUSION (no dynamic delete).
  const drop = new Set<string>();
  for (const f of DERIVABLE) {
    const v = source[f.key];
    if (v === undefined) continue;
    const isDefault = f.isDefault
      ? f.isDefault(v, classes, character)
      : jsonEq(v, f.derive(classes, character));
    if (isDefault) drop.add(f.key);
  }
  for (const k of OPTIONAL_EMPTY_KEYS) {
    if (isEmptyCollection(source[k])) drop.add(k);
  }
  // `features` is handled by SUBSET minimization below, never copied verbatim.
  drop.add("features");
  // `ac` is a DERIVED snapshot (= `effectiveAC`), not a choice — dropped here. The
  // Firestore WRITE stamps the effective AC into the SRD-free roster `cache`
  // (`buildCharacterCache`), NOT into the `build`; the cockpit computes AC live; an
  // export re-imports + recomputes. So it's reconstructible.
  drop.add("ac");
  // `skills` is SUBSET-minimized: `halfProficiency` is never a stored CHOICE —
  // it is the DERIVED Jack-of-All-Trades benefit (#57), refilled at render — so
  // only real `proficient`/`expertise` picks are kept (handled below).
  drop.add("skills");
  // `classes[]` is emitted explicitly (minimized) at the end.
  drop.add("classes");

  const min: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(character)) {
    if (v === null || v === undefined) continue; // a null/absent override means "derive"
    if (drop.has(k)) continue;
    min[k] = v;
  }

  // Subset-minimize features: keep only the entries the engine can't infer
  // (chosen feats / custom / race traits); the derived class+subclass refs drop
  // and are merged back by `rehydrateCharacter`. Omit the key entirely when empty.
  const derivedIds = derivedFeatureIds(classes);
  const extras = character.features.filter((f) => isStoredFeature(f, derivedIds));
  if (extras.length > 0) min.features = extras;

  // Subset-minimize spells: drop the BARE inferred always-prepared spells — the
  // read seam (`resolveEffectiveSpells`) re-infers them, so storing them is
  // redundant. Only the SESSION-INDEPENDENT inferred set is dropped, so bundle-
  // conditional spells are kept; every player-chosen spell + any ref carrying
  // player data is kept too.
  if (Array.isArray(min.spells) && (min.spells as unknown[]).length > 0) {
    const inferred = new Set(
      effectiveAlwaysPreparedEntries(character).map((e) =>
        typeof e === "string" ? e : e.spellId
      )
    );
    const kept = (min.spells as (SrdSpellRef | CustomSpell)[]).filter(
      (s) => !isDroppableSpell(s, inferred)
    );
    if (kept.length > 0) min.spells = kept;
    else delete min.spells;
  }

  // Subset-minimize skills: keep only real `proficient` / `expertise` picks —
  // drop every `halfProficiency` entry (the DERIVED Jack-of-All-Trades benefit,
  // refilled at render by `mergeSkillProficiencies`, #57). Omit the key when empty.
  {
    const kept = Object.fromEntries(
      Object.entries(character.skills).filter(([, v]) => v !== "halfProficiency")
    );
    if (Object.keys(kept).length > 0) min.skills = kept;
  }

  // R4 — `classes[]` is the SOURCE OF TRUTH; emit it minimized (empty pick arrays
  // dropped per entry). No projection fields exist to drop.
  min.classes = minimizeClasses(character);

  return min as MinimalCharacter;
}

/** Numeric scalar override fields: must be finite, else treated as "derive". */
const SCALAR_OVERRIDE_KEYS = [
  "acOverride",
  "speedOverride",
  "proficiencyBonusOverride",
  "initiativeBonusOverride",
  "passivePerceptionOverride",
  "passiveInsightOverride",
  "passiveInvestigationOverride",
  "hitDiceTotalOverride",
] as const;

/** Map-valued override fields (id → number); non-finite entries are dropped. */
const MAP_OVERRIDE_KEYS = [
  "skillBonusOverrides",
  "savingThrowBonusOverrides",
  "senseRangeOverrides",
  "speedOverrides",
] as const;

/**
 * Override-safety seam (goal prong 3: an override must NEVER break the sheet). A
 * manual override may be ANY finite homebrew value, but a non-finite one
 * (`NaN` / ±`Infinity`) must never reach a consumer: `override ?? computed` lets
 * `NaN` through (it isn't nullish) and poisons the derived stat. This nulls every
 * non-finite scalar override and drops non-finite map entries, so the value falls
 * back to the engine-computed default — homebrew preserved, garbage neutralized.
 */
function sanitizeOverrides(c: Record<string, unknown>): void {
  for (const key of SCALAR_OVERRIDE_KEYS) {
    const v = c[key];
    if (typeof v === "number" && !Number.isFinite(v)) c[key] = null;
  }
  for (const key of MAP_OVERRIDE_KEYS) {
    const map = c[key];
    if (map && typeof map === "object" && !Array.isArray(map)) {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
        if (typeof v !== "number" || Number.isFinite(v)) cleaned[k] = v;
      }
      c[key] = cleaned;
    }
  }
  const sc = c.spellcasting;
  if (sc && typeof sc === "object" && !Array.isArray(sc)) {
    const block = { ...(sc as Record<string, unknown>) };
    let touched = false;
    for (const key of ["saveDCOverride", "attackBonusOverride", "preparedMaxOverride"]) {
      const v = block[key];
      if (typeof v === "number" && !Number.isFinite(v)) {
        block[key] = null;
        touched = true;
      }
    }
    if (touched) c.spellcasting = block;
  }
  // Per-weapon numeric override (`attackBonusOverride`) — a non-finite value would
  // poison the combat attack row the same way. Clone only the offending entry.
  if (Array.isArray(c.weapons)) {
    c.weapons = (c.weapons as unknown[]).map((w) => {
      if (w && typeof w === "object" && !Array.isArray(w)) {
        const wr = w as Record<string, unknown>;
        if (
          typeof wr.attackBonusOverride === "number" &&
          !Number.isFinite(wr.attackBonusOverride)
        ) {
          return { ...wr, attackBonusOverride: null };
        }
      }
      return w;
    });
  }
}

/** The six ability codes — `abilityScores` must carry a finite number for each. */
const ABILITY_CODES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

/**
 * Reconstruct a full `CharacterData` from its minimal form: carry every stored
 * field, then refill each derivable field the minimizer dropped with its inferred
 * value. The result is byte-identical (on the rendered sheet) to the document that
 * was minimized. Non-finite overrides are neutralized so a garbage override can
 * never break the sheet.
 */
export function rehydrateCharacter(min: MinimalCharacter): CharacterData {
  const c: Record<string, unknown> = { ...min };
  // Conform `abilityScores` BEFORE any consumer (mods / AC / DC / passives) reads
  // it — a garbage or partial import would otherwise propagate NaN. Default each
  // missing / non-finite score to 10 (a finite, neutral value); finite homebrew
  // is preserved.
  const rawScores =
    c.abilityScores &&
    typeof c.abilityScores === "object" &&
    !Array.isArray(c.abilityScores)
      ? (c.abilityScores as Record<string, unknown>)
      : {};
  const scores: Record<string, number> = {};
  for (const code of ABILITY_CODES) {
    const v = rawScores[code];
    scores[code] = typeof v === "number" && Number.isFinite(v) ? v : 10;
  }
  c.abilityScores = scores;
  // The grant engine / presenter ITERATE these collections; a partial OR
  // not-yet-migrated import can omit them, so guarantee each is an array before any
  // consumer runs. For `languageIds` / `customLanguages` / `toolProficiencyIds` /
  // `customToolProficiencies` this is the NATURAL absence-handling for the id-first
  // language/tool model: an absent field renders an EMPTY manual list (not a crash),
  // never a transitional read-shim that writes the old field back.
  for (const key of [
    "equipment",
    "weapons",
    "spells",
    "languageIds",
    "customLanguages",
    "toolProficiencyIds",
    "customToolProficiencies",
  ] as const) {
    if (!Array.isArray(c[key])) c[key] = [];
  }
  // R4 — `classes[]` is the source of truth. Normalize it (validate ids/levels,
  // guarantee non-empty) BEFORE any DERIVABLE refill runs (they read `classes`).
  // Clone each entry.
  const classes = getClasses(c as { classes?: ClassEntry[] }).map((e) => ({ ...e }));
  c.classes = classes;
  const characterView = c as unknown as CharacterData;

  for (const f of DERIVABLE) {
    if (c[f.key] === undefined) c[f.key] = f.derive(classes, characterView);
  }
  // `speed` re-derive ALSO covers the EMPTY-STRING case (the SRD-free read seam
  // coerces an absent speed to "" before rehydrate). A non-default speed is always a
  // non-empty number string, so this only refills the dropped-species-default case.
  if (typeof c.speed !== "string" || c.speed === "") {
    const speed = inferSpeed({ race: characterView.race });
    if (speed) c.speed = speed;
  }
  // Re-infer the purely-DERIVED spellcasting sub-fields (ability,
  // preparedCaster, preparedMax) so a STALE stored value can't render a wrong count
  // — these are class-fixed (the player deltas live in the *Override fields, which
  // are kept). Only when the primary class is a table caster (inferSpellcasting
  // non-null); subclass-only casters and non-casters keep their stored block.
  if (c.spellcasting && typeof c.spellcasting === "object") {
    const inferred = inferSpellcasting(primaryClassEntry({ classes }));
    if (inferred) {
      const stored = c.spellcasting as Record<string, unknown>;
      c.spellcasting = {
        ...inferred,
        saveDCOverride: (stored.saveDCOverride as number | null | undefined) ?? null,
        attackBonusOverride:
          (stored.attackBonusOverride as number | null | undefined) ?? null,
        ...(stored.preparedMaxOverride != null
          ? { preparedMaxOverride: stored.preparedMaxOverride }
          : {}),
        // RA-33 — the block is REBUILT from inferred for a table caster, so carry
        // the durable slot-count overrides across (the stored `spellSlots` array
        // itself is kept verbatim by the rehydrate, since it deviates from derived).
        ...(stored.slotMaxOverrides &&
        typeof stored.slotMaxOverrides === "object" &&
        Object.keys(stored.slotMaxOverrides).length > 0
          ? { slotMaxOverrides: stored.slotMaxOverrides }
          : {}),
      };
    }
  }
  // `initiativeBonus` was a DEAD legacy field — DELETED from `CharacterData` (it was
  // split into `initiativeBonusOverride`, which `sanitizeCharacter` infers from any
  // legacy value at the read boundary). This is a bounded ONE-WAY read-normalization
  // at the cache-rehydrate boundary: drop an incoming legacy key on load (golden rule
  // 17 — never carry dead data forward / never re-emit), so a legacy doc and its
  // minimized form rehydrate identically. `c` is an untyped record, so no typed field.
  delete c.initiativeBonus;
  // `ac` is dropped by the minimizer (a derived snapshot). Reset to a placeholder
  // so the minimal-vs-full round-trip matches (both 0); the value is never read off
  // the rehydrated doc (the cockpit recomputes; the roster reads the Firestore stamp).
  c.ac = 0;
  // Conform the stored `features[]` FIRST: drop any SRD ref that duplicates an
  // AUTO-GRANTED source — a race trait on `character.race`, or a class/subclass
  // feature the class table grants. The deployed app once BAKED race-trait refs
  // into `features[]` (`{ srdId: "orc-adrenaline-rush" }`); left in, the trait
  // surfaces TWICE (the stored-feature path's id `orc-adrenaline-rush` AND the race
  // path's `race:orc:adrenaline-rush`) — two ids the by-id dedup can't fold (the
  // "four Adrenaline Rush cards" report). This ONE read-boundary fold makes every
  // downstream resolver see a clean array; the session's spent pips migrate at the
  // read seams via `remapSessionTrackerIds` (golden rule 10 — bounded, one-way).
  const rawStored = (Array.isArray(c.features) ? c.features : []) as Array<
    SrdFeatureRef | CustomFeature
  >;
  const conformed = conformStoredFeatures({
    race: characterView.race,
    classes,
    features: rawStored,
  }).features;
  // Merge the DERIVED class+subclass features back in front of the stored extras
  // (chosen feats / custom), deduping any stored ref that's also derived.
  // Idempotent — the lossless-on-render invariant.
  const derived = inferFeatures(classes);
  const derivedIds = new Set(derived.map((f) => f.srdId));
  const seenStored = new Set<string>(derivedIds);
  const storedKept = conformed.filter((f) => {
    if (!isStoredFeature(f, derivedIds)) return false;
    const id = (f as { srdId?: string }).srdId;
    if (typeof id !== "string") return true; // custom features have no srdId — keep
    if (seenStored.has(id)) return false;
    seenStored.add(id);
    return true;
  });
  c.features = [...derived, ...storedKept];
  // NB: spells[] is NOT reconstructed here — inferred always-prepared spells are
  // re-inferred at RENDER by `resolveEffectiveSpells` (the single read seam).
  // Jack-of-All-Trades half-proficiency is likewise DERIVED at render (#57) —
  // `mergeSkillProficiencies` fills it from the feature's grant — so it is NEVER
  // re-baked into stored `skills` here; stored skills stay choices-only. The
  // minimizer omits an empty `skills` map; default it back so a minimized doc and
  // its full source rehydrate to the identical choices-only shape.
  if (c.skills === undefined) c.skills = {};
  // Override-safety: neutralize any non-finite override so a garbage value can never
  // poison a derived stat (homebrew finite values pass through untouched).
  sanitizeOverrides(c);
  return c as unknown as CharacterData;
}

/**
 * Recursively drop null / undefined values so that an absent override and an
 * explicit-null override compare equal (both mean "derive"). Used by the round-trip
 * tests to assert `rehydrate(minimize(x))` is the identity on the rendered sheet.
 */
export function canonicalizeForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => canonicalizeForCompare(v));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined) continue;
      out[k] = canonicalizeForCompare(v);
    }
    return out;
  }
  return value;
}
