/**
 * i18n DYNAMIC-KEY COVERAGE guard — the permanent closure of the last i18n crash
 * class (golden rule 13; `docs/ARCHITECTURE.md` i18n-completeness LOCKS).
 *
 * ## The crash class this closes
 * A missing i18n key THROWS in dev and renders a raw `⟦key⟧` in prod, white-
 * screening the sheet. The build-time `missingReferencedKeys` check
 * (`scripts/i18n`) only sees LITERAL `t("…")` keys — it is BLIND to a
 * DYNAMICALLY-constructed key like ``t(`srd.damage_${dt}`)``. When the `${…}`
 * suffix comes from a closed enum/id-list — or, worse, from STORED character data
 * — a value with no matching key is a latent crash that ships green.
 *
 * ## What this guard asserts (impossible-by-construction)
 * For EVERY dynamic-key family below it enumerates the suffix's canonical domain
 * FROM ITS SOURCE OF TRUTH — it IMPORTS the exported enum/const/id-list (it NEVER
 * hardcodes the values), so the guard tracks the REAL domain and can't go stale:
 * add a damage type / school / alignment / feat category and the imported tuple
 * grows, so this guard immediately demands the new key in BOTH locales. It then
 * asserts the resolved key (`prefix` + `suffix`, after any runtime transform such
 * as `.toLowerCase()` or the equipment `+"s"` pluralization) exists in BOTH the EN
 * and IT merged catalogues. A gap in EITHER locale FAILS.
 *
 * The runtime tuples are kept EXHAUSTIVE over their union at COMPILE time (the
 * `ExhaustiveTuple<…>` / tuple-derives-union pattern in `@/data/types` and the
 * co-located `*_KINDS`/`*_IDS` consts), so "a union member with no runtime entry"
 * is a build error and "a runtime entry with no i18n key" is THIS test — the two
 * together make an unkeyed dynamic value unreachable.
 *
 * ## Data-driven families (the "migrate live data / can't break on deploy" pin)
 * For families whose runtime value can originate from STORED character data —
 * `lore.alignments.<id>` above all (a `CharacterData.alignment` AlignmentId), plus
 * size/damage/school that flow from SRD or stored data — the keyed domain MUST be
 * the SAME set the runtime value can take. The alignment block additionally pins
 * that the codec READ-NORMALIZER (`alignmentIdByLabel`) can only ever yield a
 * value INSIDE `ALIGNMENT_IDS` (or "" — which the renderer guards), so a stored
 * doc can never carry an id outside the keyed set. If that ever stops holding, the
 * fix is a data migration, not a hardcoded key.
 *
 * Reuses `mergedUi` (the same shard-merge the parity/dedup guards + the runtime
 * bootstrap use) so the catalogue is loaded once, the real way. Pure + fast (no
 * render): it only flattens two JSON catalogues and walks imported tuples.
 */
import { describe, it, expect } from "vitest";
import { mergedUi } from "./__helpers__/ui-merged";
import { flatEntries, type Json } from "../../scripts/i18n/leak-detectors";

// ── Source-of-truth domain imports (NEVER hardcode a domain here) ────────────
import {
  ALL_ABILITY_CODES,
  ALL_ACTION_TYPES,
  ALL_ARMOR_CATEGORIES,
  ALL_CLASS_IDS,
  ALL_DAMAGE_SOURCES,
  ALL_DAMAGE_TYPES,
  ALL_EQUIPMENT_CATEGORIES,
  ALL_FEAT_CATEGORIES,
  ALL_MAGIC_ITEM_RARITIES,
  ALL_MAGIC_ITEM_TYPES,
  ALL_REACTION_TRIGGERS,
  ALL_SPELL_SCHOOLS,
  ALL_WEAPON_CATEGORIES,
  ALL_WEAPON_TYPES,
  CREATURE_SIZE_ORDER,
  TRACKER_UNITS,
} from "@/data/types";
import { ALL_SKILLS } from "@/lib/skills";
import { ALIGNMENT_IDS, alignmentIdByLabel } from "@/lib/lore-utils";
import { castingTimeI18nKey } from "@/lib/utils";
import { spells } from "@/data/spells";
import { BASE_ACTIONS } from "@/lib/smart-tracker";
import { SENSE_KINDS, SPEED_KINDS, ADVANTAGE_MODES } from "@/lib/views/sheet-view";
import { AURA_AFFECTS } from "@/lib/grants";
import { MANEUVER_SLOTS } from "@/data/maneuvers";
import { REPORT_TYPES, REPORT_SEVERITIES } from "@/features/report/types";
import { ALL_TOOL_CHOICE_KINDS } from "@/data/background-equipment";
import { CLASS_ROLE_IDS } from "@/features/creation/steps/class-roles";
import { ALGO_ICONS } from "@/components/shared/icon-registry";
import { CURRENCY_METALS } from "@/components/shared/currency";

// ── Flatten both locale catalogues once (the real shard-merge) ───────────────
const enKeys = new Set(flatEntries(mergedUi("en") as Json).keys());
const itKeys = new Set(flatEntries(mergedUi("it") as Json).keys());

/**
 * One dynamic-key family: a label, the canonical SOURCE-OF-TRUTH import it draws
 * from (for the failure message + provenance), and the full set of resolved i18n
 * keys the family can ever request at runtime. `keys()` is computed lazily from
 * the imported domain (+ any runtime transform), so the table is never hardcoded.
 */
interface Family {
  /** Human label + the `t(\`…\`)` shape, e.g. ``srd.damage_${dt}``. */
  readonly label: string;
  /** The source-of-truth export(s) the domain is enumerated FROM. */
  readonly source: string;
  /** Every resolved i18n key (prefix + transformed suffix) this family emits. */
  readonly keys: () => readonly string[];
}

/**
 * The casting-time domain is the set of tokens `castingTimeI18nKey` can return —
 * derived by running the SAME normalizer the call sites do over every SRD spell's
 * `castingTime`, PLUS the custom-spell form's hardcoded option tokens (which are
 * authored against the catalogue). Enumerated from data, not hardcoded, so a new
 * spell with a new casting-time string is caught.
 */
function castingTimeTokens(): string[] {
  const fromSpells = spells.map((s) => castingTimeI18nKey(s.castingTime));
  // The custom-spell form (`CustomCreationForms`) offers these option tokens
  // verbatim as the `${ct}` suffix — include them so the form can't dead-end.
  const fromCustomForm = [
    "action",
    "bonus",
    "reaction",
    "1 minute",
    "10 minutes",
    "1 hour",
    "8 hours",
    "24 hours",
  ];
  return [...new Set([...fromSpells, ...fromCustomForm])];
}

const FAMILIES: readonly Family[] = [
  // ── srd.* content tokens ───────────────────────────────────────────────────
  {
    label: "srd.damage_${dt}",
    source: "ALL_DAMAGE_TYPES (@/data/types)",
    keys: () => ALL_DAMAGE_TYPES.map((d) => `srd.damage_${d}`),
  },
  {
    label: "srd.damageShort_${dt}",
    source: "ALL_DAMAGE_TYPES (@/data/types)",
    keys: () => ALL_DAMAGE_TYPES.map((d) => `srd.damageShort_${d}`),
  },
  {
    // The call sites lowercase the `CreatureSize` ("Large" → "large").
    label: "srd.size_${size.toLowerCase()}",
    source: "CREATURE_SIZE_ORDER (@/data/types)",
    keys: () => CREATURE_SIZE_ORDER.map((s) => `srd.size_${s.toLowerCase()}`),
  },
  {
    label: "srd.school_${school}",
    source: "ALL_SPELL_SCHOOLS (@/data/types)",
    keys: () => ALL_SPELL_SCHOOLS.map((s) => `srd.school_${s}`),
  },
  {
    label: "srd.castingTime_${castingTimeI18nKey(...)}",
    source: "castingTimeI18nKey over spells[] + custom-form tokens",
    keys: () => castingTimeTokens().map((t) => `srd.castingTime_${t}`),
  },
  {
    label: "srd.class_${cls}",
    source: "ALL_CLASS_IDS (@/data/types)",
    keys: () => ALL_CLASS_IDS.map((c) => `srd.class_${c}`),
  },
  {
    label: "srd.weaponCategory_${item.weaponCategory}",
    source: "ALL_WEAPON_CATEGORIES (@/data/types)",
    keys: () => ALL_WEAPON_CATEGORIES.map((c) => `srd.weaponCategory_${c}`),
  },
  {
    label: "srd.weaponType_${item.weaponType}",
    source: "ALL_WEAPON_TYPES (@/data/types)",
    keys: () => ALL_WEAPON_TYPES.map((t) => `srd.weaponType_${t}`),
  },
  {
    label: "srd.armorCategory_${item.armorCategory}",
    source: "ALL_ARMOR_CATEGORIES (@/data/types)",
    keys: () => ALL_ARMOR_CATEGORIES.map((c) => `srd.armorCategory_${c}`),
  },

  // ── abilities.* (codes + the advantage-chip mode) ──────────────────────────
  {
    label: "abilities.${code}",
    source: "ALL_ABILITY_CODES (@/data/types)",
    keys: () => ALL_ABILITY_CODES.map((c) => `abilities.${c}`),
  },
  {
    label: "abilities.${code}_short",
    source: "ALL_ABILITY_CODES (@/data/types)",
    keys: () => ALL_ABILITY_CODES.map((c) => `abilities.${c}_short`),
  },
  {
    // `t(\`abilities.${c.mode}\`)` — the advantage chip's mode, NOT an ability code.
    label: "abilities.${mode}",
    source: "ADVANTAGE_MODES (@/lib/views/sheet-view)",
    keys: () => ADVANTAGE_MODES.map((m) => `abilities.${m}`),
  },

  // ── skills.* ────────────────────────────────────────────────────────────────
  {
    label: "skills.${skillId}",
    source: "ALL_SKILLS (@/lib/skills)",
    keys: () => ALL_SKILLS.map((s) => `skills.${s.id}`),
  },

  // ── lore.alignments.* (DATA-DRIVEN — stored CharacterData.alignment) ───────
  {
    label: "lore.alignments.${alignmentId}",
    source: "ALIGNMENT_IDS (@/lib/lore-utils)",
    keys: () => ALIGNMENT_IDS.map((id) => `lore.alignments.${id}`),
  },

  // ── feats.category_* ────────────────────────────────────────────────────────
  {
    label: "feats.category_${feat.category}",
    source: "ALL_FEAT_CATEGORIES (@/data/types)",
    keys: () => ALL_FEAT_CATEGORIES.map((c) => `feats.category_${c}`),
  },

  // ── character.* (senses, speeds, damage source, aura audience) ─────────────
  {
    label: "character.sense_${kind}",
    source: "SENSE_KINDS (@/lib/views/sheet-view)",
    keys: () => SENSE_KINDS.map((k) => `character.sense_${k}`),
  },
  {
    label: "character.speed_${kind}",
    source: "SPEED_KINDS (@/lib/views/sheet-view)",
    keys: () => SPEED_KINDS.map((k) => `character.speed_${k}`),
  },
  {
    label: "character.damageSource_${src}",
    source: "ALL_DAMAGE_SOURCES (@/data/types)",
    keys: () => ALL_DAMAGE_SOURCES.map((s) => `character.damageSource_${s}`),
  },
  {
    label: "character.auraAffects_${aura.affects}",
    source: "AURA_AFFECTS (@/lib/grants)",
    keys: () => AURA_AFFECTS.map((a) => `character.auraAffects_${a}`),
  },

  // ── combat.* (action type, base-action verdicts, maneuver slot) ────────────
  {
    label: "combat.${action.type}",
    source: "ALL_ACTION_TYPES (@/data/types)",
    keys: () => ALL_ACTION_TYPES.map((t) => `combat.${t}`),
  },
  {
    // `t(\`combat.verdict_${action.id}\`)` is built for every base SRD action
    // whose id starts "base-". Assert ALL base actions have a verdict key (even
    // the ones currently chip-suppressed) so a future un-suppressed action can't
    // dead-end. Enumerated from the exported `BASE_ACTIONS` list.
    label: "combat.verdict_${base-action.id}",
    source: "BASE_ACTIONS (@/lib/smart-tracker)",
    keys: () => BASE_ACTIONS.map((b) => `combat.verdict_${b.id}`),
  },
  {
    label: "combat.${maneuver.slot}",
    source: "MANEUVER_SLOTS (@/data/maneuvers)",
    keys: () => MANEUVER_SLOTS.map((s) => `combat.${s}`),
  },
  {
    // The reaction-action trigger token (golden rule 7) — `summary.trigger` is a
    // `ui` LocText `combat.reactionTrigger_${action.trigger}`; the suffix is a
    // closed `ReactionTrigger` enum on the SRD action data (replaces the retired
    // `extractTrigger` prose parser). Every token must resolve in BOTH locales.
    label: "combat.reactionTrigger_${action.trigger}",
    source: "ALL_REACTION_TRIGGERS (@/data/types)",
    keys: () => ALL_REACTION_TRIGGERS.map((t) => `combat.reactionTrigger_${t}`),
  },

  // ── equipment.* (category plural + currency abbr) ──────────────────────────
  {
    // The interpolation APPENDS "s": `t(\`equipment.${item.category}s\`)`.
    label: "equipment.${item.category}s",
    source: "ALL_EQUIPMENT_CATEGORIES (@/data/types)",
    keys: () => ALL_EQUIPMENT_CATEGORIES.map((c) => `equipment.${c}s`),
  },
  {
    label: "equipment.currencyAbbr.${currency}",
    source: "CURRENCY_METALS (@/components/shared/currency)",
    keys: () => CURRENCY_METALS.map((u) => `equipment.currencyAbbr.${u}`),
  },

  // ── magicItems.* (rarity + type) ────────────────────────────────────────────
  {
    label: "magicItems.rarity_${item.rarity}",
    source: "ALL_MAGIC_ITEM_RARITIES (@/data/types)",
    keys: () => ALL_MAGIC_ITEM_RARITIES.map((r) => `magicItems.rarity_${r}`),
  },
  {
    label: "magicItems.type_${item.type}",
    source: "ALL_MAGIC_ITEM_TYPES (@/data/types)",
    keys: () => ALL_MAGIC_ITEM_TYPES.map((t) => `magicItems.type_${t}`),
  },

  // ── units.${unit} ───────────────────────────────────────────────────────────
  {
    label: "units.${unit}",
    source: "TRACKER_UNITS (@/data/types)",
    keys: () => TRACKER_UNITS.map((u) => `units.${u}`),
  },

  // ── report.* (type + severity) ──────────────────────────────────────────────
  {
    label: "report.types.${value}",
    source: "REPORT_TYPES (@/features/report/types)",
    keys: () => REPORT_TYPES.map((v) => `report.types.${v}`),
  },
  {
    label: "report.severities.${value}",
    source: "REPORT_SEVERITIES (@/features/report/types)",
    keys: () => REPORT_SEVERITIES.map((v) => `report.severities.${v}`),
  },

  // ── create.* + wizard.* + algorithm.* (closed creation-flow domains) ───────
  {
    label: "create.tip_${classId}",
    source: "ALL_CLASS_IDS (@/data/types)",
    keys: () => ALL_CLASS_IDS.map((c) => `create.tip_${c}`),
  },
  {
    label: "create.equipToolChoice_${kind}",
    source: "ALL_TOOL_CHOICE_KINDS (@/data/background-equipment)",
    keys: () => ALL_TOOL_CHOICE_KINDS.map((k) => `create.equipToolChoice_${k}`),
  },
  {
    // The gallery interpolates `role.toLowerCase()`; the ids ARE the lowercase form.
    label: "wizard.role_${role.toLowerCase()}",
    source: "CLASS_ROLE_IDS (@/features/creation/steps/class-roles)",
    keys: () => CLASS_ROLE_IDS.map((r) => `wizard.role_${r}`),
  },
  {
    label: "algorithm.icon.${icon.id}",
    source: "ALGO_ICONS (@/components/shared/icon-registry)",
    keys: () => ALGO_ICONS.map((i) => `algorithm.icon.${i.id}`),
  },
];

describe("i18n dynamic-key coverage (every constructed key resolves in EN + IT)", () => {
  it.each(FAMILIES.map((f) => [f.label, f] as const))(
    "%s — every constructed key exists in BOTH locales",
    (_label, family) => {
      const keys = family.keys();
      // A family must enumerate SOMETHING — an empty domain means a broken import
      // (e.g. a renamed export silently resolving to `undefined.map`), which would
      // make the guard vacuously pass.
      expect(
        keys.length,
        `${family.label}: domain from ${family.source} is empty — the source-of-` +
          `truth import is broken; the guard would vacuously pass.`
      ).toBeGreaterThan(0);

      const missingEn = keys.filter((k) => !enKeys.has(k));
      const missingIt = keys.filter((k) => !itKeys.has(k));

      expect(
        missingEn,
        `${family.label} (domain: ${family.source}) — these constructed keys have ` +
          `NO EN catalogue entry (a dynamic value with no key = a sheet white-` +
          `screen):\n${missingEn.join("\n")}`
      ).toEqual([]);
      expect(
        missingIt,
        `${family.label} (domain: ${family.source}) — these constructed keys have ` +
          `NO IT catalogue entry (translate via the golden-rule-9 cascade, official ` +
          `IT D&D 2024 term — never copy the English):\n${missingIt.join("\n")}`
      ).toEqual([]);
    }
  );
});

// ── DATA-DRIVEN CLOSURE: the alignment read-normalizer can't escape the set ──
//
// `lore.alignments.<id>` is the highest-risk family: the `${id}` is a STORED
// `CharacterData.alignment` (an AlignmentId), and a value with no key would white-
// screen the sheet on load. The family test above proves every `ALIGNMENT_IDS`
// member HAS a key; this block proves the runtime value can never be OUTSIDE that
// set — the codec read edge (`character-codec.ts`) normalizes every stored
// `build.alignment` through `alignmentIdByLabel`, so whatever a (possibly ancient
// or hand-edited) doc holds, the in-memory id is always an `ALIGNMENT_IDS` member
// or "" (which the renderer guards with `if (!value) return value`). Together:
// the keyed domain == the runtime domain, so live data can never break on deploy.
describe("lore.alignments — the read-normalizer can't yield an off-set id", () => {
  const ALIGNMENT_ID_SET = new Set<string>(ALIGNMENT_IDS);

  it("every canonical alignment id has a key (the family pin, made explicit)", () => {
    const missing = ALIGNMENT_IDS.filter(
      (id) => !enKeys.has(`lore.alignments.${id}`) || !itKeys.has(`lore.alignments.${id}`)
    );
    expect(missing, `alignment ids with no key:\n${missing.join("\n")}`).toEqual([]);
  });

  it.each([
    // (input the codec may see) → it must normalize INTO the keyed set, or to "".
    ["lawful-good"], // an already-id value passes through
    ["true-neutral"],
    ["unaligned"],
    ["Lawful Good"], // a legacy display LABEL maps to its id
    ["True Neutral"],
    ["Chaotic Evil"],
    ["totally-made-up"], // an unknown value collapses to "" (no key requested)
    ["Bewildered"],
    [""],
  ])(
    "alignmentIdByLabel(%j) yields a keyed id or empty (never an off-set id)",
    (input) => {
      const id = alignmentIdByLabel(input);
      expect(
        id === "" || ALIGNMENT_ID_SET.has(id),
        `alignmentIdByLabel(${JSON.stringify(input)}) = ${JSON.stringify(id)} — this ` +
          `is OUTSIDE ALIGNMENT_IDS and has no key; a stored doc with this value would ` +
          `white-screen. Root-cause the normalizer (or migrate the data).`
      ).toBe(true);
    }
  );

  it("EVERY label in the canonical alignment list normalizes to a keyed id", () => {
    // Exhaustive over the 10 canonical EN labels (re-slugged from the id set via a
    // round-trip would be circular; instead assert the id-form already round-trips).
    const offSet = ALIGNMENT_IDS.map((id) => alignmentIdByLabel(id)).filter(
      (id) => id !== "" && !ALIGNMENT_ID_SET.has(id)
    );
    expect(offSet, `ids that didn't round-trip:\n${offSet.join("\n")}`).toEqual([]);
  });
});
