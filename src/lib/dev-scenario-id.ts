/**
 * Cheap, eager-bundle-safe dev-scenario id helpers. The route-prefix + a
 * prefix-only predicate that gate the LAZY `dev-scenarios.ts` builder WITHOUT
 * pulling its ~800-line scenario registry (and the engine it imports) onto the
 * eager bundle. The precise registry-membership check + the builder live in
 * `dev-scenarios.ts`, reached via `import()` only under the dead `DEV_BYPASS_AUTH`
 * branch — mirroring how `dev-fixtures.ts` keeps its loader lazy.
 */

/** Route-id prefix that maps to a built scenario, e.g. `scn-life-cleric`. */
export const DEV_SCENARIO_PREFIX = "scn-";

/**
 * Cheap pre-check (no heavy import): does this route id look like a dev-scenario
 * id? An unknown `scn-…` resolves to null in `buildDevScenario` and falls back to
 * the MOCK, so a prefix match is enough to take the lazy scenario path.
 */
export function isDevScenarioRouteId(id: string): boolean {
  return id.startsWith(DEV_SCENARIO_PREFIX);
}
