/**
 * Render-ready "sheet views" derived from a character + its aggregated grants.
 *
 * These are the consumer seams for the orphaned `AggregatedGrants` fields:
 * fixed proficiencies (L4), condition/damage immunities (L5), non-walking
 * speeds + non-darkvision senses (L6), and advantage/disadvantage clauses
 * (L1). The grant pipeline already *computes* every value here; this module
 * just turns the aggregate into a shape a renderer can map over without any
 * D&D logic, so the React side stays thin and the UI agent can rebind later.
 *
 * Everything is pure (no React, no i18n). Localisation of the *labels* —
 * damage-type / condition / sense names, advantage descriptions — happens at
 * the call site via `t(...)`; these helpers only return stable ids/codes plus
 * the bilingual `BiText` descriptions that already live on the grants.
 */

import type { AggregatedGrants, AdvantageClause, NonWalkingSpeed } from "@/lib/grants";
import type { DamageDefenses } from "@/lib/damage-intake";
import type { AbilityCode, ConditionId, DamageSource, DamageType } from "@/data/types";
import { SRD_LANGUAGE_IDS } from "@/lib/feat-language-choices";
import { SRD_TOOLS_2024 } from "@/lib/feat-skill-tool-choices";
import { isUmbrellaTool } from "@/lib/tool-names";
import { srdEn } from "@/i18n/srd-en";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { ALL_SKILLS } from "@/lib/skills";

type SkillProficiency = "proficient" | "expertise" | "halfProficiency";

/** The 18 SRD skill ids — the catalogue Jack-of-all-Trades half-proficiency fills. */
const ALL_SKILL_IDS: ReadonlyArray<string> = ALL_SKILLS.map((s) => s.id);

// ─── L4 — fixed skill / tool / save proficiency consumer ────────────────────

/**
 * The canonical proficiency-level lattice: `none < half < proficient <
 * expertise`. EVERY entry path — the character's own stored value, a fixed
 * grant, a grant-derived expertise, a Jack-of-all-Trades half — merges by MAX
 * over this order, so a higher level always wins and the merge is associative /
 * order-independent (no "who got there first" bug). The shared rule behind
 * `mergeSkillProficiencies` AND `grantSkillProficiency` (`lib/skills.ts`), so a
 * fixed proficiency upgrades a JoaT half exactly the same way on every surface
 * (#66 — a fixed-skill grant must beat a half-proficiency).
 */
const SKILL_PROF_RANK: Readonly<Record<SkillProficiency, number>> = {
  halfProficiency: 1,
  proficient: 2,
  expertise: 3,
};

/** Keep `current` only if it already ranks ≥ `candidate` (MAX-precedence merge). */
function higherSkillProficiency(
  current: SkillProficiency | undefined,
  candidate: SkillProficiency
): SkillProficiency {
  if (current === undefined) return candidate;
  return SKILL_PROF_RANK[current] >= SKILL_PROF_RANK[candidate] ? current : candidate;
}

/**
 * Union the character's own skill proficiencies with grant-derived ones, merging
 * by MAX over the `none < half < proficient < expertise` lattice
 * ({@link SKILL_PROF_RANK}). A fixed grant contributes `proficient`; a
 * grant-derived expertise contributes `expertise`; Jack-of-all-Trades
 * contributes `halfProficiency` to every otherwise-unproficient skill. A higher
 * level always wins — so a fixed-skill grant UPGRADES a Jack-of-all-Trades half
 * to full proficiency (#66), while an own `expertise` is never downgraded.
 * Returns a fresh record (input is not mutated).
 */
export function mergeSkillProficiencies(
  own: Readonly<Record<string, SkillProficiency>>,
  granted: ReadonlySet<string>,
  /**
   * Grant-derived EXPERTISE (the fixed `expertise` grant kind — Menacing's
   * Intimidation, Observant's Perception). Merges in at `expertise` (the top of
   * the lattice), upgrading any lower own/granted entry. Previously aggregated
   * but never consumed, so a feat-granted fixed expertise rendered as mere
   * proficiency (AX exposure audit).
   */
  grantedExpertise: ReadonlySet<string> = new Set(),
  /**
   * Jack-of-all-Trades (Bard L2) — when true, every skill the character is NOT
   * otherwise proficient/expert in gains `halfProficiency` (a +⌊PB/2⌋ check
   * bonus, not a real proficiency). DERIVED from the `bard-jack-of-all-trades`
   * feature's grant at evaluation time — never baked into stored `skills`
   * (#57), so it disappears the instant the feature does (level-down past L2).
   * Half is the BOTTOM rung above none, so it never overrides an own or granted
   * proficiency/expertise.
   */
  halfProficiencyAllSkills = false,
  /** The skill-id catalogue JoaT half-proficiency fills (defaults to the 18). */
  allSkillIds: ReadonlyArray<string> = ALL_SKILL_IDS
): Record<string, SkillProficiency> {
  const merged: Record<string, SkillProficiency> = { ...own };
  for (const skill of granted) {
    merged[skill] = higherSkillProficiency(merged[skill], "proficient");
  }
  for (const skill of grantedExpertise) {
    merged[skill] = higherSkillProficiency(merged[skill], "expertise");
  }
  if (halfProficiencyAllSkills) {
    for (const skill of allSkillIds) {
      merged[skill] = higherSkillProficiency(merged[skill], "halfProficiency");
    }
  }
  return merged;
}

/**
 * Union the character's own saving-throw proficiencies with grant-granted
 * ones. Returns a de-duplicated array preserving the character's own order,
 * with granted saves appended.
 */
export function mergeSaveProficiencies(
  own: ReadonlyArray<AbilityCode>,
  granted: ReadonlySet<AbilityCode>
): AbilityCode[] {
  const result = [...own];
  for (const ability of granted) {
    if (!result.includes(ability)) result.push(ability);
  }
  return result;
}

// ─── Single-source effective tokens (id-first: resolve → dedup → tag → localize) ──
//
// These are the SINGLE SOURCE OF TRUTH for the effective languages / tools a
// character has. EVERY surface — the cockpit rail, the Bio read-only view, AND
// the Bio edit-mode tag picker — derives from `effectiveProficiencyTokens`, so
// they can never drift (owner, 2026-06-06: "the Bio and the right rail must
// always be in sync — single source of truth"). The stored MANUAL data is STABLE
// IDS (`languageIds` / `toolProficiencyIds`) plus VERBATIM custom labels
// (`customLanguages` / `customToolProficiencies`, the ONE place a homebrew label
// lives); the engine-GRANTED set is EN names (the stable FACT anchor the grants
// carry), resolved to ids by an EN-name match — both deduped BY ID, then localized
// by id. So a localizable token NEVER survives as a verbatim display string (the
// "gnomico" / "Strumenti da Artigiano" leaks); only `custom*` is single-locale.
//
// The display strings join the labels; the editor renders granted tokens as LOCKED
// chips (you cannot remove a proficiency the engine grants), manual ids and custom
// labels as removable chips. Adding a new app language is JUST a new `languages.json`.

/** One resolved, deduped proficiency/language token in a character's effective set. */
export interface EffectiveProficiencyToken {
  /** The catalogue id (`"gnomish"` / `"smiths-tools"`), or `null` for a custom
   *  (off-catalogue) label. The dedup + removal key when present. */
  id: string | null;
  /** Localized label for display (id → `localizeSrd`, or the verbatim custom label). */
  label: string;
  /** Granted by the engine → LOCKED (non-removable) in the editor. */
  granted: boolean;
  /** Present in the manual store (a `*Ids` id or a `custom*` label) → removable. */
  manual: boolean;
  /** A pending UMBRELLA the player must resolve into a concrete pick (tools only):
   *  the umbrella id (`"musical-instrument"`) — rendered as "choose one kind of X",
   *  NEVER a finished chip. Undefined for a concrete token. */
  umbrellaId?: string;
}

/** A localized roster row: `{ id, en, label }` for one catalogue id in `locale`. */
interface LocalizedOption {
  id: string;
  /** The always-loaded EN name — the FACT anchor the granted EN-name set matches. */
  en: string;
  /** The name in the active `locale` (EN when IT has not loaded). */
  label: string;
}

/** Lowercase + strip diacritics so "Élfico" / "elfico" / "Elfico" all match. */
function fold(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * The CORE id-first merge: the union of the manual STABLE IDS (`ownIds`), the
 * VERBATIM custom labels (`customLabels` — off-catalogue, the ONE place a label
 * lives), and the engine-GRANTED EN-name set (resolved to ids via the roster's EN
 * anchor). Deduped BY ID (a custom label keys by its folded text). Localized by id.
 * Order: manual ids (typed order) → custom labels → granted-only ids — the
 * historical display order. `umbrella(id)` (tools) tags a held umbrella so the
 * presenter surfaces it as a PENDING choice instead of a finished chip.
 */
function effectiveTokens(
  ownIds: ReadonlyArray<string>,
  customLabels: ReadonlyArray<string>,
  granted: ReadonlySet<string>,
  roster: ReadonlyArray<LocalizedOption>,
  umbrella?: (id: string) => boolean
): EffectiveProficiencyToken[] {
  const byId = new Map<string, LocalizedOption>();
  const byEn = new Map<string, LocalizedOption>();
  for (const o of roster) {
    byId.set(o.id, o);
    byEn.set(fold(o.en), o);
  }
  const out: EffectiveProficiencyToken[] = [];
  const indexByKey = new Map<string, number>();
  const addId = (id: string, isGranted: boolean, isManual: boolean): void => {
    const opt = byId.get(id);
    if (!opt) return; // unknown id (never store an unresolved id) — skip, never leak
    const existing = indexByKey.get(`id:${id}`);
    if (existing !== undefined) {
      const prior = out[existing];
      if (!prior) return;
      if (isGranted) prior.granted = true;
      if (isManual) prior.manual = true;
      return;
    }
    indexByKey.set(`id:${id}`, out.length);
    out.push({
      id,
      label: opt.label,
      granted: isGranted,
      manual: isManual,
      ...(umbrella?.(id) ? { umbrellaId: id } : {}),
    });
  };
  for (const id of ownIds) addId(id, false, true);
  for (const raw of customLabels) {
    const label = raw.trim();
    if (!label) continue;
    const key = `raw:${fold(label)}`;
    if (indexByKey.has(key)) continue;
    indexByKey.set(key, out.length);
    out.push({ id: null, label, granted: false, manual: true });
  }
  // Granted EN names → ids (FACT-anchor match). An umbrella EN name is skipped
  // here too (a grant surfaces it only as a `choice-*` placeholder, never a fact).
  for (const en of granted) {
    const opt = byEn.get(fold(en));
    if (opt) addId(opt.id, true, false);
  }
  return out;
}

/** The localized LANGUAGE roster — every catalogue id → its EN anchor + active-locale label. */
function localizedLanguageRoster(locale: "en" | "it"): LocalizedOption[] {
  return SRD_LANGUAGE_IDS.map((id) => {
    const en = srdEn("language", id, "name") ?? id;
    const label =
      locale === "en"
        ? en
        : hasSrd("language", id, "name", "it")
          ? localizeSrd("language", id, "name", "it")
          : en;
    return { id, en, label };
  });
}

/**
 * The localized TOOL roster (#107) — every catalogue id → its EN anchor + label,
 * resolved from the SINGLE source (the SRD equipment catalogue keyed by tool id):
 * `en` is the always-loaded EN name (the stable FACT anchor) and `label` is the
 * active-locale name (EN when IT has not loaded). So a tool chip reads the SAME
 * canonical name the inventory item does — identical by construction.
 */
function localizedToolRoster(locale: "en" | "it"): LocalizedOption[] {
  return SRD_TOOLS_2024.map((tool) => {
    const en = srdEn("equipment", tool.id, "name") ?? tool.id;
    const label =
      locale === "en"
        ? en
        : hasSrd("equipment", tool.id, "name", "it")
          ? localizeSrd("equipment", tool.id, "name", "it")
          : en;
    return { id: tool.id, en, label };
  });
}

/**
 * The EFFECTIVE LANGUAGE tokens (manual ids ∪ custom labels ∪ granted), id-first,
 * deduped + localized. The one merge path behind the language display string AND
 * the Bio editor (single source of truth).
 */
export function effectiveLanguageTokens(
  languageIds: ReadonlyArray<string>,
  customLanguages: ReadonlyArray<string>,
  aggregate: Pick<AggregatedGrants, "languages">,
  locale: "en" | "it"
): EffectiveProficiencyToken[] {
  return effectiveTokens(
    languageIds,
    customLanguages,
    aggregate.languages,
    localizedLanguageRoster(locale)
  );
}

/**
 * The EFFECTIVE TOOL tokens (manual ids ∪ custom labels ∪ granted), id-first,
 * deduped + localized, with UMBRELLAS gated: a generic umbrella id
 * (`artisans-tools` / `gaming-set` / `musical-instrument`) is tagged `umbrellaId`
 * so a surface renders it as a PENDING "choose one kind of X" choice, NEVER a
 * finished proficiency chip (the "Strumenti da Artigiano" leak). The one merge path
 * behind the tool display string AND the Bio editor.
 */
export function effectiveToolTokens(
  toolProficiencyIds: ReadonlyArray<string>,
  customToolProficiencies: ReadonlyArray<string>,
  aggregate: Pick<AggregatedGrants, "toolProficiencies">,
  locale: "en" | "it"
): EffectiveProficiencyToken[] {
  return effectiveTokens(
    toolProficiencyIds,
    customToolProficiencies,
    aggregate.toolProficiencies,
    localizedToolRoster(locale),
    isUmbrellaTool
  );
}

/** Join the CONCRETE token labels for a display string — umbrellas are excluded
 *  (they're a pending choice, surfaced separately, never a finished chip). */
function joinConcrete(tokens: EffectiveProficiencyToken[]): string {
  return tokens
    .filter((t) => t.umbrellaId === undefined)
    .map((t) => t.label)
    .join(", ");
}

/** The character's effective LANGUAGES for display — manual ids ∪ custom ∪ grants, localized. */
export function displayLanguages(
  languageIds: ReadonlyArray<string>,
  customLanguages: ReadonlyArray<string>,
  aggregate: Pick<AggregatedGrants, "languages">,
  locale: "en" | "it"
): string {
  return joinConcrete(
    effectiveLanguageTokens(languageIds, customLanguages, aggregate, locale)
  );
}

/** The character's effective TOOL proficiencies for display — manual ids ∪ custom ∪
 *  grants, localized; umbrellas excluded (pending choice, never a finished chip). */
export function displayToolProficiencies(
  toolProficiencyIds: ReadonlyArray<string>,
  customToolProficiencies: ReadonlyArray<string>,
  aggregate: Pick<AggregatedGrants, "toolProficiencies">,
  locale: "en" | "it"
): string {
  return joinConcrete(
    effectiveToolTokens(toolProficiencyIds, customToolProficiencies, aggregate, locale)
  );
}

/** A localized `{ id, name: { en, it } }` option roster the Bio language picker
 *  binds to (id-first; the label derives from the id, never stored). */
export function languageOptions(): ReadonlyArray<{
  id: string;
  name: { en: string; it: string };
}> {
  return SRD_LANGUAGE_IDS.map((id) => ({
    id,
    name: {
      en: srdEn("language", id, "name") ?? id,
      it: hasSrd("language", id, "name", "it")
        ? localizeSrd("language", id, "name", "it")
        : (srdEn("language", id, "name") ?? id),
    },
  }));
}

// ─── L5 — condition & damage immunity render block ──────────────────────────

export interface ImmunitiesView {
  conditionImmunities: ConditionId[];
  damageImmunities: DamageType[];
}

/** Sorted, de-duplicated immunity ids ready to render as chips. */
export function deriveImmunities(aggregate: AggregatedGrants): ImmunitiesView {
  return {
    conditionImmunities: [...aggregate.conditionImmunities].sort(),
    damageImmunities: [...aggregate.damageImmunities].sort(),
  };
}

// ─── #68 — set-valued defense & proficiency overrides ───────────────────────

/**
 * Apply a set-valued override map to a computed id set (Constitution #1,
 * override-first). The effective set = `(computed ∪ {keys set true}) \ {keys set
 * false}`, returned sorted + de-duplicated. An absent / empty `override` returns
 * the pure computed set unchanged. This is the single seam every defenses /
 * proficiency consumer (the cockpit rail display AND any combat damage math)
 * routes through, so a player's manual add/remove of a resistance, immunity,
 * vulnerability, condition-immunity or proficiency is honoured uniformly without
 * forking the grant engine. Pure (no Firebase) — safe for CI-pure unit tests.
 */
export function applySetOverride(
  computed: Iterable<string>,
  override: Record<string, boolean> | undefined
): string[] {
  const set = new Set<string>(computed);
  if (override) {
    for (const [id, on] of Object.entries(override)) {
      if (on) set.add(id);
      else set.delete(id);
    }
  }
  return [...set].sort();
}

// ─── PLAY-NO-EDIT — session defense overlay (one kind) ──────────────────────

/**
 * One defense kind's render/effective view after layering the SESSION overlay
 * (defenses gained in play — a potion, a spell, a curse) over the PERMANENT set
 * (grant-computed + the #68 build override map). The single seam for every
 * consumer of "what is this character resistant/immune/vulnerable to right
 * now": the rail renders `permanent` as sheet text and `session` as removable
 * chips; any combat damage math reads `effective`.
 */
export interface DefenseKindView {
  /** The build's set: `applySetOverride(grant-computed, build override map)`. */
  permanent: string[];
  /**
   * The session-added ids actually CONTRIBUTING something — stored entries that
   * duplicate a permanent defense are filtered out (they carry no information;
   * the add picker also refuses already-effective ids, so this only happens
   * when a later build change makes a session chip redundant).
   */
  session: string[];
  /** `permanent ∪ session` — sorted, de-duplicated. */
  effective: string[];
}

/**
 * Layer one kind's session defense list over its permanent set. Pure; both
 * inputs come straight from the stores (`aggregate.* + charData.*Overrides`,
 * `session.sessionDefenses?.[kind]`).
 */
export function deriveDefenseKind(
  computed: Iterable<string>,
  override: Record<string, boolean> | undefined,
  sessionAdds: readonly string[] | undefined
): DefenseKindView {
  const permanent = applySetOverride(computed, override);
  const permanentSet = new Set(permanent);
  const session = [...new Set(sessionAdds ?? [])]
    .filter((id) => !permanentSet.has(id))
    .sort();
  return { permanent, session, effective: [...permanent, ...session].sort() };
}

// ─── Source-keyed damage resistance render block ────────────────────────────

/**
 * The defenses-block view for resistances keyed to a damage SOURCE rather than
 * a `DamageType` — Abjurer's Spell Resistance ("Resistance to the damage of
 * spells", `"spell"`). Distinct from `aggregate.damageResistances` (the
 * per-element set the sheet renders as element chips): a source resistance
 * halves the damage no matter what element the spell deals, so the renderer
 * surfaces it as its own "resistant to the damage of <source>" chip.
 *
 * Returns the sorted, de-duplicated source ids. Localisation of each source's
 * label happens at the call site (`t("damageSource.spell", …)`); this helper
 * stays pure and returns stable ids only, exactly like {@link deriveImmunities}.
 */
export function deriveDamageSourceResistances(
  aggregate: AggregatedGrants
): DamageSource[] {
  return [...aggregate.damageSourceResistances].sort();
}

// ─── Flat damage-reduction render lines (self-side informational defense) ────

/** One resolved `flat-damage-reduction` line ready to render. */
export interface FlatDamageReductionLine {
  /** Sorted, de-duplicated damage types the reduction applies to. */
  damageTypes: DamageType[];
  /** The resolved flat amount ("PB" already → the character's PB). */
  amount: number;
  /** True when gated on wearing Heavy armor (the label notes the condition). */
  requiresHeavyArmor: boolean;
  /** Granting entity id — the render label's provenance. */
  sourceId: string;
}

/**
 * Resolve the `flat-damage-reduction` entries (Heavy Armor Master's −PB on
 * Bludgeoning/Piercing/Slashing in Heavy armor) into render lines: the `"PB"`
 * sentinel becomes the passed `pb`, and a `"wearing-heavy-armor"`-gated entry is
 * DROPPED unless `heavyArmorEquipped` (the line only shows while the condition
 * holds, like the Ranger Roving speed gate). Self-side only: the defenses rail
 * renders the surviving lines, and `deriveDamageDefenses` feeds them to the
 * RA-05 damage-intake math (subtracted before the resistance halving).
 *
 * Pure: takes the already-resolved `pb` + `heavyArmorEquipped` (computed at the
 * call site from the equipment), returns stable ids + the resolved amount. The
 * label is localized at the call site (`character.flatDamageReductionLabel`).
 */
export function deriveFlatDamageReductions(
  aggregate: AggregatedGrants,
  pb: number,
  heavyArmorEquipped: boolean
): FlatDamageReductionLine[] {
  const lines: FlatDamageReductionLine[] = [];
  for (const e of aggregate.flatDamageReductions) {
    if (e.condition === "wearing-heavy-armor" && !heavyArmorEquipped) continue;
    const amount = e.amount === "PB" ? pb : e.amount;
    if (amount <= 0) continue;
    lines.push({
      damageTypes: [...new Set(e.damageTypes)].sort(),
      amount,
      requiresHeavyArmor: e.condition === "wearing-heavy-armor",
      sourceId: e.sourceId,
    });
  }
  return lines;
}

// ─── RA-05 — the damage-intake defense bundle ────────────────────────────────

/**
 * Assemble the character's EFFECTIVE damage defenses for the damage-intake
 * math (`lib/damage-intake.ts`) from the SAME seams the rail renders — each
 * typed kind through {@link deriveDefenseKind} (grants + #68 build override
 * map + the PLAY-NO-EDIT session overlay), the source resistances through
 * {@link deriveDamageSourceResistances}, and the flat reductions through
 * {@link deriveFlatDamageReductions} (PB sentinel + heavy-armor gate already
 * resolved). One assembly, so the applied math can never disagree with the
 * displayed defense chips (golden rule 6).
 */
export function deriveDamageDefenses(
  aggregate: AggregatedGrants,
  overrides: {
    resistance?: Record<string, boolean>;
    immunity?: Record<string, boolean>;
    vulnerability?: Record<string, boolean>;
  },
  sessionDefenses:
    | Partial<Record<"resistance" | "immunity" | "vulnerability", string[]>>
    | undefined,
  pb: number,
  heavyArmorEquipped: boolean
): DamageDefenses {
  return {
    resistances: new Set(
      deriveDefenseKind(
        aggregate.damageResistances,
        overrides.resistance,
        sessionDefenses?.resistance
      ).effective as DamageType[]
    ),
    immunities: new Set(
      deriveDefenseKind(
        aggregate.damageImmunities,
        overrides.immunity,
        sessionDefenses?.immunity
      ).effective as DamageType[]
    ),
    vulnerabilities: new Set(
      deriveDefenseKind(
        aggregate.damageVulnerabilities,
        overrides.vulnerability,
        sessionDefenses?.vulnerability
      ).effective as DamageType[]
    ),
    sourceResistances: new Set(deriveDamageSourceResistances(aggregate)),
    flatReductions: deriveFlatDamageReductions(aggregate, pb, heavyArmorEquipped).map(
      (l) => ({ damageTypes: l.damageTypes, amount: l.amount })
    ),
  };
}

// ─── L6 — non-walking speeds + non-darkvision senses ────────────────────────

/**
 * Canonical runtime list of the sense kinds — the source of truth the i18n
 * coverage guard imports to assert a `character.sense_<kind>` key exists in every
 * locale. The `SenseEntry.kind` union is DERIVED from this tuple, so the two can
 * never drift (add a kind here and the type widens with it; golden rule 6).
 */
export const SENSE_KINDS = [
  "darkvision",
  "blindsight",
  "tremorsense",
  "truesight",
  "see-invisible",
] as const;

export interface SenseEntry {
  /** Sense kind — used for the i18n key + glyph. */
  kind: (typeof SENSE_KINDS)[number];
  rangeFt: number;
}

/**
 * Canonical runtime list of the non-walking speed kinds — source of truth for the
 * `character.speed_<kind>` i18n keys; the `SpeedEntry.kind` union is derived.
 */
export const SPEED_KINDS = ["fly", "swim", "climb"] as const;

export interface SpeedEntry {
  /** Movement kind — used for the i18n key. */
  kind: (typeof SPEED_KINDS)[number];
  /** Absolute feet after resolving the `equal-to-walking` sentinel. */
  rangeFt: number;
}

export interface SensesSpeedsView {
  senses: SenseEntry[];
  speeds: SpeedEntry[];
}

/**
 * Resolve a `NonWalkingSpeed | null` against the character's current walking
 * speed. `"equal-to-walking"` becomes the walking speed; `null` → null.
 */
export function resolveNonWalkingSpeed(
  value: NonWalkingSpeed | null,
  walkingSpeedFt: number
): number | null {
  if (value === null) return null;
  if (value === "equal-to-walking") return walkingSpeedFt;
  if (value === "twice-walking") return walkingSpeedFt * 2;
  return value;
}

/**
 * Derive the full senses (darkvision + blindsight + tremorsense + truesight)
 * and the three non-walking speeds. Only entries with a positive range are
 * included. `walkingSpeedFt` resolves the `equal-to-walking` sentinel.
 */
export function deriveSensesAndSpeeds(
  aggregate: AggregatedGrants,
  walkingSpeedFt: number
): SensesSpeedsView {
  const senses: SenseEntry[] = [];
  if (aggregate.darkvisionFt > 0)
    senses.push({ kind: "darkvision", rangeFt: aggregate.darkvisionFt });
  if (aggregate.blindsightFt > 0)
    senses.push({ kind: "blindsight", rangeFt: aggregate.blindsightFt });
  if (aggregate.tremorsenseFt > 0)
    senses.push({ kind: "tremorsense", rangeFt: aggregate.tremorsenseFt });
  if (aggregate.truesightFt > 0)
    senses.push({ kind: "truesight", rangeFt: aggregate.truesightFt });
  if (aggregate.seeInvisibleFt > 0)
    senses.push({ kind: "see-invisible", rangeFt: aggregate.seeInvisibleFt });

  const speeds: SpeedEntry[] = [];
  const fly = resolveNonWalkingSpeed(aggregate.flySpeed, walkingSpeedFt);
  if (fly !== null && fly > 0) speeds.push({ kind: "fly", rangeFt: fly });
  const swim = resolveNonWalkingSpeed(aggregate.swimSpeed, walkingSpeedFt);
  if (swim !== null && swim > 0) speeds.push({ kind: "swim", rangeFt: swim });
  const climb = resolveNonWalkingSpeed(aggregate.climbSpeed, walkingSpeedFt);
  if (climb !== null && climb > 0) speeds.push({ kind: "climb", rangeFt: climb });

  return { senses, speeds };
}

// ─── L1 — advantage / disadvantage chips ────────────────────────────────────

/**
 * Canonical runtime list of the advantage-chip modes — source of truth for the
 * `abilities.<mode>` i18n keys (Adv./Disadv.); `AdvantageChip.mode` is derived.
 */
export const ADVANTAGE_MODES = ["advantage", "disadvantage"] as const;

export interface AdvantageChip {
  sourceId: string;
  mode: (typeof ADVANTAGE_MODES)[number];
  rollType: "save" | "check" | "attack" | "initiative";
  /** Free-text roll descriptor (e.g. "initiative", "saves vs poison"). */
  vs: string;
  /** Bilingual description straight off the grant. */
  description: AdvantageClause["description"];
  /**
   * FRONTIER-S3 — `true` when this clause applies only during combat ROUND 1
   * (Assassinate). The combat consumer gates it on `combatStore.round === 1`;
   * absent = a permanent clause.
   */
  round1?: boolean;
  /**
   * `true` when the clause rides a `while-active` toggle that is currently up
   * (Rage's STR advantage, Reckless Attack). The chip appends a "· active"
   * suffix (the `combat.whileActiveNote` key) so the user sees the advantage is
   * conditional on the toggle — mirrors the weapon-damage breakdown note.
   */
  whileActive?: boolean;
}

/**
 * Flatten advantage + disadvantage clauses into a single chip list (advantages
 * first, then disadvantages), tagging each with its mode. `extra` lets a caller
 * fold in clauses from outside the grant pipeline — chiefly the active
 * conditions' self-side adv/dis (`resolveConditionEffects`) so a Poisoned or
 * Frightened character actually shows those chips alongside feature/race ones.
 */
export function deriveAdvantageChips(
  aggregate: AggregatedGrants,
  extra?: {
    advantages: ReadonlyArray<AdvantageClause>;
    disadvantages: ReadonlyArray<AdvantageClause>;
  }
): AdvantageChip[] {
  const chips: AdvantageChip[] = [];
  for (const c of [...aggregate.advantages, ...(extra?.advantages ?? [])]) {
    chips.push({
      sourceId: c.sourceId,
      mode: "advantage",
      rollType: c.rollType,
      vs: c.vs,
      description: c.description,
      ...(c.round1 ? { round1: true } : {}),
      ...(c.whileActiveKey ? { whileActive: true } : {}),
    });
  }
  for (const c of [...aggregate.disadvantages, ...(extra?.disadvantages ?? [])]) {
    chips.push({
      sourceId: c.sourceId,
      mode: "disadvantage",
      rollType: c.rollType,
      vs: c.vs,
      description: c.description,
      ...(c.whileActiveKey ? { whileActive: true } : {}),
    });
  }
  return chips;
}
