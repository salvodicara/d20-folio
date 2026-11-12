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
import { packFixtures } from "@pack";
import { assertNonEmptyString } from "@/lib/non-empty-string";

/** Route-id prefix that maps to a team fixture by its role (`team-bard`). */
const DEV_FIXTURE_PREFIX = "team-";

/** The pack lists each fixture a second time under `role:<role>` (`role:bard`). */
const ROLE_KEY = "role:";

/**
 * The fixture roles (without the prefix), for menus / harnesses. The fixture
 * JSONs and their keys are personal team data, so they live in the content pack
 * (`content-pack/fixtures/team/`) and public code names each by its role only;
 * without the pack there are none.
 */
export const DEV_FIXTURE_NAMES: readonly string[] = Object.keys(packFixtures)
  .filter((key) => key.startsWith(ROLE_KEY))
  .map((key) => key.slice(ROLE_KEY.length))
  .sort();

/** The pack key a route id names through its role (`team-bard` → `role:bard`). */
function fixtureName(id: string): string {
  const role = id.startsWith(DEV_FIXTURE_PREFIX)
    ? id.slice(DEV_FIXTURE_PREFIX.length)
    : id;
  return `${ROLE_KEY}${role}`;
}

/**
 * The made-up name each role's sheet shows in dev. The fixtures are real players'
 * characters, and the dev screens reach every screenshot a session takes, so a live
 * character's name never shows (owner, 2026-11-12). The bard and the paladin keep the
 * names the dev campaign's member snapshots already use for them.
 */
export const DEV_HERO_NAMES: Readonly<Record<string, string>> = {
  barbarian: "Torva Rocciadura",
  bard: "Coralino di Sanvaldo",
  monk: "Kai Ventoquieto",
  paladin: "Bren Ironbeard of the Thunderhold",
  rogue: "Nessa Mezzanotte",
  wizard: "Ilario Lumevera",
};

/** True when the route id names one of the team fixtures. */
export function isDevFixtureId(id: string): boolean {
  return fixtureName(id) in packFixtures;
}

/** Import a team fixture into a renderable CharacterDoc, or null if unknown / invalid. */
export async function loadDevFixture(id: string): Promise<CharacterDoc | null> {
  const loader = packFixtures[fixtureName(id)];
  if (!loader) return null;
  const raw = await loader();
  const { importCharacter } = await import("@/lib/character-io");
  const res = importCharacter(raw);
  if (!res.success) return null;
  const role = fixtureName(id).slice(ROLE_KEY.length);
  const name = DEV_HERO_NAMES[role];
  const doc = {
    id,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...res.doc,
    character: {
      ...res.doc.character,
      ...(name ? { name: assertNonEmptyString(name) } : {}),
    },
  };
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
