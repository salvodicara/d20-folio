/**
 * Dev-only fixture loader — live-test the 6 real team sheets in the local
 * `DEV_BYPASS_AUTH` preview without Firebase.
 *
 * Visit `/characters/team-<role>` (`team-bard`, `team-paladin`…) and the
 * cockpit renders that imported sheet instead of the bundled MOCK. This is the
 * Phase-1 "dev affordance to load the 6 fixtures" — the canonical MOCK stays the
 * single mock (Golden Rule 13); these are test FIXTURES surfaced for verification,
 * never a second mock.
 *
 * Prod-safe: the fixture JSONs load via a LAZY `import.meta.glob`, so they become
 * on-demand chunks that the production build never loads (the only caller is the
 * dead `DEV_BYPASS_AUTH` branch). The character importer is itself dynamically
 * imported, so it stays off the eager bundle.
 */
import type { CharacterDoc } from "@/types/character";
import { applyCombatToSession } from "@/lib/combat-state";
import { packFixtureRoles, packFixtures } from "@pack";

/** Route-id prefix that maps to a team fixture by its role (`team-bard`). */
const DEV_FIXTURE_PREFIX = "team-";

/**
 * The fixture roles (without the prefix), for menus / harnesses. The fixture
 * JSONs and their keys are personal team data, so they live in the content pack
 * (`content-pack/fixtures/team/`) and public code names each by its role only;
 * without the pack there are none.
 */
export const DEV_FIXTURE_NAMES: readonly string[] = Object.keys(packFixtureRoles).sort();

/** The pack fixture key a route id names through its role, or `undefined`. */
function fixtureName(id: string): string | undefined {
  const role = id.startsWith(DEV_FIXTURE_PREFIX)
    ? id.slice(DEV_FIXTURE_PREFIX.length)
    : id;
  return packFixtureRoles[role];
}

/** True when the route id names one of the team fixtures. */
export function isDevFixtureId(id: string): boolean {
  const key = fixtureName(id);
  return key !== undefined && key in packFixtures;
}

/** Import a team fixture into a renderable CharacterDoc, or null if unknown / invalid. */
export async function loadDevFixture(id: string): Promise<CharacterDoc | null> {
  const key = fixtureName(id);
  const loader = key === undefined ? undefined : packFixtures[key];
  if (!loader) return null;
  const raw = await loader();
  const { importCharacter } = await import("@/lib/character-io");
  const res = importCharacter(raw);
  if (!res.success) return null;
  const doc = { id, createdAt: new Date(0), updatedAt: new Date(0), ...res.doc };
  // The fixtures (like every MIGRATED live doc) carry NO combat trio in `state`, and in
  // DEV_BYPASS there is no `combat/state` subdoc to hydrate from — so the parsed session
  // reads HP `current: 0`. Seed the trio to its absent-subdoc DEFAULT (full effective
  // HP) through the SAME pure converter the live hydration uses, so every dev surface
  // (cockpit, member sheet, party card via `resolveDevDoc`) shows full HP, never 0.
  const { effectiveMaxHp } = await import("@/lib/aggregate-character");
  const max = effectiveMaxHp(doc.character, doc.session);
  const { session } = applyCombatToSession(doc.session, null, max);
  return { ...doc, session };
}
