/// <reference types="node" />
/**
 * Modules that stay off first paint. Each was cut out of the eager closure the
 * bundle budget measures (`src/main.tsx` plus everything it statically imports),
 * and this pins it out, naming the chain that brought it back, long before the
 * bundle budget turns red. Two things put a module on first paint:
 *
 *  - a static import chain from the entry. The graph is read from source
 *    (`static-import-graph.ts`): value imports and re-exports are edges,
 *    `import()` and type-only imports are not;
 *  - a `manualChunks` bucket in `vite.config.ts` it shares with eager modules:
 *    the bucket ships whole, so a lazy module forced into it downloads at start.
 *    These modules fall to the bundler's default split instead.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import viteConfig from "../../vite.config";
import { eagerModules, REPO_ROOT } from "./__helpers__/static-import-graph";

const OFF_FIRST_PAINT: { module: string; why: string }[] = [
  {
    module: "src/lib/views/tracker-view.ts",
    why: "the cockpit tracker presenters; the undo toasts only need the concentration label",
  },
  {
    module: "src/lib/smart-tracker.ts",
    why: "the combat engine; only the character sheet needs it",
  },
  {
    module: "src/lib/views/combat-action-view.ts",
    why: "the combat action presenters; only the character sheet needs them",
  },
  {
    module: "src/lib/aggregate-character.ts",
    why: "the grant-aware AC/HP engine; the roster reads the stored cache, and the save path loads the cache builder on demand",
  },
];

type ManualChunks = (id: string) => string | undefined;
// Read through our own shape: the config still uses the Rollup-named options.
const build = viteConfig.build as
  | { rollupOptions?: { output?: { manualChunks?: ManualChunks } } }
  | undefined;
const manualChunks = build?.rollupOptions?.output?.manualChunks;

describe("first paint stays lean", () => {
  const eager = eagerModules();

  it("reads the real graph and the real chunking", () => {
    expect(eager.has("src/app/router.tsx")).toBe(true);
    expect(eager.size).toBeGreaterThan(100);
    expect(typeof manualChunks).toBe("function");
  });

  it.each(OFF_FIRST_PAINT)("$module is not statically reachable", ({ module }) => {
    const chain = eager.get(module);
    expect(chain, `pulled in by:\n  ${chain?.join("\n  → ")}`).toBeUndefined();
  });

  it.each(OFF_FIRST_PAINT)("$module is in no forced chunk", ({ module }) => {
    expect(manualChunks?.(join(REPO_ROOT, module))).toBeUndefined();
  });
});
