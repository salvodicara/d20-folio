/**
 * Automation-coverage guard — the OBJECTIVE "everything automatable is automated"
 * check, self-enforcing (replaces the hand-maintained, drift-prone coverage doc).
 *
 * Every PUBLIC (SRD) class feature must be ONE of:
 *   1. AUTOMATED — carries `grants` and/or `mechanics` (the engine models it); or
 *   2. SYSTEM-HANDLED — a marker feature whose effect a dedicated subsystem owns
 *      (spellcasting / ASI / weapon-mastery / metamagic / subclass expanded-spells
 *      / fighting-style chooser), matched by `SYSTEM_HANDLED`; or
 *   3. a DELIBERATE RESIDUAL — listed below with the reason it isn't a grant
 *      (situational per-turn/per-cast choices, defensive save/attack-outcome
 *      modifiers, combat geometry, ribbons) — prose by design per
 *      docs/MECHANICS.md §A–G.
 *
 * A NEW public feature therefore fails CI unless it's automated, system-handled,
 * or consciously added here as a residual — so coverage can only go UP, never
 * silently regress. This guard scopes itself to the PUBLIC corpus by subtracting
 * whatever the `@pack` composition contributed (the typed-empty stub in SRD-only
 * mode), so it asserts the SAME facts in both build modes; the pack corpus has
 * its own ledger + ratchet in
 * `content-pack/tests/unit/automation-coverage.guard.pack.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_RACES } from "@/data/races";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { packClassFeatures, packFeats, packRaces, packMagicItems } from "@pack";
import {
  FEAT_SYSTEM_HANDLED,
  isAutomated,
  SYSTEM_HANDLED,
} from "./__helpers__/automation-coverage";

// ── The public corpus: everything the composition did NOT get from the pack ──
const packFeatureIds = new Set(packClassFeatures.map((f) => f.id));
const packFeatIds = new Set(packFeats.map((f) => f.id));
const packRaceIds = new Set(packRaces.map((r) => r.id));
const packItemIds = new Set(packMagicItems.map((i) => i.id));

const publicFeatures = classFeatures.filter((f) => !packFeatureIds.has(f.id));
const publicFeats = SRD_FEATS.filter((f) => !packFeatIds.has(f.id));
const publicRaces = SRD_RACES.filter((r) => !packRaceIds.has(r.id));
const publicItems = SRD_MAGIC_ITEMS.filter((i) => !packItemIds.has(i.id));

/**
 * PUBLIC features intentionally left as descriptive prose — each is NOT cleanly
 * automatable on a single-character, no-dice sheet (the engine rolls nothing and
 * sees no allies/positioning). Grouped by reason; see docs/MECHANICS.md §A–G.
 * (The pack corpus's residual ledger lives with the pack companion.)
 */
const DELIBERATE_RESIDUALS = new Set<string>([
  // ── Ribbons / chooser markers (effect handled elsewhere or pure flavor) ──
  // (all *-epic-boon features are now SYSTEM_HANDLED — feat pick via the L19 asi flag)
  "wizard-memorize-spell", // 2024: free prepared-spell swap each Short Rest (a player action, no auto-computed grant/cap)
  "bard-expertise", // expertise picker
  "paladin-fighting-style-defense",
  // ── Situational per-turn / per-cast combat choices (no passive grant) ──
  "barbarian-reckless-attack",
  "barbarian-instinctive-pounce",
  "barbarian-brutal-strike",
  "barbarian-improved-brutal-strike",
  "barbarian-greater-brutal-strike",
  "fighter-tactical-mind",
  "fighter-studied-attacks",
  "fighter-tactical-shift",
  "fighter-tactical-master",
  "rogue-improved-cunning-strike",
  "monk-open-hand-technique",
  "monk-deflect-energy",
  "ranger-hunter-superior-hunters-prey",
  // ── Defensive save/attack-OUTCOME modifiers (no dice → no seam) ──
  "rogue-evasion",
  "monk-evasion",
  "rogue-elusive",
  "paladin-devotion-smite-of-protection",
  "ranger-relentless-hunter",
  // ── Heal / temp-HP riders on a non-spell trigger (no clean rider seam yet) ──
  "cleric-life-blessed-healer",
  "cleric-life-supreme-healing",
  "paladin-restoring-touch",
  "monk-self-restoration",
  // ── Per-use utility / movement / resource niceties (prose) ──
  "monk-acrobatic-movement",
  "monk-slow-fall",
  "monk-heightened-focus",
  "rogue-thief-fast-hands",
  "rogue-thief-reflexes",
  "ranger-foe-slayer", // Hunter's Mark die upgrade — no spell-damage seam (§A)
  "ranger-hunter-hunters-lore",
  "bard-lore-peerless-skill",
  // (cleric-sear-undead is now AUTOMATED — S11b surfaces its WIS-many d8 Radiant
  //  damage card; it left the residual set.)
  "cleric-improved-blessed-strikes",
  "cleric-improved-divine-intervention",
  "druid-improved-elemental-fury",
  "druid-archdruid",
  "barbarian-persistent-rage",
  "barbarian-indomitable-might",
  "paladin-aura-expansion", // aura RADIUS bump — party-scope (Phase-2)
  // ── Sorcerer per-use / SP-spend effects (prose) ──
  "sorcerer-arcane-apotheosis",
  // ── Warlock per-use (per-rest recovery upgrade) ──
  // (warlock-magical-cunning is now AUTOMATED — the PRIM-resource-conversion
  // `pact-slot` restore on its 1/LR tracker; no longer a residual.)
  "warlock-eldritch-master", // L20 system-handled UPGRADE of Magical Cunning (flips its restore to the full Pact pool via the live `restoresAll` flag); carries no grant of its own.
  // ── Wizard save-outcome (potent cantrip half-on-save) ──
  "wizard-evoker-potent-cantrip",
]);

describe("automation coverage — every public class feature is automated, system-handled, or a listed residual", () => {
  const bare = publicFeatures.filter((f) => !isAutomated(f));

  it("no UNACCOUNTED bare feature (new features must be automated or justified)", () => {
    const unaccounted = bare
      .map((f) => f.id)
      .filter((id) => !SYSTEM_HANDLED.test(id) && !DELIBERATE_RESIDUALS.has(id));
    expect(unaccounted).toEqual([]);
  });

  it("automation ratio stays at/above today's baseline (~66% public corpus)", () => {
    // "Automated" here = has grants or mechanics. The baseline dipped from ~71%
    // when the Epic-Boon (L19) markers were added: like the *-asi markers they
    // carry no per-feature grant (the feat pick is owned by the asi/feat subsystem,
    // matched by SYSTEM_HANDLED), so they're accounted-for but count as "bare".
    // The composed pack-mode corpus's higher ~69% floor is pinned in
    // `content-pack/tests/unit/automation-coverage.guard.pack.test.ts`.
    // The membership test above is the real guard — no UNACCOUNTED bare feature.
    const automated = publicFeatures.length - bare.length;
    const ratio = automated / publicFeatures.length;
    expect(ratio).toBeGreaterThanOrEqual(0.66);
  });

  it("every listed residual id actually exists in the public corpus (no stale entries)", () => {
    const allIds = new Set(publicFeatures.map((f) => f.id));
    const stale = [...DELIBERATE_RESIDUALS].filter((id) => !allIds.has(id));
    expect(stale).toEqual([]);
  });
});

// ─── FEATS ──────────────────────────────────────────────────────────────────
// Extends the coverage ratchet beyond class features (the over-claim the owner
// caught). Every bare public feat is system-handled; the pack's prose-by-design
// feat residuals live in the pack companion's ledger.

describe("automation coverage — feats", () => {
  const bare = publicFeats.filter((f) => !isAutomated(f));

  it("no UNACCOUNTED bare feat (new feats must be automated or justified)", () => {
    const unaccounted = bare
      .map((f) => f.id)
      .filter((id) => !FEAT_SYSTEM_HANDLED.has(id));
    expect(unaccounted).toEqual([]);
  });

  it("the feat automation ratio stays at/above today's baseline (~89% public corpus)", () => {
    // Public floor (19 feats, 2 system-handled bare). The composed pack-mode
    // corpus's ~93% floor is pinned in the pack companion.
    const ratio = (publicFeats.length - bare.length) / publicFeats.length;
    expect(ratio).toBeGreaterThanOrEqual(0.89);
  });

  it("every system-handled feat id actually exists (no stale entries)", () => {
    const ids = new Set(publicFeats.map((f) => f.id));
    expect([...FEAT_SYSTEM_HANDLED].filter((id) => !ids.has(id))).toEqual([]);
  });
});

// ─── SPECIES TRAITS ─────────────────────────────────────────────────────────
// Keyed `raceId:trait-id`. The bare ones are RIBBONS (Trance, Halfling Luck) or
// no-clean-grant traits (positioning, "reroll a die" — the engine rolls no dice);
// the mechanic-bearing ones (Fey Ancestry charm-advantage, senses, resistances,
// ability floors, species spells) carry grants/mechanics.
const TRAIT_RESIDUALS = new Set<string>([
  "elf:trance", // no-sleep ribbon
  "halfling:halfling-nimbleness", // move through larger creatures' space
  "halfling:luck", // reroll natural 1s — the engine rolls no dice
  "halfling:naturally-stealthy", // Hide behind a larger creature (positioning)
  "dragonborn:damage-resistance", // descriptive marker — the resistance grant is on the chosen Ancestry bundle
]);

describe("automation coverage — species traits", () => {
  const traits = publicRaces.flatMap((r) =>
    r.traits.map((t) => ({ key: `${r.id}:${t.id}`, t }))
  );
  const bare = traits.filter(({ t }) => !isAutomated(t));

  it("no UNACCOUNTED bare species trait (mechanic-bearing traits must be automated)", () => {
    const unaccounted = bare.map((x) => x.key).filter((k) => !TRAIT_RESIDUALS.has(k));
    expect(unaccounted).toEqual([]);
  });

  it("no stale species-trait residual entry", () => {
    const keys = new Set(traits.map((x) => x.key));
    expect([...TRAIT_RESIDUALS].filter((k) => !keys.has(k))).toEqual([]);
  });
});

// ─── MAGIC ITEMS ────────────────────────────────────────────────────────────
// Items are automated by declarative grants OR a parsed effect (AC bonus,
// charges, potion/attunement flags). A ratio guard (rather than a per-item
// residual list) ratchets coverage — flavor/utility items legitimately carry no
// mechanical effect.

describe("automation coverage — magic items", () => {
  it("the magic-item effect-coverage ratio stays at/above today's baseline", () => {
    const withEffect = publicItems.filter((i) => {
      const r = i as unknown as Record<string, unknown>;
      return (
        isAutomated(i) ||
        r.acBonus != null ||
        r.charges != null ||
        r.attunement === true ||
        r.type === "potion"
      );
    });
    const ratio = withEffect.length / Math.max(1, publicItems.length);
    expect(ratio).toBeGreaterThanOrEqual(0.4);
  });
});
