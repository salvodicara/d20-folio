/**
 * Pack-fixture identity derivation for the fixture-bound e2e specs.
 *
 * A handful of specs drive the live team fixtures (`/characters/team-<role>`)
 * and assert the rendered character NAME. Those names are personal data living
 * in the private content pack, so no name literal ships in the public tree:
 * the expected strings are derived at runtime from the pack fixture JSON, and
 * the consuming specs `test.skip()` themselves when the pack is absent (the
 * public SRD-only snapshot has neither the fixture nor the route content).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEAM_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../content-pack/fixtures/team"
);

/** The pack fixture file for a team role (`bard`), or null when the pack is absent.
 *  The fixture keys are personal data, so public specs name a fixture by role. */
export function teamFixtureFile(role: string): string | null {
  const manifest = resolve(TEAM_DIR, "../team-roles.json");
  if (!existsSync(manifest)) return null;
  const key = (JSON.parse(readFileSync(manifest, "utf8")) as Record<string, string>)[
    role
  ];
  return key ? resolve(TEAM_DIR, `${key}.json`) : null;
}

/** The role's stored character name, or null when the pack is absent. */
export function teamFixtureName(role: string): string | null {
  const file = teamFixtureFile(role);
  if (!file || !existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    build?: { name?: string };
  };
  return parsed.build?.name ?? null;
}

/** The name's first word (the short-form locator several specs anchor on). */
export function firstWord(name: string | null): string {
  return name?.split(" ")[0] ?? "";
}
