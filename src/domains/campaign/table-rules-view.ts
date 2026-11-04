/**
 * The campaign's «Regole» tab (approved mock, 2026-11-04): every table rule with what
 * RAW does, its choices, and whether the table changed it. The DM edits it, players
 * read what differs. A change stores only what differs from RAW (`withRule`), so going
 * back to RAW leaves nothing behind. The rules themselves are the engine's
 * (`lib/table-rules`); this only lays them out.
 */
import {
  effectiveTableRules,
  RAW_TABLE_RULES,
  type TableRules,
  type TableRulesOverrides,
} from "@/lib/table-rules";

export type RulePath = readonly [string] | readonly [string, string];

export type TableRuleRow =
  | {
      kind: "choice";
      id: string;
      path: RulePath;
      choices: readonly (string | boolean)[];
      current: string | boolean;
      raw: boolean;
    }
  | {
      kind: "numbers";
      id: string;
      fields: { path: RulePath; value: number; min: number; max: number }[];
      raw: boolean;
    }
  | {
      kind: "toggles";
      id: string;
      toggles: { path: RulePath; on: boolean }[];
      raw: boolean;
    };

export interface TableRulesView {
  groups: { id: "combat" | "rest" | "items" | "optional"; rows: TableRuleRow[] }[];
  /** How many rules the table changed. */
  changed: number;
}

const read = (rules: TableRules, path: RulePath): unknown =>
  path.length === 1
    ? rules[path[0] as keyof TableRules]
    : (rules[path[0] as keyof TableRules] as unknown as Record<string, unknown>)[path[1]];

export function tableRulesView(overrides: TableRulesOverrides): TableRulesView {
  const rules = effectiveTableRules({ tableRules: overrides });
  const isRaw = (path: RulePath) => read(rules, path) === read(RAW_TABLE_RULES, path);
  const choice = (
    id: string,
    path: RulePath,
    choices: readonly (string | boolean)[]
  ): TableRuleRow => ({
    kind: "choice",
    id,
    path,
    choices,
    current: read(rules, path) as string | boolean,
    raw: isRaw(path),
  });
  const numbers = (
    id: string,
    fields: { path: RulePath; min: number; max: number }[]
  ): TableRuleRow => ({
    kind: "numbers",
    id,
    fields: fields.map((f) => ({ ...f, value: read(rules, f.path) as number })),
    raw: fields.every((f) => isRaw(f.path)),
  });
  const toggles = (id: string, paths: RulePath[]): TableRuleRow => ({
    kind: "toggles",
    id,
    toggles: paths.map((path) => ({ path, on: read(rules, path) === true })),
    raw: paths.every(isRaw),
  });
  const groups: TableRulesView["groups"] = [
    {
      id: "combat",
      rows: [
        choice("flanking", ["flanking"], ["off", "advantage", "plus-2"]),
        choice("nat1", ["nat1", "checks"], ["none", "fail"]),
        choice("fumbles", ["fumbles"], [false, true]),
        numbers("deathSaves", [
          { path: ["deathSaves", "successes"], min: 1, max: 10 },
          { path: ["deathSaves", "failures"], min: 1, max: 10 },
        ]),
      ],
    },
    {
      id: "rest",
      rows: [
        numbers("rest", [
          { path: ["rest", "shortMinutes"], min: 1, max: 24 * 60 },
          { path: ["rest", "longMinutes"], min: 1, max: 7 * 24 * 60 },
        ]),
        numbers("exhaustion", [
          { path: ["exhaustion", "maxLevel"], min: 1, max: 6 },
          { path: ["exhaustion", "d20PerLevel"], min: -10, max: 0 },
          { path: ["exhaustion", "speedFtPerLevel"], min: -30, max: 0 },
        ]),
      ],
    },
    {
      id: "items",
      rows: [
        choice("potionsDrink", ["potions", "drink"], ["bonus", "action"]),
        choice("potionsAdminister", ["potions", "administer"], ["bonus", "action"]),
        choice("familiarsAttack", ["familiarsAttack"], [false, true]),
        choice("hide", ["hide"], ["raw", "table"]),
      ],
    },
    {
      id: "optional",
      rows: [
        toggles("points", [["heroPoints"], ["plotPoints"]]),
        toggles("systems", [
          ["bastions"],
          ["circleMagic"],
          ["factions"],
          ["evolvingItems"],
        ]),
      ],
    },
  ];
  return {
    groups,
    changed: groups.flatMap((g) => g.rows).filter((r) => !r.raw).length,
  };
}

/** The overrides with `path` set to `value`; a value equal to RAW is dropped, and an
 *  emptied group with it. */
export function withRule(
  overrides: TableRulesOverrides,
  path: RulePath,
  value: unknown
): TableRulesOverrides {
  const isRaw = value === read(RAW_TABLE_RULES, path);
  const entries = Object.entries(overrides as Record<string, unknown>);
  const without = (key: string) => entries.filter(([k]) => k !== key);
  if (path.length === 1) {
    const [key] = path;
    return Object.fromEntries(isRaw ? without(key) : [...without(key), [key, value]]);
  }
  const [group, field] = path;
  const fields = Object.entries(
    ((overrides as Record<string, unknown>)[group] as
      | Record<string, unknown>
      | undefined) ?? {}
  ).filter(([k]) => k !== field);
  const nextFields = isRaw ? fields : [...fields, [field, value] as const];
  return Object.fromEntries(
    nextFields.length === 0
      ? without(group)
      : [...without(group), [group, Object.fromEntries(nextFields)]]
  );
}
