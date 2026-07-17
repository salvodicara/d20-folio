/**
 * B2 (multiclass, CRITICAL) — a CLASS feature's tracker level-scaling resolves at
 * the character's level IN that feature's OWNING class, never the TOTAL character
 * level. Before the fix three smart-tracker seams disagreed with each other (and
 * with RAW): the rail (`resolveTrackers`) already used `classEntryLevel`, but the
 * action card (`resolveActions`) and short-rest recovery (`getShortRestRecoveries`)
 * scaled on the total — so a Druid 5 / Cleric 3 showed 2 Wild Shapes on the rail
 * yet 3 on the action card, a Monk 5 / Rogue 3 had 8 Focus (RAW 5), a Paladin 5 /
 * Sorcerer 3 had 40 Lay-On-Hands HP (RAW 25), and a Bard 4 / Cleric 2 wrongly
 * short-rest-recovered Bardic Inspiration (Font of Inspiration is a Bard-5 gate).
 *
 * The fix routes ALL THREE seams through the ONE shared owning-class-level
 * resolver (`featureScalingLevel`, threaded into `resolveTrackerTotal`'s new
 * `scalingLevel` param + into `resolveTrackerSpec`'s existing `level`), so the
 * three views resolve from one value by construction (golden rule 6). A FEAT /
 * RACE tracker has no class entry → it keeps scaling on the total character level.
 *
 * Facts (dnd2024.wikidot.com): Wild Shape uses 2 → 3 at Druid 6 → 4 at Druid 17;
 * Monk Focus pool = Monk level; Lay On Hands pool = 5 × Paladin level; Bardic
 * Inspiration recovers on a SHORT rest only from Bard 5 (Font of Inspiration).
 */
import { describe, expect, it } from "vitest";
import {
  resolveTrackers,
  resolveActions,
  getShortRestRecoveries,
} from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";
import { SRD_FEATS } from "@/data/feats";
import { SRD_RACES } from "@/data/races";
import { classFeatures } from "@/data/classes";
import { packFeats } from "@pack";
import type { ClassEntry } from "@/types/character";

/**
 * A doc with the given multiclass split + a single SRD feature wired in.
 *
 * Each doc gets a UNIQUE `id` instead of the shared `makeCharacterDoc` default
 * (`test-char`). Defensive isolation: any consumer that keys per-document state by
 * `doc.id` (a store singleton, a future derived-data memo — the same id-collision
 * class that already makes the store-backed sibling suites order-dependent) can
 * never let one case poison another, so the cases stay independent + order-robust.
 * The B2 path here is pure (`resolveTrackers`/`resolveActions` over the doc, no
 * id-keyed memo), so it doesn't currently flip — but a per-doc id is cheap and
 * keeps it that way under any run order.
 */
let docSeq = 0;
function docWith(classes: ClassEntry[], srdId: string) {
  const doc = makeCharacterDoc({ classes });
  doc.id = `b2-owning-class-${(docSeq += 1)}`;
  doc.character.features = [{ srdId }];
  return doc;
}

const railTotal = (classes: ClassEntry[], srdId: string): number | undefined =>
  resolveTrackers(docWith(classes, srdId)).find((t) => t.id === srdId)?.total;

/** The action-card "uses.total" for a feature that surfaces a tracker + action. */
const actionTotal = (
  classes: ClassEntry[],
  srdId: string,
  actionId: string
): number | undefined =>
  resolveActions(docWith(classes, srdId)).find((a) => a.id === actionId)?.summary.uses
    ?.total;

describe("B2 — class-feature trackers scale on the OWNING-class level (multiclass)", () => {
  // Each row: a multiclass split whose TOTAL level differs from the owning-class
  // level, the feature, and the RAW total computed from the OWNING class only.
  it.each([
    // Druid 5 / Cleric 3 (total 8): Wild Shape uses = 2 at Druid 5 (the 3rd use is
    // a Druid-6 gate). Total-8 scaling would wrongly read the from:6 → 3 override.
    {
      name: "Druid 5 / Cleric 3 — Wild Shape = 2 uses (NOT 3)",
      classes: [
        { classId: "druid", level: 5 },
        { classId: "cleric", level: 3 },
      ] as ClassEntry[],
      srdId: "druid-wild-shape",
      raw: 2,
    },
    // Monk 5 / Rogue 3 (total 8): Focus pool ("level") = Monk 5 = 5 (RAW), not 8.
    {
      name: "Monk 5 / Rogue 3 — Focus pool = 5 points (NOT 8)",
      classes: [
        { classId: "monk", level: 5 },
        { classId: "rogue", level: 3 },
      ] as ClassEntry[],
      srdId: "monk-focus",
      raw: 5,
    },
    // Paladin 5 / Sorcerer 3 (total 8): Lay On Hands ("level*5") = 25 (RAW), not 40.
    {
      name: "Paladin 5 / Sorcerer 3 — Lay On Hands = 25 HP (NOT 40)",
      classes: [
        { classId: "paladin", level: 5 },
        { classId: "sorcerer", level: 3 },
      ] as ClassEntry[],
      srdId: "paladin-lay-on-hands",
      raw: 25,
    },
  ])("$name", ({ classes, srdId, raw }) => {
    expect(railTotal(classes, srdId)).toBe(raw);
  });

  it("Druid 5 / Cleric 3 — the action card AND the rail BOTH show 2 Wild Shapes", () => {
    const classes: ClassEntry[] = [
      { classId: "druid", level: 5 },
      { classId: "cleric", level: 3 },
    ];
    // The disagreeing seam (was 3 on the action card, 2 on the rail) now agrees.
    expect(railTotal(classes, "druid-wild-shape")).toBe(2);
    expect(actionTotal(classes, "druid-wild-shape", "druid-wild-shape-bonus")).toBe(2);
  });

  it("Monk 5 / Rogue 3 — a CROSS-REFERENCED Focus pool on the Flurry card reads 5 (agrees with the rail), NOT 8", () => {
    // The 4th seam: `monk-flurry-of-blows` has NO own tracker — its action card
    // surfaces the Focus pool by CROSS-REFERENCING `monk-focus` (`costTracker`).
    // Before the fix that cross-ref resolved on the TOTAL level (8), so a real
    // multiclass Monk's Flurry card claimed a pool of 8 while the Focus tracker
    // card + the rail correctly showed 5 — the card contradicted the rail. The
    // cross-ref now scales on the CROSS-REFERENCED feature's OWNING-class level.
    const classes: ClassEntry[] = [
      { classId: "monk", level: 5 },
      { classId: "rogue", level: 3 },
    ];
    // The Focus tracker itself (own card + rail) = 5 (Monk level).
    expect(railTotal(classes, "monk-focus")).toBe(5);
    // The Flurry action card's referenced Focus pool MUST agree: 5, not 8.
    expect(
      actionTotal(classes, "monk-flurry-of-blows", "monk-flurry-of-blows-bonus")
    ).toBe(5);
  });

  it("Bard 4 / Cleric 2 — Bardic Inspiration does NOT short-rest-recover (Font of Inspiration is Bard 5)", () => {
    const classes: ClassEntry[] = [
      { classId: "bard", level: 4 },
      { classId: "cleric", level: 2 },
    ];
    const recoveries = getShortRestRecoveries(
      docWith(classes, "bard-bardic-inspiration")
    );
    // Bard level 4 < 5 → the from:5 short-rest override doesn't apply → absent.
    expect(recoveries.has("bard-bardic-inspiration")).toBe(false);
  });

  it("Bard 5 / Cleric 2 — Bardic Inspiration DOES short-rest-recover once Bard hits 5", () => {
    const classes: ClassEntry[] = [
      { classId: "bard", level: 5 },
      { classId: "cleric", level: 2 },
    ];
    const recoveries = getShortRestRecoveries(
      docWith(classes, "bard-bardic-inspiration")
    );
    expect(recoveries.has("bard-bardic-inspiration")).toBe(true);
  });
});

// B2 — feat / race trackers keep scaling on the TOTAL character level. The
// only shipped feat with a character-level-gated tracker bump (Fey Sentinel)
// is PACK content, so that leg lives in
// content-pack/tests/unit/tracker-owning-class-level.pack.test.ts.

describe("B2 — a SINGLE-class character is unchanged (owning-class level == total)", () => {
  // The 6 live team fixtures are single-class; owning-class level equals the total,
  // so every derived value must be byte-identical. These pin the equivalence on the
  // exact scenario classes.
  it.each([
    {
      name: "Druid 8 — Wild Shape",
      classId: "druid",
      level: 8,
      srdId: "druid-wild-shape",
      raw: 3,
    },
    { name: "Monk 8 — Focus", classId: "monk", level: 8, srdId: "monk-focus", raw: 8 },
    {
      name: "Paladin 8 — Lay On Hands",
      classId: "paladin",
      level: 8,
      srdId: "paladin-lay-on-hands",
      raw: 40,
    },
  ])("$name scales on its (sole) class level", ({ classId, level, srdId, raw }) => {
    expect(railTotal([{ classId, level }], srdId)).toBe(raw);
  });

  it("single-class Bard 5 short-rest-recovers Bardic Inspiration (the sole class IS the owning class)", () => {
    const recoveries = getShortRestRecoveries(
      docWith([{ classId: "bard", level: 5 }], "bard-bardic-inspiration")
    );
    expect(recoveries.has("bard-bardic-inspiration")).toBe(true);
  });
});

/**
 * W11 (the B2 lesson, applied to `chargesFormula`) — `resolveChargesFormula`
 * passes NO `scalingLevel`, so a `"level"` term in a free-cast `chargesFormula`
 * would resolve on the TOTAL character level (NOT the owning-class level). That
 * is CORRECT for every shipped formula: all of them scale on a character-WIDE
 * value — Proficiency Bonus (set by total level) or an ability modifier — never
 * a class-specific level. Verified vs the 2024 SRD (dnd2024.wikidot.com):
 *
 *   source (id)                          spell             formula  RAW scaling
 *   ─────────────────────────────────────────────────────────────────────────
 *   greater-mark-of-healing (feat)       Cure Wounds       "PB"     "Proficiency Bonus" / LR
 *   forest-gnome (Gnome lineage)         Speak with Anim.  "PB"     "Proficiency Bonus" / LR
 *   druid-stars-star-map (subclass)      Guiding Bolt      "WIS"    "Wisdom modifier" / LR
 *   ranger-fey-wanderer-misty-wanderer   Misty Step        "WIS"    "Wisdom modifier" / LR
 *   artificer-cartographer-mapping-magic Faerie Fire       "INT"    "Intelligence modifier" / LR
 *   warlock-archfey-steps-of-the-fey     Misty Step        "CHA"    "Charisma modifier" / LR
 *
 * This guard PINS that set + asserts EXHAUSTIVELY that NO shipped `chargesFormula`
 * references a `"level"` token (i.e. a class-specific or even character level). So
 * the day a future MULTICLASS magic-item charge formula scales on CLASS level, it
 * CANNOT silently ship resolving on total level — this fails, forcing the B2 fix
 * (thread `featureScalingLevel(...)` into `resolveChargesFormula`, per the latent
 * note in `src/lib/smart-tracker.ts`). The crawl serialises the grant-bearing SRD
 * arrays, so it descends into nested grants (Forest Gnome lives inside a
 * `choice-grant-bundle` option) automatically.
 */
describe("W11 — every shipped free-cast `chargesFormula` scales on a character-WIDE value", () => {
  /** Every `chargesFormula` literal anywhere in the grant-bearing SRD data
   *  (feats + race traits + class/subclass features, incl. nested bundle grants).
   *  A cycle-safe deep walk (the SRD data has a self-referential `variants` array,
   *  so `JSON.stringify` can't be used) that descends into any container by field
   *  name — so it can't miss a new nesting shape a future grant introduces. */
  const shippedFormulas: string[] = (() => {
    const found: string[] = [];
    const seen = new WeakSet<object>();
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      if (seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const child of node) walk(child);
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "chargesFormula" && typeof value === "string") found.push(value);
        else walk(value);
      }
    };
    walk([SRD_FEATS, SRD_RACES, classFeatures]);
    return found;
  })();

  it("pins the exact shipped set per composition — a new/removed formula fails here", () => {
    // Counts pin both the values AND their multiplicity, so adding/removing a
    // free-cast formula trips this until the table above + the SRD note are updated.
    // The composed data differs by mode: SRD-only carries just the Forest Gnome
    // "PB"; the content pack adds the other five occurrences.
    const counts = shippedFormulas.reduce<Record<string, number>>((acc, f) => {
      acc[f] = (acc[f] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual(
      packFeats.length > 0 ? { PB: 2, WIS: 2, INT: 1, CHA: 1 } : { PB: 1 }
    );
  });

  it('references NO class-specific / character `"level"` token (else it would wrongly resolve on TOTAL level)', () => {
    // The exhaustiveness check that protects the latent: a `"level"`-bearing
    // formula on a multiclass-able source MUST resolve on the OWNING-class level,
    // which `resolveChargesFormula` cannot do today. None ships, so none may.
    const withLevel = shippedFormulas.filter((f) => /\blevel\b/.test(f));
    expect(withLevel).toEqual([]);
  });

  it("every shipped formula is a character-WIDE token (PB or an ability modifier)", () => {
    // PB (total-level-driven) and the six ability mods are all character-wide, so
    // resolving them on the total level is RAW-correct in a multiclass too.
    const characterWide = new Set(["PB", "STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    expect(shippedFormulas.every((f) => characterWide.has(f))).toBe(true);
  });
});
