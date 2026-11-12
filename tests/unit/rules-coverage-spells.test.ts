/**
 * The spell coverage rule (`__helpers__/rules-coverage.ts`) counts the engine-owned
 * spells as 1-tap; each id it names must be a public spell. The counts themselves are
 * rendered by `pnpm rules:coverage`, not pinned in a committed doc.
 */
import { describe, expect, it } from "vitest";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL8 } from "@/data/spells/level8";
import { SRD_SPELLS_LEVEL9 } from "@/data/spells/level9";
import { ENGINE_OWNED_SPELLS as ENGINE_OWNED } from "./__helpers__/rules-coverage";

describe("the spell coverage rule", () => {
  it("every engine-owned id names a public spell", () => {
    const ids = new Set(
      SRD_SPELLS_LEVEL9.concat(SRD_SPELLS_LEVEL8, SRD_SPELLS_LEVEL1).map((s) => s.id)
    );
    for (const id of ENGINE_OWNED) expect(ids.has(id), id).toBe(true);
  });
});
