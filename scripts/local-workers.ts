/**
 * How many test workers a LOCAL run may use (owner rule, 2026-11-05: the owner works on
 * this Mac while agents test, so a local suite must never take every core). Vitest's
 * `maxWorkers` and Playwright's `workers` read it. `FOLIO_LOCAL_WORKERS` overrides the
 * default of 3; on CI (`CI` set) it returns `undefined` so CI keeps its own settings.
 */
export function localWorkers(): number | undefined {
  if (process.env.CI) return undefined;
  const requested = Number(process.env.FOLIO_LOCAL_WORKERS);
  return Number.isInteger(requested) && requested > 0 ? requested : 3;
}
