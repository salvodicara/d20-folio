/**
 * Polymorph / True Polymorph SELF-transformation (S7, Phase 1).
 *
 * Covers the whole seam:
 *  - the Beast catalogue is well-formed + bilingually complete;
 *  - the CR gate (`resolvePolymorphForms`) offers only forms of CR ≤ the caster's level;
 *  - the self-swap store action reaches EVERY consumer — Beast AC → `effectiveAC`,
 *    speeds → the speed-override fields, STR/DEX/CON → effective scores → the
 *    Concentration CON-save, and a Beast attack → a rendered Play row;
 *  - Temp HP = the Beast's HP applied on assume, retracted on drop, undoable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BEASTS, getBeast, beastsByMaxCR } from "@/data/beasts";
import {
  resolvePolymorphForms,
  polymorphBuildPatch,
  polymorphPriorSnapshot,
  revertBuildFromPrior,
  POLYMORPH_SPELL_IDS,
} from "@/lib/polymorph";
import { ALL_DAMAGE_TYPES, CREATURE_SIZE_ORDER, type AbilityCode } from "@/data/types";
import { effectiveAC } from "@/lib/aggregate-character";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { concentrationValue } from "@/lib/concentration";
import { makeCharacterDoc } from "./_helpers";
import { srd, loc } from "../_harness/loc";

const ABILITIES: ReadonlyArray<AbilityCode> = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const DAMAGE = new Set<string>(ALL_DAMAGE_TYPES);
const SIZES = new Set<string>(CREATURE_SIZE_ORDER);

// ── Catalogue integrity ──────────────────────────────────────────────────────
describe("Beast catalogue integrity", () => {
  it("every entry has a valid CR, size, ability scores, and attacks", () => {
    for (const b of BEASTS) {
      expect(b.cr, `${b.id} cr`).toBeGreaterThanOrEqual(0);
      expect(b.cr, `${b.id} cr`).toBeLessThanOrEqual(8);
      expect(SIZES.has(b.size), `${b.id} size ${b.size}`).toBe(true);
      expect(b.ac, `${b.id} ac`).toBeGreaterThan(0);
      expect(b.hp, `${b.id} hp`).toBeGreaterThan(0);
      expect(typeof b.speeds.walk, `${b.id} walk`).toBe("number");
      for (const code of ABILITIES) {
        expect(Number.isInteger(b.abilityScores[code]), `${b.id} ${code}`).toBe(true);
      }
      // Almost every Beast has ≥1 attack, but a genuine 2024 SRD non-combat
      // form (the Seahorse — Bubble Dash is a movement action, not an attack)
      // prints ZERO attack actions; `.map()` over an empty array is a safe
      // no-op on the Play board, so an empty list is a valid catalogue entry.
      for (const atk of b.attacks) {
        expect(DAMAGE.has(atk.damageType), `${b.id} ${atk.nameKey} type`).toBe(true);
        // A dice roll ("1d6+2") OR a bare flat integer — the weakest CR-0
        // beasts (Badger, Bat, Rat, …) print "Hit: 1 [type] damage" with no die.
        expect(atk.damageDice, `${b.id} ${atk.nameKey} dice`).toMatch(
          /^(\d+d\d+([+-]\d+)?|\d+)$/
        );
      }
    }
  });

  it("ids are unique and getBeast round-trips", () => {
    const ids = BEASTS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BEASTS) expect(getBeast(b.id)).toBe(b);
    expect(getBeast("not-a-beast")).toBeUndefined();
  });

  it("every Beast, attack, and trait id resolves in BOTH locales (EN + IT parity)", () => {
    for (const b of BEASTS) {
      for (const locale of ["en", "it"] as const) {
        expect(
          srd("beasts", b.id, "name", locale).length,
          `${b.id} ${locale}`
        ).toBeGreaterThan(0);
        for (const atk of b.attacks) {
          expect(
            srd("beasts", atk.nameKey, "name", locale).length,
            `${atk.nameKey} ${locale}`
          ).toBeGreaterThan(0);
        }
        for (const trait of b.traits ?? []) {
          expect(
            srd("beasts", trait, "name", locale).length,
            `${trait} ${locale}`
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ── CR gate ──────────────────────────────────────────────────────────────────
describe("resolvePolymorphForms — the CR gate (form CR ≤ caster level)", () => {
  it("a level-5 caster is offered ONLY forms of CR ≤ 5 (fail-before: CR-8 hidden)", () => {
    const l5 = makeCharacterDoc({ classId: "druid", level: 5 });
    const forms = resolvePolymorphForms(l5);
    expect(forms.length).toBeGreaterThan(0);
    expect(forms.every((b) => b.cr <= 5)).toBe(true);
    // The CR-8 T-Rex, CR-7 Giant Ape, and CR-6 Mammoth are ABOVE the cap → hidden.
    const offered = forms.map((b) => b.id);
    expect(offered).not.toContain("tyrannosaurus-rex");
    expect(offered).not.toContain("giant-ape");
    expect(offered).not.toContain("mammoth");
    // A low-CR combat form IS offered.
    expect(offered).toContain("brown-bear");
  });

  it("a level-8 caster unlocks the CR-8 form", () => {
    const l8 = makeCharacterDoc({ classId: "druid", level: 8 });
    const offered = resolvePolymorphForms(l8).map((b) => b.id);
    expect(offered).toContain("tyrannosaurus-rex");
  });

  it("beastsByMaxCR filters and sorts by CR", () => {
    const forms = beastsByMaxCR(2);
    expect(forms.every((b) => b.cr <= 2)).toBe(true);
    const crs = forms.map((b) => b.cr);
    expect(crs).toEqual([...crs].sort((a, b) => a - b));
  });

  it("the two spell ids that engage a form are catalogued", () => {
    expect(POLYMORPH_SPELL_IDS).toContain("polymorph");
    expect(POLYMORPH_SPELL_IDS).toContain("true-polymorph");
  });
});

// ── Pure applicator ──────────────────────────────────────────────────────────
describe("polymorph build patch / snapshot / revert", () => {
  it("stamps the Beast AC, walk speed, and all six scores", () => {
    const bear = getBeast("brown-bear");
    if (!bear) throw new Error("brown-bear missing");
    const doc = makeCharacterDoc({ classId: "druid", level: 5 });
    const prior = polymorphPriorSnapshot(doc);
    const patch = polymorphBuildPatch(bear, prior);
    expect(patch.acOverride).toBe(bear.ac);
    expect(patch.speedOverride).toBe(bear.speeds.walk);
    expect(patch.abilityScores).toEqual(bear.abilityScores);
    // The revert restores the caster's own fields.
    const back = revertBuildFromPrior(prior);
    expect(back.acOverride).toBe(prior.acOverride);
    expect(back.abilityScores).toEqual(prior.abilityScores);
  });
});

// ── Store integration — the self-swap reaches every consumer ─────────────────
describe("assume/drop the self-swap (store)", () => {
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  const setUp = (level = 5) => {
    const doc = makeCharacterDoc({ classId: "druid", level });
    doc.session.hp.current = 44;
    useCharacterStore.getState().setCharacter(doc);
  };

  it("stamps AC / speed / scores / temp HP + engages concentration", () => {
    setUp();
    const bear = getBeast("brown-bear");
    if (!bear) throw new Error("brown-bear missing");
    useCharacterStore.getState().assumePolymorphForm("brown-bear");
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no doc");

    // AC → the effective-AC consumer.
    expect(effectiveAC(doc.character, doc.session)).toBe(bear.ac);
    // speed → the walk override (+ any non-walk modes).
    expect(doc.character.speedOverride).toBe(bear.speeds.walk);
    expect(doc.character.speedOverrides?.climb).toBe(bear.speeds.climb);
    // scores → the stored ability scores (all replaced).
    expect(doc.character.abilityScores).toEqual(bear.abilityScores);
    // Temp HP = the Beast's HP.
    expect(doc.session.hp.temp).toBe(bear.hp);
    // Concentration engaged by spell id.
    expect(doc.session.concentration).toBe("polymorph");
    // The active form is recorded on the session.
    expect(doc.session.polymorphForm?.beastId).toBe("brown-bear");
  });

  it("renders the Beast's attack rows on the Play board", () => {
    setUp();
    useCharacterStore.getState().assumePolymorphForm("brown-bear");
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no doc");
    const rows = resolveActions(doc);
    const bite = rows.find((r) => r.id === "beast-attack-brown-bear-0");
    expect(bite, "Beast bite row rendered").toBeDefined();
    // The 2024 SRD Brown Bear (re-derived from the monster corpus, §D): Bite +5,
    // 1d8+3 (the 2014-era block was +6 / 1d8+4).
    expect(bite?.summary.attackBonus).toBe(5);
    expect(bite?.summary.damage).toBe("1d8+3");
    expect(bite?.summary.damageType).toBe("piercing");
    expect(loc(bite?.name, "en")).toBe("Bite");
    // A creature not polymorphed shows NO beast rows.
    useCharacterStore.getState().dropPolymorphForm();
    const after = useCharacterStore.getState().character;
    if (!after) throw new Error("no doc");
    expect(resolveActions(after).some((r) => r.id.startsWith("beast-attack-"))).toBe(
      false
    );
  });

  it("drop restores the body, retracts the temp HP, and clears concentration", () => {
    setUp();
    const before = useCharacterStore.getState().character;
    if (!before) throw new Error("no doc");
    const bodyScores = { ...before.character.abilityScores };
    const bodyAc = before.character.acOverride ?? null;

    useCharacterStore.getState().assumePolymorphForm("polar-bear", "true-polymorph");
    useCharacterStore.getState().dropPolymorphForm();

    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no doc");
    expect(doc.character.abilityScores).toEqual(bodyScores);
    expect(doc.character.acOverride ?? null).toBe(bodyAc);
    expect(doc.session.hp.temp).toBe(0); // beast temp HP retracted
    expect(doc.session.concentration).toBe("");
    expect(doc.session.polymorphForm).toBeUndefined();
  });

  it("the swap is undoable (assume → undo restores the pre-form state)", () => {
    setUp();
    const before = useCharacterStore.getState().character;
    if (!before) throw new Error("no doc");
    const undo = useCharacterStore.getState().assumePolymorphForm("giant-elk");
    expect(undo).not.toBeNull();
    undo?.();
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no doc");
    expect(doc.session.polymorphForm).toBeUndefined();
    expect(doc.session.hp.temp).toBe(before.session.hp.temp);
    expect(doc.character.abilityScores).toEqual(before.character.abilityScores);
    expect(doc.session.concentration).toBe(before.session.concentration);
  });
});

// ── C1 — a Concentration drop/swap ENDS the form (mirrors the S1 while-active
//    retract seam in setConcentration) ─────────────────────────────────────────
describe("C1 — losing Concentration ends the Polymorph form", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  const assumeBear = () => {
    const doc = makeCharacterDoc({ classId: "druid", level: 5 });
    doc.session.hp.current = 44;
    const bodyScores = { ...doc.character.abilityScores };
    const bodyAc = doc.character.acOverride ?? null;
    const bodyTemp = doc.session.hp.temp;
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().assumePolymorphForm("brown-bear");
    const bear = getBeast("brown-bear");
    if (!bear) throw new Error("brown-bear missing");
    return { bodyScores, bodyAc, bodyTemp, bearHp: bear.hp };
  };

  it("casting ANOTHER concentration spell (swap) ends the form + restores the body", () => {
    const { bodyScores, bodyAc, bodyTemp } = assumeBear();
    // The normal cast path swaps concentration → the Polymorph form must end.
    useCharacterStore.getState().setConcentration(concentrationValue("haste"));
    const after = useCharacterStore.getState().character;
    if (!after) throw new Error("no doc");
    expect(after.session.polymorphForm).toBeUndefined();
    expect(after.character.abilityScores).toEqual(bodyScores);
    expect(after.character.acOverride ?? null).toBe(bodyAc);
    expect(after.session.hp.temp).toBe(bodyTemp); // beast Temp HP retracted
    expect(after.session.concentration).toBe("haste");
  });

  it("manually CLEARING concentration ends the form + restores the body (undoable)", () => {
    const { bodyScores, bodyAc, bodyTemp, bearHp } = assumeBear();
    useCharacterStore.getState().setConcentration("");
    const after = useCharacterStore.getState().character;
    if (!after) throw new Error("no doc");
    expect(after.session.polymorphForm).toBeUndefined();
    expect(after.character.abilityScores).toEqual(bodyScores);
    expect(after.character.acOverride ?? null).toBe(bodyAc);
    expect(after.session.hp.temp).toBe(bodyTemp);
    expect(after.session.concentration).toBe("");

    // The stopped-concentrating undo restores the WHOLE pre-clear state (form + temp HP).
    const undo = useToastStore
      .getState()
      .toasts.find((t) => t.intent?.kind === "stopped-concentrating");
    expect(undo?.onUndo).toBeDefined();
    undo?.onUndo?.();
    const restored = useCharacterStore.getState().character;
    if (!restored) throw new Error("no doc");
    expect(restored.session.polymorphForm?.beastId).toBe("brown-bear");
    expect(restored.session.hp.temp).toBe(bearHp);
    expect(restored.session.concentration).toBe("polymorph");
  });
});

// ── C2 — the form ends when Temporary HP is depleted (2024 RAW's PRIMARY
//    end-trigger: "the spell ends early on the target if it has no Temporary Hit
//    Points left"). No maintenance save — the spell simply ends. ───────────────
describe("C2 — depleting the Beast Temp HP ends the form (no CON maintenance save)", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  it("exactly-N damage to a form with N Temp HP ends the form, restores the body, NO CON-save toast", () => {
    const doc = makeCharacterDoc({ classId: "druid", level: 5 });
    doc.session.hp.current = 44;
    const bodyScores = { ...doc.character.abilityScores };
    const bodyAc = doc.character.acOverride ?? null;
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().assumePolymorphForm("brown-bear");
    const bear = getBeast("brown-bear");
    if (!bear) throw new Error("brown-bear missing");
    // Sanity: Temp HP = the Beast HP, form active, real HP untouched.
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(bear.hp);

    // Take EXACTLY the Beast HP in damage → Temp HP hits 0 while real HP is untouched.
    useCharacterStore.getState().applyDamage(bear.hp);

    const after = useCharacterStore.getState().character;
    if (!after) throw new Error("no doc");
    expect(after.session.polymorphForm).toBeUndefined();
    expect(after.character.abilityScores).toEqual(bodyScores);
    expect(after.character.acOverride ?? null).toBe(bodyAc);
    expect(after.session.concentration).toBe("");
    expect(after.session.hp.temp).toBe(0);
    expect(after.session.hp.current).toBe(44); // temp absorbed all — real HP intact

    // The spell ENDS outright: a concentration-dropped/form-ended intent, NEVER a CON save.
    const intents = useToastStore.getState().toasts.map((t) => t.intent?.kind);
    expect(intents).not.toContain("concentration-save");
    expect(intents).toContain("concentration-dropped");
  });
});

// ── The Concentration CON-save uses the BEAST's CON (S7, mirrors the Wild-Shape
//    S7 test in character-store.test.ts) ───────────────────────────────────────
describe("the Concentration CON save uses the BEAST's CON while polymorphed", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  // Assume a Beast, take damage while concentrating (its Temp HP absorbs the hit,
  // so the SAVE — not a 0-HP break — fires), and read the toast's CON-save total.
  const saveBonusForBeast = (beastId: string): number => {
    const doc = makeCharacterDoc({ classId: "druid", level: 8 });
    doc.session.hp.current = 44;
    doc.character.savingThrows = []; // isolate the SCORE effect from proficiency
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().assumePolymorphForm(beastId);
    useCharacterStore.getState().applyDamage(10);
    const intent = useToastStore.getState().toasts.at(-1)?.intent;
    if (intent?.kind !== "concentration-save") {
      throw new Error("expected a concentration-save toast");
    }
    return intent.saveBonus;
  };

  it("the save total moves by exactly the Beast CON-modifier delta", () => {
    // Giant Spider CON 12 (+1) vs Polar Bear CON 16 (+3): the SAME druid, the only
    // change is the override-carried CON the assume-form stamps.
    const spider = saveBonusForBeast("giant-spider"); // CON 12 → +1
    useCharacterStore.getState().setCharacter(null);
    useToastStore.setState({ toasts: [] });
    const bear = saveBonusForBeast("polar-bear"); // CON 16 → +3
    expect(bear - spider).toBe(2);
  });
});

// ── Phase 2 review — the two relaxed catalogue invariants must not break the
//    render path. A flat-integer `damageDice` ("1", no die) and a zero-length
//    `attacks` array are now VALID catalogue shapes (Rat / Seahorse); this
//    proves the whole presenter chain (resolveActions → localizeAction →
//    weaponFacts, the SAME seam BeastFormPicker + the Play board read) builds
//    without throwing and passes the flat string through UNMODIFIED — nothing
//    parses/splits `damageDice` on "d" anywhere in the render path.
describe("edge-case Beast shapes render safely (flat damage / zero attacks)", () => {
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  it('a flat-damage form (Rat, damageDice: "1") resolves + localizes without throwing', () => {
    const doc = makeCharacterDoc({ classId: "druid", level: 5 });
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().assumePolymorphForm("rat");
    const after = useCharacterStore.getState().character;
    if (!after) throw new Error("no doc");

    const rows = resolveActions(after);
    const bite = rows.find((r) => r.id === "beast-attack-rat-0");
    expect(bite, "Rat bite row rendered").toBeDefined();
    if (!bite) throw new Error("Rat bite row missing");
    expect(bite.summary.damage).toBe("1");

    // The full presenter chain — the SAME one `WeaponFacts`/`BeastFormPicker`
    // render from — must not throw, and the flat integer must pass through
    // verbatim (no die-splitting anywhere in the seam).
    expect(() => localizeAction(bite, "en")).not.toThrow();
    const view = localizeAction(bite, "en");
    expect(view.weaponFacts?.damageOneHanded).toBe("1");
  });

  it("a zero-attack form (Seahorse) resolves without throwing and emits NO beast-attack rows", () => {
    const doc = makeCharacterDoc({ classId: "druid", level: 5 });
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().assumePolymorphForm("seahorse");
    const after = useCharacterStore.getState().character;
    if (!after) throw new Error("no doc");

    expect(() => resolveActions(after)).not.toThrow();
    const rows = resolveActions(after);
    expect(rows.some((r) => r.id.startsWith("beast-attack-"))).toBe(false);
  });
});
