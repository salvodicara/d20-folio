/**
 * Table rules (edge-case family M16, docs/architecture/2026-11-edge-cases.md):
 * the few rules a campaign may vary. RAW 2024 is the default and a solo sheet
 * always plays RAW. Pure functions that use one of these take an explicit
 * `rules: TableRules = RAW_TABLE_RULES` argument; nothing reads them globally.
 * Which variants players can pick is a product choice made with the screen.
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
    maxLevel: positiveInt,
    d20PerLevel: nonPositiveInt,
    speedFtPerLevel: nonPositiveInt,
  },
  deathSaves: { successes: positiveInt, failures: positiveInt },
  potions: { drink: slot, administer: slot },
} as const;
const SCALARS = { flanking, fumbles: bool, familiarsAttack: bool } as const;

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
  };
}
