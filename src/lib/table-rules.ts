/**
 * Table rules (edge-case family M16, docs/architecture/2026-11-edge-cases.md):
 * the few rules a campaign may vary. RAW 2024 is the default and a solo sheet
 * always plays RAW. Pure functions that use one of these take an explicit
 * `rules: TableRules = RAW_TABLE_RULES` argument; nothing reads them globally.
 * Which variants players can pick is a product choice made with the screen.
 *
 * Exhaustion: a table may change the penalty per level and end the track sooner
 * (death at its `maxLevel`). Levels above 6 are not supported: the stored world knows
 * Exhaustion 0–6 (6 is death), so a longer track would need a stored-schema change.
 * The 2014-style track (six levels, different effects) fits within 0–6.
 */

export interface TableRules {
  readonly rest: { readonly shortMinutes: number; readonly longMinutes: number };
  readonly exhaustion: {
    readonly maxLevel: number;
    readonly d20PerLevel: number;
    readonly speedFtPerLevel: number;
  };
  readonly deathSaves: { readonly successes: number; readonly failures: number };
  readonly potions: {
    readonly drink: "action" | "bonus";
    readonly administer: "action" | "bonus";
  };
  readonly flanking: "off" | "advantage" | "plus-2";
  /** A natural 1 on an attack also gets a fumble note. */
  readonly fumbles: boolean;
  readonly familiarsAttack: boolean;
  /** What a natural 1 does. RAW 2024: nothing special on a check or save; an attack
   *  roll misses. A table may rule that a 1 fails a check too. */
  readonly nat1: { readonly checks: "none" | "fail"; readonly attacks: "miss" };
  /** The Hide / Invisible model: RAW 2024, or the table's own ruling. */
  readonly hide: "raw" | "table";
  /** Hero / plot points (dropped from the 2024 DMG): off unless the table adds them. */
  readonly heroPoints: boolean;
  readonly plotPoints: boolean;
  /** Optional systems the 2024 books offer, off until the table switches them on. */
  readonly bastions: boolean;
  readonly circleMagic: boolean;
  readonly factions: boolean;
  readonly evolvingItems: boolean;
}

type Overrides = {
  -readonly [K in keyof TableRules]?: TableRules[K] extends object
    ? { -readonly [F in keyof TableRules[K]]?: TableRules[K][F] }
    : TableRules[K];
};
export type TableRulesOverrides = Overrides;

function deepFreeze<T extends object>(value: T): T {
  for (const v of Object.values(value)) if (typeof v === "object" && v) deepFreeze(v);
  return Object.freeze(value);
}

export const RAW_TABLE_RULES: TableRules = deepFreeze({
  rest: { shortMinutes: 60, longMinutes: 8 * 60 },
  exhaustion: { maxLevel: 6, d20PerLevel: -2, speedFtPerLevel: -5 },
  deathSaves: { successes: 3, failures: 3 },
  potions: { drink: "bonus", administer: "bonus" },
  flanking: "off",
  fumbles: false,
  familiarsAttack: false,
  nat1: { checks: "none", attacks: "miss" },
  hide: "raw",
  heroPoints: false,
  plotPoints: false,
  bastions: false,
  circleMagic: false,
  factions: false,
  evolvingItems: false,
});

const positiveInt = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) > 0;
const nonPositiveInt = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) <= 0;
const slot = (v: unknown): v is "action" | "bonus" => v === "action" || v === "bonus";
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const flanking = (v: unknown): v is TableRules["flanking"] =>
  v === "off" || v === "advantage" || v === "plus-2";

const GROUPS = {
  rest: { shortMinutes: positiveInt, longMinutes: positiveInt },
  exhaustion: {
    // At most 6: the stored world knows Exhaustion 0–6 (6 is death). A table can make
    // death come sooner; a longer track needs a stored-schema change first.
    maxLevel: (v: unknown): v is number => positiveInt(v) && v <= 6,
    d20PerLevel: nonPositiveInt,
    speedFtPerLevel: nonPositiveInt,
  },
  deathSaves: { successes: positiveInt, failures: positiveInt },
  potions: { drink: slot, administer: slot },
  nat1: {
    checks: (v: unknown): v is "none" | "fail" => v === "none" || v === "fail",
    attacks: (v: unknown): v is "miss" => v === "miss",
  },
} as const;
const SCALARS = {
  flanking,
  fumbles: bool,
  familiarsAttack: bool,
  hide: (v: unknown): v is TableRules["hide"] => v === "raw" || v === "table",
  heroPoints: bool,
  plotPoints: bool,
  bastions: bool,
  circleMagic: bool,
  factions: bool,
  evolvingItems: bool,
} as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The stored table rules, field by field: anything unknown or invalid is dropped. */
export function conformTableRules(raw: unknown): TableRulesOverrides {
  if (!isRecord(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [group, fields] of Object.entries(GROUPS)) {
    const value = raw[group];
    if (!isRecord(value)) continue;
    const kept: Record<string, unknown> = {};
    for (const [field, valid] of Object.entries(fields)) {
      if ((valid as (v: unknown) => boolean)(value[field])) kept[field] = value[field];
    }
    if (Object.keys(kept).length > 0) out[group] = kept;
  }
  for (const [key, valid] of Object.entries(SCALARS)) {
    if ((valid as (v: unknown) => boolean)(raw[key])) out[key] = raw[key];
  }
  return out;
}

/** A campaign's table rules merged over RAW; RAW when there is no campaign. */
export function effectiveTableRules(
  campaign: { tableRules?: TableRulesOverrides } | null
): TableRules {
  const o = campaign?.tableRules ?? {};
  return {
    rest: { ...RAW_TABLE_RULES.rest, ...o.rest },
    exhaustion: { ...RAW_TABLE_RULES.exhaustion, ...o.exhaustion },
    deathSaves: { ...RAW_TABLE_RULES.deathSaves, ...o.deathSaves },
    potions: { ...RAW_TABLE_RULES.potions, ...o.potions },
    flanking: o.flanking ?? RAW_TABLE_RULES.flanking,
    fumbles: o.fumbles ?? RAW_TABLE_RULES.fumbles,
    familiarsAttack: o.familiarsAttack ?? RAW_TABLE_RULES.familiarsAttack,
    nat1: { ...RAW_TABLE_RULES.nat1, ...o.nat1 },
    hide: o.hide ?? RAW_TABLE_RULES.hide,
    heroPoints: o.heroPoints ?? RAW_TABLE_RULES.heroPoints,
    plotPoints: o.plotPoints ?? RAW_TABLE_RULES.plotPoints,
    bastions: o.bastions ?? RAW_TABLE_RULES.bastions,
    circleMagic: o.circleMagic ?? RAW_TABLE_RULES.circleMagic,
    factions: o.factions ?? RAW_TABLE_RULES.factions,
    evolvingItems: o.evolvingItems ?? RAW_TABLE_RULES.evolvingItems,
  };
}
