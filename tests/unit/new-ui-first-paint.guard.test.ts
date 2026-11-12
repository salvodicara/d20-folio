/// <reference types="node" />
/**
 * The new UI's frame and character list paint without the rules engine. Every screen
 * of the new UI waits for its frame (`NewAppShell`) to load, so whatever the frame
 * imports statically is downloaded before any screen can draw. A mid-range phone
 * measured on 2026-11-12 (4× CPU, ~1.6 Mbps): the frame alone pulled in about 218 KB
 * gz beyond the eager bundle (the character store, the mechanics engine, the combat
 * tracker) through the fight pip, which only shows during a fight; the list pulled the
 * same engine through the campaign reads it uses for one label. The fight producer
 * (`GlobalCombatMount`) and the pip's fight rows load lazily, the list's campaign
 * read on demand. Only the Play screen needs the engine, and loads it itself.
 * Edges are value imports read from source (`static-import-graph.ts`); `import()` and
 * type-only imports are not edges.
 */
import { describe, expect, it } from "vitest";

import { eagerModules } from "./__helpers__/static-import-graph";

const HEAVY = [
  "src/stores/characterStore.ts",
  "src/lib/mechanics-coordinator.ts",
  "src/lib/smart-tracker.ts",
  "src/features/campaigns/campaign-io.ts",
];

describe.each(["src/app/NewAppShell.tsx", "src/domains/roster/ui/RosterScreen.tsx"])(
  "%s paints without the engine",
  (entry) => {
    const reach = eagerModules(entry);

    it("reads the real graph", () => {
      expect(reach.size).toBeGreaterThan(5);
    });

    it.each(HEAVY)("does not statically reach %s", (module) => {
      const chain = reach.get(module);
      expect(chain, `pulled in by:\n  ${chain?.join("\n  → ")}`).toBeUndefined();
    });
  }
);
