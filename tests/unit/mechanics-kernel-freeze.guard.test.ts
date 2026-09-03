/**
 * The mechanics kernel (`src/lib/mechanics-*.ts`, `src/lib/mechanic-occurrence*.ts`) is legacy
 * on `v2`: it dies at stage 6 with the old play surfaces that read it (ADR-0003, stage-1 plan
 * "Module fates"). Until then it is frozen — this guard pins the exact set of production
 * modules that import it, so a new reader is a deliberate decision, never an accident. New
 * combat work builds on `src/lib/combat`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");
const KERNEL_FILE = /^src\/lib\/(?:mechanics-|mechanic-occurrence)/;
// Every static import/re-export and dynamic import specifier, by any spelling.
const SPECIFIER = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

/** Resolve a specifier from `file` to a repo-relative path, or null for packages. */
function resolveSpecifier(file: string, spec: string): string | null {
  if (spec.startsWith("@/")) return `src/${spec.slice(2)}`;
  if (spec.startsWith(".")) return relative(ROOT, resolve(join(ROOT, file), "..", spec));
  return null;
}

function importsKernel(file: string): boolean {
  const source = readFileSync(join(ROOT, file), "utf8");
  for (const match of source.matchAll(SPECIFIER)) {
    const target = resolveSpecifier(file, match[1] ?? "");
    if (target !== null && KERNEL_FILE.test(target)) return true;
  }
  return false;
}

/** Production readers of the kernel outside the kernel itself (sorted). Shrinks only. */
const FROZEN_READERS: readonly string[] = [
  "src/features/campaigns/party-world-lease.ts",
  "src/features/character/center/solo-world-turn.ts",
  "src/features/character/center/tabs/EngineActionFlow.tsx",
  "src/features/character/center/tabs/PlayTab.tsx",
  "src/features/character/center/tabs/spells/EngineCastFlow.tsx",
  "src/features/character/center/tabs/spells/EngineConsumablesStrip.tsx",
  "src/features/character/center/tabs/spells/EnginePulseStrip.tsx",
  "src/features/character/center/tabs/spells/engine-spell-gate.ts",
  "src/features/character/engine-undo.ts",
  "src/features/character/molecules/ResourceConversions.tsx",
  "src/features/character/rest-world-boundary.ts",
  "src/features/character/useMechanicsCast.ts",
  "src/features/character/useMechanicsPulse.ts",
  "src/lib/action-journal.ts",
  "src/lib/automation-compiler.ts",
  "src/lib/condition-projection.ts",
  "src/lib/condition.ts",
  "src/lib/d20-test.ts",
  "src/lib/damage-reaction.ts",
  "src/lib/damage.ts",
  "src/lib/encounter-world-store.ts",
  "src/lib/material-state.ts",
  "src/lib/resources.ts",
  "src/lib/views/tracker-view.ts",
  "src/lib/vitals.ts",
  "src/stores/characterStore.ts",
  "src/types/mechanic-occurrence.ts",
  "src/types/mechanics-authority-ref.ts",
  "src/types/mechanics-authority.ts",
  "src/types/mechanics-capability.ts",
  "src/types/mechanics-command.ts",
  "src/types/mechanics-operation.ts",
  "src/types/mechanics-program-authoring.ts",
  "src/types/mechanics-program-receipt.ts",
  "src/types/mechanics-program.ts",
  "src/types/mechanics-reference.ts",
  "src/types/mechanics-trigger.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("mechanics kernel — frozen until stage 6", () => {
  it("has exactly the pinned production readers", () => {
    const readers = walk(SRC)
      .map((file) => relative(ROOT, file))
      .filter((file) => !KERNEL_FILE.test(file))
      .filter(importsKernel)
      .sort();
    expect(
      readers,
      "the mechanics kernel dies at stage 6; build on src/lib/combat instead of importing it"
    ).toEqual([...FROZEN_READERS]);
  });
});
