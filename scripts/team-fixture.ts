/**
 * A team fixture's file by its neutral role (`bard`). The fixtures and their file
 * names are personal data in the private pack (`content-pack/fixtures/team/`), so the
 * public scripts name each by role and the pack's `team-roles.json` maps it.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

/** The fixture file for `role` under `root`, or null when the pack is absent. */
export function teamFixturePath(root: string, role: string): string | null {
  const manifest = resolvePath(root, "content-pack", "fixtures", "team-roles.json");
  if (!existsSync(manifest)) return null;
  const key = (JSON.parse(readFileSync(manifest, "utf8")) as Record<string, string>)[
    role
  ];
  return key
    ? resolvePath(root, "content-pack", "fixtures", "team", `${key}.json`)
    : null;
}
