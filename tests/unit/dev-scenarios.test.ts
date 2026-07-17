/**
 * Dev-scenario builder — the arbitrary-character injection seam that lets an
 * agent self-validate a mechanic on the exact build that exercises it (then
 * screenshot it). Asserts each registered scenario builds a valid, renderable
 * CharacterDoc whose DERIVED features carry the mechanic, and that the mechanic
 * actually surfaces through the live `resolveActions` consumer (not just the
 * pure helper) — the gap that hid the heal-verdict regex miss.
 */
import { describe, expect, it } from "vitest";
import { DEV_SCENARIOS, buildScenario, buildDevScenario } from "@/lib/dev-scenarios";
import {
  primaryClassId,
  totalLevel as charTotalLevel,
  classEntryLevel,
} from "@/lib/classes";
import { resolveActions, resolveTrackers } from "@/lib/smart-tracker";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { conversionOptionVMs, type ConversionCtx } from "@/lib/views/tracker-view";
import { slotUsageKey } from "@/lib/cast-options";
import { classFeatureIndex } from "@/data/classes";
import type { CharacterDoc } from "@/types/character";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

describe("dev-scenarios — every registered scenario builds a valid doc", () => {
  for (const [key, spec] of Object.entries(DEV_SCENARIOS)) {
    it(`builds "${key}" with derived features + matching identity`, () => {
      const doc = buildScenario(spec);
      expect(primaryClassId(doc.character)).toBe(spec.classId);
      // R4 — `level` is the TOTAL across all classes (= the primary's level for a
      // single-class scenario; the sum for a multiclass one).
      const totalLevel =
        spec.level + (spec.secondaryClasses ?? []).reduce((s, c) => s + c.level, 0);
      expect(charTotalLevel(doc.character)).toBe(totalLevel);
      // The multiclass breakdown is present and sums to the total.
      expect(doc.character.classes.reduce((s, c) => s + c.level, 0)).toBe(totalLevel);
      expect(doc.character.classes[0]?.classId).toBe(spec.classId);
      // Features are INFERRED via buildGrantedFeatures — never empty for a real build.
      expect(doc.character.features.length).toBeGreaterThan(0);
      // resolveActions must not throw on the built doc (renderable end to end).
      expect(() => resolveActions(doc)).not.toThrow();
    });
  }

  it("buildDevScenario resolves the `scn-` prefix and stamps the id", () => {
    const doc = buildDevScenario("scn-life-cleric");
    expect(doc?.id).toBe("scn-life-cleric");
    expect(primaryClassId((doc as NonNullable<typeof doc>).character)).toBe("cleric");
  });

  it("returns null for an unknown scenario id", () => {
    expect(buildDevScenario("scn-nope")).toBeNull();
  });
});

describe("dev-scenarios — the mechanics surface through resolveActions", () => {
  /** Build a scenario by key via the real `scn-` loader, then resolve its actions. */
  const actionsFor = (key: string): ReturnType<typeof resolveActions> => {
    const doc = buildDevScenario(`scn-${key}`);
    if (!doc) throw new Error(`unknown scenario ${key}`);
    return resolveActions(doc);
  };

  it("Life Cleric: Cure Wounds shows a heal verdict WITH the Disciple-of-Life bonus", () => {
    const cure = actionsFor("life-cleric").find((a) => a.spellId === "cure-wounds");
    expect(cure).toBeDefined();
    // WIS 18 → +4 spellcasting mod; Disciple of Life (L3) → +2 + spell level (1) =
    // +3; folded into one trailing flat = +7. This pins the full path — the 2024
    // "regains a number of Hit Points equal to 2d8" phrasing IS detected (the bug
    // the pure-helper unit test could not catch) AND the rider rides on top.
    expect(cure?.summary.healing).toBe("2d8+7");
  });

  it("Life Cleric: Healing Word also gains the heal bonus (2d4 base → 2d4+7)", () => {
    const word = actionsFor("life-cleric").find((a) => a.spellId === "healing-word");
    expect(word?.summary.healing).toBe("2d4+7");
  });

  it("Open Hand Monk: has an Unarmed Strike attack row (Martial Arts die + DEX)", () => {
    // A Monk's Unarmed Strike is their main attack, but no carried weapon produces
    // a row — without the `unarmed-strike-die` consumer a Monk had NO attack row in
    // Combat. L6 → d8 Martial Arts die; DEX 18 → +4 damage, +4 + PB 3 = +7 to hit.
    const ua = actionsFor("open-hand-monk").find((a) => a.id === "unarmed-strike");
    expect(ua).toBeDefined();
    expect(ua?.summary.damage).toBe("d8+4");
    expect(ua?.summary.damageType).toBe("bludgeoning");
    expect(ua?.summary.attackBonus).toBe(7);
    // Empowered Strikes (L6): the strike offers a Bludgeoning/Force CHOICE.
    expect(ua?.summary.damageTypes).toEqual(["bludgeoning", "force"]);
    expect(ua?.summary.multiDamageTypeFlavor).toBe("choice");
  });

  // (The GoO / Undead Warlock Eldritch Blast damage-CHOICE pins — pack
  // subclasses — live in `content-pack/tests/unit/dev-scenarios.pack.test.ts`.)

  it("Wand-Bearer Fighter: an equipped Wand of Web makes Web a Play-board cast affordance", () => {
    // S9 charged-wand render proof: a non-caster Fighter carrying an equipped +
    // attuned Wand of Web casts Web on the Combat tab via the item's
    // `always-prepared-spell` grant (the affordance comes from the ITEM, not the
    // class). The cast action surfaces through the live `resolveActions` consumer.
    const web = actionsFor("wand-of-web-fighter").find((a) => a.spellId === "web");
    expect(web).toBeDefined();
  });

  it("Wand-Bearer Fighter: the wand's 7-charge pool surfaces (2 spent → 5 left)", () => {
    // The paired `free-cast-spell` grant's per-rest counter IS the wand's charge
    // pool; `resolveFreeCastItemTrackers` surfaces it as a rail tracker keyed by the
    // ITEM id (the same id the cast flow debits), regains at dawn. The scenario seeds
    // 2 charges spent, so the pool reads 5/7 — proving the spend state renders.
    const doc = buildDevScenario("scn-wand-of-web-fighter");
    if (!doc) throw new Error("scenario missing");
    const wand = resolveTrackers(doc).find((t) => t.id === "wand-of-web");
    expect(wand?.total).toBe(7);
    expect(wand?.isPool).toBe(true);
    expect(wand?.recovery).toBe("dawn");
    expect(wand?.used).toBe(2);
  });
});

describe("dev-scenarios — the Warlock pact-slot restore affordance surfaces with expended slots", () => {
  // The two Warlock conversion scenarios start with their Pact-Magic pool
  // expended + the Magical Cunning 1/Long-Rest charge available, so the rail's
  // ResourceConversions affordance is non-empty. This pins, through the SAME
  // consumer chain the rail uses (aggregateCharacterGrants → conversionOptionVMs),
  // that the restore option surfaces with the RIGHT count — the proof the
  // screenshots show. Mirrors the ResourceConversions `buildCtx`/`pactPool` seam.
  function pactRestoreAmount(doc: CharacterDoc): number {
    const { character, session } = doc;
    const agg = aggregateCharacterGrants(character, session);
    const entry = agg.resourceConversions.find((e) => e.produces === "pact-slot");
    if (!entry) throw new Error("no pact-slot conversion entry");
    const slot = character.spellSlots.find((s) => s.pactMagic);
    if (!slot) throw new Error("no pact slot");
    const expended = Math.min(
      session.spellSlots[slotUsageKey(slot)]?.used ?? 0,
      slot.total
    );
    const eldritchMaster = classFeatureIndex.get("warlock-eldritch-master");
    const warlockLevel = classEntryLevel(character, "warlock");
    const restoresAll = eldritchMaster != null && warlockLevel >= eldritchMaster.level;
    const ctx: ConversionCtx = {
      classLevel: warlockLevel,
      trackerRemaining: () => 1, // the Magical Cunning 1/LR charge is unspent
      trackerDeficit: () => 0,
      slotsExpended: () => 0,
      slotsAvailable: () => 0,
      pactPool: { level: slot.level, max: slot.total, expended, restoresAll },
    };
    const opts = conversionOptionVMs(entry, ctx);
    expect(opts).toHaveLength(1);
    const [opt] = opts;
    if (!opt || opt.kind !== "restore-pact" || opt.pactRestored == null) {
      throw new Error("expected a restore-pact option with a count");
    }
    return opt.pactRestored;
  }

  it("Magical Cunning (Warlock 5, pool 2, both expended): offers Regain 1 (⌈2/2⌉)", () => {
    const doc = buildDevScenario("scn-magical-cunning-warlock");
    if (!doc) throw new Error("scenario missing");
    // The scenario seeds both level-3 pact slots expended.
    expect(doc.session.spellSlots["pact-3"]?.used).toBe(2);
    expect(pactRestoreAmount(doc)).toBe(1);
  });

  it("Eldritch Master (Warlock 20, pool 4, all expended): offers Regain 4 (the FULL pool)", () => {
    const doc = buildDevScenario("scn-eldritch-master-warlock");
    if (!doc) throw new Error("scenario missing");
    // The scenario seeds all four level-5 pact slots expended.
    expect(doc.session.spellSlots["pact-5"]?.used).toBe(4);
    // Eldritch Master upgrades Magical Cunning to the whole pool (4, not ⌈4/2⌉ = 2).
    expect(pactRestoreAmount(doc)).toBe(4);
  });
});

describe("dev-scenarios — the Sacred Weapon to-hit reaches the rendered weapon row", () => {
  // The Devotion paladin scenario carries a Longsword + the `paladin-devotion-
  // sacred-weapon` while-active toggle LIT. The +CHA-mod (min +1) to-hit bonus must
  // reach the SHARED weapon-row consumer `buildInventoryViewModel` (golden rule 6 —
  // the SAME `attackBonus` the Play/Combat card renders), gated on the active toggle.
  // This pins the RENDER-consumer end of the engine fix (the screenshot proof): with
  // the toggle on, CHA 20 (+5) folds in (STR +3 + PB +3 + 5 = +11); off → base +6.
  const longswordAtk = (doc: ReturnType<typeof buildScenario>): number => {
    const vm = buildInventoryViewModel(doc, "en");
    const sword = vm.weapons.find((w) => w.id === "longsword");
    if (!sword) throw new Error("Longsword row missing");
    return sword.attackBonus;
  };

  it("includes the +5 Sacred Weapon bonus while the toggle is LIT (STR +3 + PB +3 = +11)", () => {
    const doc = buildDevScenario("scn-devotion-paladin");
    if (!doc) throw new Error("scenario missing");
    // The scenario seeds activeFeatures: ["paladin-devotion-sacred-weapon"].
    expect(doc.session.activeFeatures).toContain("paladin-devotion-sacred-weapon");
    expect(longswordAtk(doc)).toBe(11);
  });

  it("drops back to the base +6 when the toggle is OFF (bonus is while-active)", () => {
    const doc = buildDevScenario("scn-devotion-paladin");
    if (!doc) throw new Error("scenario missing");
    const off = { ...doc, session: { ...doc.session, activeFeatures: [] } };
    expect(longswordAtk(off)).toBe(6);
  });

  it("does not ride a RANGED weapon even while lit (melee scope)", () => {
    const doc = buildDevScenario("scn-devotion-paladin");
    if (!doc) throw new Error("scenario missing");
    const withBow = {
      ...doc,
      character: {
        ...doc.character,
        weapons: [...doc.character.weapons, { srdId: "shortbow", quantity: 1 }],
      },
    };
    const vm = buildInventoryViewModel(withBow, "en");
    const bow = vm.weapons.find((w) => w.id === "shortbow");
    // DEX 10 (+0) + PB +3 = +3 — no Sacred Weapon (+5) folded into the ranged row.
    expect(bow?.attackBonus).toBe(3);
  });
});

// (The Weapon Master feat / Blessed Warrior cantrip / Abjurer Arcane Ward
// scenario pins moved to `content-pack/tests/unit/dev-scenarios.pack.test.ts` —
// the `wm-feat-wizard`, `blessed-paladin-2` and `abjurer-ward` scenarios live
// in the pack registry.)

describe("dev-scenarios — stays OFF the eager bundle (lazy-loaded)", () => {
  // The dev-only scenario builder (its ~800-line registry + the engine it imports)
  // must NEVER be statically reachable from the live subscription hooks, or it ships
  // to every user inside the eager cockpit chunk. The hooks gate it behind the cheap
  // `dev-scenario-id` predicate and reach the builder via `import()` only. (GR13: a
  // cheap source guard pins the fact; the dist-level `bundle-budget.guard` enforces
  // the eager-closure ceiling.)
  const here = dirname(fileURLToPath(import.meta.url));
  const HOOKS = [
    "../../src/hooks/useCharacterSubscription.ts",
    "../../src/hooks/useCharacters.ts",
    "../../src/features/campaigns/useMemberCharacterSubscription.ts",
  ];
  const STATIC_IMPORT = /from\s+["']@\/lib\/dev-scenarios["']/;

  for (const rel of HOOKS) {
    const name = rel.split("/").pop();
    it(`${name} reaches dev-scenarios only via dynamic import()`, () => {
      const src = readFileSync(resolve(here, rel), "utf8");
      expect(
        STATIC_IMPORT.test(src),
        `${name} STATICALLY imports @/lib/dev-scenarios — that pulls the dev-only ` +
          `scenario builder onto the eager bundle. Gate it behind isDevScenarioRouteId ` +
          `(@/lib/dev-scenario-id) and load the builder via import("@/lib/dev-scenarios").`
      ).toBe(false);
      expect(
        src.includes('import("@/lib/dev-scenarios")'),
        `${name} should lazy-load the builder via import("@/lib/dev-scenarios").`
      ).toBe(true);
    });
  }
});

// (The full-roster gallery pin lives in
// `content-pack/tests/unit/dev-scenarios.pack.test.ts`: `buildDevRosterDocs`
// dresses pack-registry scenarios by id, so the gallery only builds in pack
// mode.)

// MODE-AGNOSTIC floor: the roster builder never throws — a tile whose scenario
// is pack content simply drops out of the SRD-only composition.
describe("dev-scenarios — the dev roster builds in ANY composition", () => {
  it("buildDevRosterDocs never throws; pack tiles drop out without the pack", async () => {
    const { buildDevRosterDocs } = await import("@/lib/dev-scenarios");
    const docs = buildDevRosterDocs();
    // The mock + the always-public tiles (wizard-18, life-cleric, open-hand-monk).
    expect(docs.length).toBeGreaterThanOrEqual(4);
    expect(docs[0]?.id).toBe("mock-1");
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
  });
});
