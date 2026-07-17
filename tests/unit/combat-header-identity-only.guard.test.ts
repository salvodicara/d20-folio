/// <reference types="node" />
/**
 * Guard (TB5): the cockpit's `CombatHeader` is PURE identity + the reference-vitals
 * strip — it must NEVER import a combat-SESSION control. Combat controls belong WITH
 * the combat economy on the Play tab (golden rule 6 — controls live with what they
 * change; never scatter or duplicate a control), so the live round, the roll-to-total
 * initiative ENTRY, the your-turn cue, and the campaign turn-advance render beside the
 * turn meter ({@link ThisTurnTracker} + {@link InCombatStatus}), never in the identity
 * band. The header keeps only the 5 REFERENCE vitals (HP · AC · Init-BONUS · Speed · PB)
 * as `StatBadge` tiles — the Init tile is the DERIVED bonus (a reference stat like AC/PB),
 * not a roll/round/turn control.
 *
 * This pins that boundary at SOURCE level so the clutter can't creep back: `CombatHeader.tsx`
 * is forbidden from importing —
 *   • `@/features/campaigns/in-combat-chip`        (InCombatStatus — the in-combat region)
 *   • `@/features/campaigns/party-encounter`       (InitVital roll entry · EncounterTurnControls)
 *   • `@/features/campaigns/global-combat-context`  } the shell-level live combat status
 *   • `@/features/campaigns/global-combat`          } store/context + its producer
 *   • `@/features/campaigns/campaign-io`           (advanceEncounterTurn — shared turn-advance)
 *   • `@/stores/combatStore`                       (the combat-session turn store)
 *
 * Every import is resolved (alias OR relative) so the boundary can't be spelled around —
 * mirroring `architecture-direction.guard`.
 */
import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { SRC_ROOT as SRC, readSrc } from "./__helpers__/src-files";

const HEADER = join(SRC, "features", "character", "center", "CombatHeader.tsx");

/** The combat-SESSION modules the identity header must never reach. */
const FORBIDDEN = [
  join(SRC, "features", "campaigns", "in-combat-chip.tsx"),
  join(SRC, "features", "campaigns", "party-encounter.tsx"),
  join(SRC, "features", "campaigns", "global-combat-context.ts"),
  join(SRC, "features", "campaigns", "global-combat.tsx"),
  join(SRC, "features", "campaigns", "campaign-io.ts"),
  join(SRC, "stores", "combatStore.ts"),
];

/** Every `from "…"` / `import("…")` specifier in a source file. */
function importSpecs(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[1]) specs.push(m[1]);
  }
  return specs;
}

/** Resolve an import spec from `fromFile` to an absolute source path (or null for a
 *  bare node_modules specifier). Mirrors `architecture-direction.guard`. */
function resolveImport(fromFile: string, spec: string): string | null {
  let target: string;
  if (spec.startsWith("@/")) target = join(SRC, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../"))
    target = resolve(dirname(fromFile), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(target + ext) && statSync(target + ext).isFile()) return target + ext;
  }
  return target;
}

describe("CombatHeader stays identity-only — no combat-session control imports (TB5, golden rule 6)", () => {
  it("CombatHeader.tsx imports none of the in-combat / turn / initiative-entry modules", () => {
    const forbidden = new Set(FORBIDDEN);
    const source = readSrc(HEADER);
    const offenders: string[] = [];
    for (const spec of importSpecs(source)) {
      const resolved = resolveImport(HEADER, spec);
      if (resolved && forbidden.has(resolved)) offenders.push(`import "${spec}"`);
    }
    expect(
      offenders,
      `CombatHeader.tsx must stay PURE identity + the reference-vitals strip. A combat-` +
        `SESSION control (round / initiative ENTRY / your-turn cue / turn-advance / the ` +
        `combat store) belongs WITH the combat economy on the Play tab (ThisTurnTracker + ` +
        `InCombatStatus), not in the identity header (golden rule 6). Move the control ` +
        `beside the turn meter — never import it here.`
    ).toEqual([]);
  });
});
