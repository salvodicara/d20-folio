/**
 * realm-memory — the tab-stack "return to where you were" for the three realm
 * indexes (Characters / Campaigns / Compendium).
 *
 * The realm tabs (topbar + mobile bottom nav) point at the bare index path. But
 * an index can carry view state in its query — the compendium's `?type` (which
 * codex category you were reading). This records the LAST query each index route
 * was visited with, so the tab returns you to that category, not the default.
 * (Deeper drill-down routes — a character sheet, a campaign hub — are NOT
 * recorded: a realm tab always lands on the index, never mid-drill-down.)
 *
 * Window scroll is handled separately (ScrollRestorer — every fresh PUSH lands
 * at the top); this only carries the query so the restored URL is complete.
 */

/** The realm index routes whose tabs remember their last-seen query. */
export const REALM_PATHS = new Set(["/characters", "/campaigns", "/compendium"]);

const lastQuery = new Map<string, string>();

/** Record the query an index route was last seen with (index routes only).
 *  Only the durable view is remembered — the compendium's open entry (`sel`)
 *  and seeded search (`q`) are transient reading state, so a realm-tab click
 *  lands on a fresh index (the last `?type` codex category), never reopening the
 *  last entry or resurrecting a stale search. */
export function recordRealmVisit(pathname: string, search: string): void {
  if (!REALM_PATHS.has(pathname)) return;
  const params = new URLSearchParams(search);
  params.delete("sel");
  params.delete("q");
  const query = params.toString();
  lastQuery.set(pathname, query ? `?${query}` : "");
}

/** The `to` a realm tab should use: the index plus its last-seen query. */
export function realmTarget(realmPath: string): string {
  return realmPath + (lastQuery.get(realmPath) ?? "");
}
