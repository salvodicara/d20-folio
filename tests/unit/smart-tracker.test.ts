import { describe, it, expect, vi } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import { localizeActions } from "@/lib/views/combat-action-view";
import { resolveActions, equipmentQuantityOf } from "@/lib/smart-tracker";
import { SRD_WEAPONS } from "@/data/weapons";
import { getEquipment } from "@/data/equipment";
import { buildDevScenario, buildScenario } from "@/lib/dev-scenarios";
import { consumableActionSlot } from "@/lib/srd-resolve";
import { combatVerdict } from "@/features/character/center/tabs/combat-card-helpers";
import { spellInstanceCount } from "@/lib/utils";
import type { CharacterDoc } from "@/types/character";

// ─── Minimal character fixture ────────────────────────────────────────────────

function makeChar(
  overrides: Partial<CharacterDoc["character"]> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {}
): CharacterDoc {
  return {
    id: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("Fighter"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "fighter", level: 5 }],
      background: "soldier",
      alignment: asAlignmentId("neutral-good"),
      playerName: "Tester",
      speed: "30 ft",
      ac: 16,
      armorNote: "",
      hp: { max: 44 },
      hitDieType: 10,
      languageIds: ["common"],
      customLanguages: [],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      abilityBudget: 27,
      proficiencyBonusOverride: null,
      levelUpChecklist: null,
      backgroundAsi: {},
      humanOriginFeat: "",
      bgFeat: "",
      lore: {
        traits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        backstory: "",
        age: "",
        height: "",
        weight: "",
        eyes: "",
        hair: "",
        skin: "",
      },
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
      skills: {},
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: [],
      equipment: [],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
      ...foldLegacyClass(overrides, "fighter"),
    },
    session: {
      hp: { current: 44, temp: 0 },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 50, ep: 0, sp: 0, cp: 0 },
      concentration: "",
      initiative: "",
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      inspiration: false,
      exhaustion: 0,
      pinnedActions: [],
      unpinnedActions: [],
      notes: "",
      logEntries: [],
    },
  };
}

// ─── Dual-Wield Detection ─────────────────────────────────────────────────────

describe("resolveActions — dual-wield", () => {
  it("emits NO off-hand action for a single light melee weapon", () => {
    const char = makeChar({ weapons: [{ srdId: "shortsword", quantity: 1 }] });
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    expect(offHand).toHaveLength(0);
  });

  it("emits an off-hand action when ONE Light weapon is carried in quantity ≥2 (a pair of daggers)", () => {
    // Root-cause regression: the dual-wield gate must count by QUANTITY, not
    // entries. Two daggers stored as a single entry (quantity 2) are two weapons,
    // so Two-Weapon Fighting applies — one off-hand bonus attack with the pair.
    const char = makeChar({ weapons: [{ srdId: "dagger", quantity: 2 }] });
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    expect(offHand).toHaveLength(1);
    expect(offHand[0]?.type).toBe("bonus");
    expect(offHand[0]?.name).toMatch(/\(off-hand\)$/);
    // The engine TAGS the off-hand + the Light main attack so the UI can gate the
    // off-hand on a committed Light-weapon attack (separation of concerns).
    expect(offHand[0]?.offhand).toBe(true);
    const mainDagger = actions.find((a) => a.name === "Dagger" && !a.offhand);
    expect(mainDagger?.lightWeapon).toBe(true);
  });

  it("emits off-hand bonus actions for two light melee weapons", () => {
    const char = makeChar({
      weapons: [
        { srdId: "shortsword", quantity: 1 },
        { srdId: "dagger", quantity: 1 },
      ],
    });
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    expect(offHand).toHaveLength(2);
    offHand.forEach((a) => {
      expect(a.type).toBe("bonus");
      expect(a.source).toBe("weapon");
      expect(a.name).toMatch(/\(off-hand\)$/);
    });
  });

  it("emits NO off-hand action for two non-light weapons (longsword + battleaxe)", () => {
    const char = makeChar({
      weapons: [
        { srdId: "longsword", quantity: 1 },
        { srdId: "battleaxe", quantity: 1 },
      ],
    });
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    expect(offHand).toHaveLength(0);
  });

  it("off-hand damage has NO ability modifier by default (RAW)", () => {
    // STR mod = +3 for our fixture (STR 16)
    const char = makeChar({
      weapons: [
        { srdId: "shortsword", quantity: 1 },
        { srdId: "dagger", quantity: 1 },
      ],
    });
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    // Damage should be just the die (e.g. "1d6") with no "+3"
    offHand.forEach((a) => {
      expect(a.summary.damage).not.toMatch(/\+\d/);
      expect(a.summary.damage).not.toMatch(/-\d/);
    });
  });

  // RA-13 — SRD "Mastery Properties — Nick": the Light property's extra attack
  // is made as part of the ATTACK action instead of as a Bonus Action (once per
  // turn). A Nick-mastered off-hand row therefore joins the FREE economy group;
  // WITHOUT the mastery pick it stays a Bonus Action — the baseline dual-wield
  // test above ("a pair of daggers") already pins `type === "bonus"`.
  it("RA-13 — a Nick-mastered off-hand row is FREE (part of the Attack action)", () => {
    const char = makeChar({ weapons: [{ srdId: "dagger", quantity: 2 }] });
    const entry = char.character.classes[0];
    if (!entry) throw new Error("no class entry");
    entry.weaponMasteries = ["dagger"];
    const offHand = localizeActions(char, "en").filter((a) => a.id.includes("-offhand"));
    expect(offHand).toHaveLength(1);
    expect(offHand[0]?.type).toBe("free");
    // The Nick chip (with its glossary teach) still rides the row.
    expect(
      offHand[0]?.weaponFacts?.chips.some((c) => c.kind === "mastery" && c.id === "nick")
    ).toBe(true);
  });

  // RA-13 — Topple's save DC (8 + attack mod + PB) and Graze's on-miss damage
  // (= the attack ability modifier) resolve onto the mastery chips — the app
  // has the numbers, so the player never computes them (SRD "Mastery
  // Properties — Topple / Graze").
  it("RA-13 — Topple/Graze chips carry the live resolved numbers", () => {
    const char = makeChar({
      weapons: [
        { srdId: "quarterstaff", quantity: 1 },
        { srdId: "glaive", quantity: 1 },
      ],
    });
    const entry = char.character.classes[0];
    if (!entry) throw new Error("no class entry");
    entry.weaponMasteries = ["quarterstaff", "glaive"];
    const actions = localizeActions(char, "en");
    // Fighter L5: STR 16 (+3), PB 3 → Topple DC 8+3+3 = 14; Graze damage = 3.
    const staff = actions.find((a) => a.id === "weapon-quarterstaff");
    expect(staff?.weaponFacts?.chips.find((c) => c.id === "topple")?.label).toBe(
      "Topple · DC 14"
    );
    const glaive = actions.find((a) => a.id === "weapon-glaive");
    expect(glaive?.weaponFacts?.chips.find((c) => c.id === "graze")?.label).toBe(
      "Graze · 3"
    );
    // The raw numbers are a facts-block concern — stripped from the display summary.
    expect(staff?.summary.masteryDetail).toBeUndefined();
    // An unmastered weapon resolves NO detail (the chip itself is gated already).
    const bare = makeChar({ weapons: [{ srdId: "quarterstaff", quantity: 1 }] });
    const bareStaff = localizeActions(bare, "en").find(
      (a) => a.id === "weapon-quarterstaff"
    );
    expect(bareStaff?.weaponFacts?.chips.some((c) => c.kind === "mastery")).toBe(false);
  });

  it("off-hand damage includes ability modifier when Two-Weapon Fighting style is active", () => {
    const char = makeChar({
      weapons: [
        { srdId: "shortsword", quantity: 1 },
        { srdId: "dagger", quantity: 1 },
      ],
      features: [{ srdId: "two-weapon-fighting" }],
    });
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    // With STR 16 → mod +3, finesse shortsword uses higher of STR/DEX (+3), so damage = "1d6+3"
    offHand.forEach((a) => {
      expect(a.summary.damage).toMatch(/\+\d/);
    });
  });

  it("off-hand cards use Italian locale labels", () => {
    const char = makeChar({
      weapons: [
        { srdId: "shortsword", quantity: 1 },
        { srdId: "dagger", quantity: 1 },
      ],
    });
    const actions = localizeActions(char, "it");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    expect(offHand).toHaveLength(2);
    offHand.forEach((a) => {
      expect(a.name).toMatch(/\(mano secondaria\)$/);
    });
  });

  it("off-hand cards are defaultPinned and pinned by default", () => {
    const char = makeChar({
      weapons: [
        { srdId: "shortsword", quantity: 1 },
        { srdId: "dagger", quantity: 1 },
      ],
    });
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    offHand.forEach((a) => {
      expect(a.defaultPinned).toBe(true);
      expect(a.pinned).toBe(true);
    });
  });

  it("off-hand cards respect the unpinnedActions blacklist", () => {
    const char = makeChar({
      weapons: [
        { srdId: "shortsword", quantity: 1 },
        { srdId: "dagger", quantity: 1 },
      ],
    });
    // Manually unpin the shortsword off-hand
    char.session.unpinnedActions = ["weapon-shortsword-offhand"];
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    const shortSwordOH = offHand.find((a) => a.id === "weapon-shortsword-offhand");
    const daggerOH = offHand.find((a) => a.id === "weapon-dagger-offhand");
    expect(shortSwordOH?.pinned).toBe(false);
    expect(daggerOH?.pinned).toBe(true);
  });

  it("does not count ranged Light weapons (light crossbow) toward dual-wield", () => {
    // light-crossbow is Light but ranged — should not count
    const char = makeChar({
      weapons: [
        { srdId: "dagger", quantity: 1 },
        { srdId: "light-crossbow", quantity: 1 },
      ],
    });
    const actions = localizeActions(char, "en");
    const offHand = actions.filter((a) => a.id.includes("-offhand"));
    // Only 1 light MELEE weapon → no dual-wield
    expect(offHand).toHaveLength(0);
  });

  // ── E2a — damage riders ride the OFF-HAND row through the shared resolver ──
  // The off-hand hit is a real weapon hit: a PER-HIT melee rider ("each time you
  // hit" — Divine Favor / Hunter's Mark / Paladin Radiant Strikes) applies to it
  // and must show on BOTH the main AND off-hand rows. A ONCE-PER-TURN rider
  // (Zealot Divine Fury — "the first time on your turn") fires once and is
  // surfaced on the MAIN row only; double-listing it on the off-hand would
  // wrongly imply it applies twice in a turn. Both route through the SAME
  // `resolveAttackDamageRiders` the main row uses (golden rule 6); the off-hand
  // call drops `oncePerTurn` riders.
  const riderDice = (
    a:
      | { summary: { extraDamage?: ReadonlyArray<{ dice?: string; source?: unknown }> } }
      | undefined,
    sourceId: string
  ) =>
    a?.summary.extraDamage?.find((d) => JSON.stringify(d.source).includes(sourceId))
      ?.dice;

  it("PER-HIT melee rider (Paladin Radiant Strikes) rides BOTH the main AND off-hand rows", () => {
    // Paladin 11 dual-wielding two shortswords. Radiant Strikes (+1d8 Radiant,
    // per-hit, NOT once/turn) rides every melee hit — main hand AND off-hand.
    const char = makeChar({
      classes: [{ classId: "paladin", level: 11 }],
      weapons: [{ srdId: "shortsword", quantity: 2 }],
      features: [{ srdId: "paladin-radiant-strikes" }],
    });
    const actions = resolveActions(char);
    const main = actions.find((a) => a.id === "weapon-shortsword" && !a.offhand);
    const offHand = actions.find((a) => a.id === "weapon-shortsword-offhand");
    expect(main).toBeDefined();
    expect(offHand).toBeDefined();
    // Fail-before: the off-hand row carried NO extraDamage — the per-hit rider
    // was missing. Both rows now show the SAME resolved 1d8 Radiant chip.
    expect(riderDice(main, "paladin-radiant-strikes")).toBe("1d8");
    expect(riderDice(offHand, "paladin-radiant-strikes")).toBe("1d8");
  });

  it("ONCE-PER-TURN rider (Berserker Frenzy) shows on the MAIN row only, not double-listed on the off-hand", () => {
    // A raging Berserker dual-wielding two shortswords. Frenzy is a
    // once-per-turn rider — it rides the main hand but must NOT double-list on
    // the off-hand (it can only fire once in the turn).
    const char = makeChar({
      classes: [{ classId: "barbarian", subclassId: "berserker", level: 3 }],
      weapons: [{ srdId: "shortsword", quantity: 2 }],
      features: [{ srdId: "barbarian-rage" }, { srdId: "barbarian-berserker-frenzy" }],
    });
    char.session.activeFeatures = ["barbarian-rage"];
    const actions = resolveActions(char);
    const main = actions.find((a) => a.id === "weapon-shortsword" && !a.offhand);
    const offHand = actions.find((a) => a.id === "weapon-shortsword-offhand");
    expect(main).toBeDefined();
    expect(offHand).toBeDefined();
    // The main row carries the once-per-turn rider…
    expect(riderDice(main, "barbarian-berserker-frenzy")).toBeDefined();
    // …but the off-hand does NOT (no regression: still single-listed on main).
    expect(riderDice(offHand, "barbarian-berserker-frenzy")).toBeUndefined();
  });

  // W9 — the Dueling fighting style's one-handed-melee rider scoping exercises
  // PACK content (Dueling is non-SRD): content-pack/tests/unit/
  // smart-tracker.pack.test.ts.
});

// ─── RA-14 — Tracked ammunition + Loading advisory ───────────────────────────

describe("RA-14 — declared weapon ammunition (data integrity)", () => {
  const hasAmmoProp = (w: (typeof SRD_WEAPONS)[number]): boolean =>
    (w.properties ?? []).some((p) => /^Ammunition\b/i.test(p));

  it("every Ammunition-property weapon declares a valid ammunitionId gear id", () => {
    // The rule-6 single-source guarantee: the declared ammo id must point at a
    // real gear row. This is what makes prose-parsing unnecessary — the fact is
    // data, and this guard proves the data is complete + well-formed.
    const ammoWeapons = SRD_WEAPONS.filter(hasAmmoProp);
    // PIN the exact set size — the `hasAmmoProp` regex is this guard's ORACLE for
    // which weapons MUST declare an ammo id, so a property reformat that stopped
    // matching (or a new Ammunition weapon) would silently shrink/grow the guarded
    // set and slip past a bare `> 0`. The SRD 2024 has exactly 9 Ammunition
    // weapons (3 bows/sling-family, 3 crossbows, blowgun, musket, pistol); bump
    // this number in the same commit that adds one.
    expect(ammoWeapons.length).toBe(9);
    for (const w of ammoWeapons) {
      const ammoId = w.ammunitionId;
      expect(ammoId, `${w.id} must declare ammunitionId`).toBeTruthy();
      if (!ammoId) continue; // narrows for the lookup below
      const gear = getEquipment(ammoId);
      expect(gear, `${w.id} → ${ammoId} must be a real gear item`).toBeDefined();
      expect(gear?.category).toBe("gear");
    }
  });

  it("no weapon WITHOUT the Ammunition property declares an ammunitionId", () => {
    for (const w of SRD_WEAPONS.filter((w) => !hasAmmoProp(w))) {
      expect(w.ammunitionId, `${w.id} must not declare ammunitionId`).toBeUndefined();
    }
  });

  it("resolves each ranged weapon to its DECLARED gear row (an id, never a parsed token)", () => {
    // The disambiguation the old prose-parse could not do: the Sling and the two
    // firearms all print "; Bullet", yet each names a DIFFERENT ammo stock.
    const expected: Record<string, string> = {
      shortbow: "arrows",
      longbow: "arrows",
      "light-crossbow": "crossbow-bolts",
      "hand-crossbow": "crossbow-bolts",
      "heavy-crossbow": "crossbow-bolts",
      sling: "sling-bullets",
      blowgun: "blowgun-needles",
      musket: "firearm-bullets",
      pistol: "firearm-bullets",
    };
    for (const [id, ammoId] of Object.entries(expected)) {
      const weapon = SRD_WEAPONS.find((w) => w.id === id);
      expect(weapon?.ammunitionId, id).toBe(ammoId);
    }
  });
});

describe("RA-14 — equipmentQuantityOf", () => {
  it("returns null when NO matching row exists (untracked)", () => {
    expect(
      equipmentQuantityOf([{ srdId: "longsword", quantity: 1 }], "arrows")
    ).toBeNull();
    expect(equipmentQuantityOf([], "arrows")).toBeNull();
  });

  it("returns 0 for a tracked-but-empty row (distinct from untracked)", () => {
    expect(equipmentQuantityOf([{ srdId: "arrows", quantity: 0 }], "arrows")).toBe(0);
  });

  it("sums the quantity across every matching row (a bare row counts as 1)", () => {
    expect(
      equipmentQuantityOf(
        [
          { srdId: "arrows", quantity: 10 },
          { srdId: "arrows", quantity: 8 },
          { srdId: "arrows" }, // no quantity → counts as 1
          { srdId: "longsword", quantity: 1 },
        ],
        "arrows"
      )
    ).toBe(19);
  });

  it("ignores custom (homebrew) rows — only SRD rows are tracked", () => {
    expect(
      equipmentQuantityOf(
        [{ custom: true, name: "Special Arrows", quantity: 99 }],
        "arrows"
      )
    ).toBeNull();
  });
});

describe("RA-14 — resolveWeaponActions stamps ammo + loading", () => {
  it("stamps ammo (id + live count) for a ranged weapon with a matching inventory row", () => {
    const char = makeChar({
      weapons: [{ srdId: "shortbow", quantity: 1 }],
      equipment: [{ srdId: "arrows", quantity: 18 }],
    });
    const bow = localizeActions(char, "en").find((a) => a.id === "weapon-shortbow");
    expect(bow?.summary.ammo).toEqual({ itemId: "arrows", remaining: 18 });
    // A plain bow is NOT a Loading weapon.
    expect(bow?.summary.loading).toBeUndefined();
  });

  it("stamps NO ammo when the ranged weapon has no matching inventory row (override-first)", () => {
    // A longbow with no arrow row carried: tracking ammo is the player's choice.
    const char = makeChar({ weapons: [{ srdId: "longbow", quantity: 1 }] });
    const bow = localizeActions(char, "en").find((a) => a.id === "weapon-longbow");
    expect(bow?.summary.ammo).toBeUndefined();
  });

  it("keeps a tracked-but-empty quiver visible (remaining 0), never dropping the field", () => {
    const char = makeChar({
      weapons: [{ srdId: "shortbow", quantity: 1 }],
      equipment: [{ srdId: "arrows", quantity: 0 }],
    });
    const bow = localizeActions(char, "en").find((a) => a.id === "weapon-shortbow");
    expect(bow?.summary.ammo).toEqual({ itemId: "arrows", remaining: 0 });
  });

  it("stamps loading:true for a Loading weapon (and its ammo when carried)", () => {
    const char = makeChar({
      weapons: [{ srdId: "light-crossbow", quantity: 1 }],
      equipment: [{ srdId: "crossbow-bolts", quantity: 20 }],
    });
    const xbow = localizeActions(char, "en").find(
      (a) => a.id === "weapon-light-crossbow"
    );
    expect(xbow?.summary.loading).toBe(true);
    expect(xbow?.summary.ammo).toEqual({ itemId: "crossbow-bolts", remaining: 20 });
  });

  it("stamps neither ammo nor loading for a melee weapon", () => {
    const char = makeChar({
      weapons: [{ srdId: "longsword", quantity: 1 }],
      equipment: [{ srdId: "arrows", quantity: 18 }],
    });
    const sword = localizeActions(char, "en").find((a) => a.id === "weapon-longsword");
    expect(sword?.summary.ammo).toBeUndefined();
    expect(sword?.summary.loading).toBeUndefined();
  });

  it("stamps the DECLARED firearm ammo for a musket — never the sling's bullets", () => {
    // Root-cause regression: the Musket and the Sling both PRINT "; Bullet", so
    // the old prose-parse resolved a firearm to sling-bullets. Carrying a musket
    // + BOTH ammo stocks, the DECLARED id must pick firearm-bullets and the
    // sling stock must stay untouched (its count differs, so a swap is visible).
    const char = makeChar({
      weapons: [{ srdId: "musket", quantity: 1 }],
      equipment: [
        { srdId: "firearm-bullets", quantity: 10 },
        { srdId: "sling-bullets", quantity: 20 },
      ],
    });
    const musket = localizeActions(char, "en").find((a) => a.id === "weapon-musket");
    expect(musket?.summary.ammo).toEqual({ itemId: "firearm-bullets", remaining: 10 });
  });

  it("stamps NO ammo for a firearm carrying only the sling's bullets (never the sling)", () => {
    // A musket with sling-bullets but no firearm-bullets carried: the declared id
    // is firearm-bullets, which has no inventory row → untracked. The unrelated
    // sling stock is never debited (the pre-fix bug).
    const char = makeChar({
      weapons: [{ srdId: "musket", quantity: 1 }],
      equipment: [{ srdId: "sling-bullets", quantity: 20 }],
    });
    const musket = localizeActions(char, "en").find((a) => a.id === "weapon-musket");
    expect(musket?.summary.ammo).toBeUndefined();
  });
});

// ─── Universal Base Combat Actions ───────────────────────────────────────────

describe("resolveActions — base actions", () => {
  it("always includes Dash, Dodge, Disengage, Help regardless of class", () => {
    const char = makeChar();
    const actions = localizeActions(char, "en");
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("base-dash");
    expect(ids).toContain("base-dodge");
    expect(ids).toContain("base-disengage");
    expect(ids).toContain("base-help");
  });

  it("includes Hide, Ready, Search, Grapple, Shove", () => {
    const char = makeChar();
    const actions = localizeActions(char, "en");
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("base-hide");
    expect(ids).toContain("base-ready");
    expect(ids).toContain("base-search");
    expect(ids).toContain("base-grapple");
    expect(ids).toContain("base-shove");
  });

  // RA-04 — Grapple/Shove are 2024 Unarmed Strike OPTIONS resolved by a target's
  // save vs DC 8 + STR mod + PB (wiring the previously-dead `unarmedStrikeSaveDc`),
  // NOT the 2014 "STR contest". The concrete DC rides the card as a save chip.
  it("RA-04 — Grapple/Shove carry the 2024 Unarmed Strike save DC, not a 2014 contest", () => {
    const char = makeChar(); // Fighter L5, STR 16 (+3), PB 3 → DC 8+3+3 = 14
    const actions = localizeActions(char, "en");
    const grapple = actions.find((a) => a.id === "base-grapple");
    const shove = actions.find((a) => a.id === "base-shove");
    expect(grapple?.summary.saveDC).toBe(14);
    expect(grapple?.summary.saveAbility).toBe("STR");
    expect(shove?.summary.saveDC).toBe(14);
    expect(shove?.summary.saveAbility).toBe("STR");
    // The wrong-edition "contest" wording is gone from both cards.
    expect(grapple?.summary.effect ?? "").not.toMatch(/contest/i);
    expect(shove?.summary.effect ?? "").not.toMatch(/contest/i);
    // A base action that forces NO save (Dash) carries no DC.
    expect(actions.find((a) => a.id === "base-dash")?.summary.saveDC).toBeUndefined();
  });

  it("RA-04 — the Unarmed Strike DC tracks STR + PB (STR 20 at L5 → DC 16)", () => {
    const char = makeChar({
      abilityScores: { STR: 20, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    });
    const grapple = localizeActions(char, "en").find((a) => a.id === "base-grapple");
    expect(grapple?.summary.saveDC).toBe(16); // 8 + 3 PB + 5 STR mod
  });

  // RA-12 — SRD 5.2.1 "Hide [Action]": a flat DC 15 Dexterity (Stealth) check;
  // success = the Invisible condition. The card carries the structured check
  // (ids only) so the UI renders a roll-entry whose outcome APPLIES.
  it("RA-12 — Hide carries the DC 15 Stealth check; other base actions don't", () => {
    const actions = localizeActions(makeChar(), "en");
    const hide = actions.find((a) => a.id === "base-hide");
    expect(hide?.summary.skillCheck).toEqual({ dc: 15, skill: "stealth" });
    // The corrected 2024 effect line teaches the rule (no bare "Stealth check").
    expect(hide?.summary.effect).toBe("DC 15 Stealth check → Invisible");
    expect(actions.find((a) => a.id === "base-dash")?.summary.skillCheck).toBeUndefined();
  });

  it("includes Opportunity Attack as a reaction", () => {
    const char = makeChar();
    const actions = localizeActions(char, "en");
    const oa = actions.find((a) => a.id === "base-opportunity-attack");
    expect(oa).toBeDefined();
    expect(oa?.type).toBe("reaction");
    expect(oa?.summary.trigger).toBeDefined();
  });

  it("all base action cards have type 'action' or 'reaction'", () => {
    const char = makeChar();
    const baseActions = localizeActions(char, "en").filter((a) =>
      a.id.startsWith("base-")
    );
    baseActions.forEach((a) => {
      expect(["action", "reaction"]).toContain(a.type);
    });
  });

  it("uses Italian locale names and effects", () => {
    const char = makeChar();
    const actions = localizeActions(char, "it");
    const dash = actions.find((a) => a.id === "base-dash");
    expect(dash?.name).toBe("Scatto");
    const oa = actions.find((a) => a.id === "base-opportunity-attack");
    expect(oa?.name).toBe("Attacco di Opportunità");
    expect(oa?.summary.trigger).toBe("nemico lascia portata");
  });

  it("base action cards are not defaultPinned and not pinned by default", () => {
    const char = makeChar();
    const baseActions = localizeActions(char, "en").filter((a) =>
      a.id.startsWith("base-")
    );
    baseActions.forEach((a) => {
      expect(a.defaultPinned).toBe(false);
      expect(a.pinned).toBe(false);
    });
  });

  it("base action card can be pinned via pinnedActions", () => {
    const char = makeChar();
    char.session.pinnedActions = ["base-dash", "base-dodge"];
    const actions = localizeActions(char, "en");
    const dash = actions.find((a) => a.id === "base-dash");
    const dodge = actions.find((a) => a.id === "base-dodge");
    const help = actions.find((a) => a.id === "base-help");
    expect(dash?.pinned).toBe(true);
    expect(dodge?.pinned).toBe(true);
    expect(help?.pinned).toBe(false);
  });

  it("base actions have an effect summary and no attack bonus or damage", () => {
    const char = makeChar();
    const baseActions = localizeActions(char, "en").filter((a) =>
      a.id.startsWith("base-")
    );
    baseActions.forEach((a) => {
      expect(a.summary.effect).toBeTruthy();
      expect(a.summary.attackBonus).toBeUndefined();
      expect(a.summary.damage).toBeUndefined();
      expect(a.costsSlot).toBe(false);
    });
  });
});

// ─── Potion Cards ─────────────────────────────────────────────────────────────

describe("resolveActions — potions", () => {
  it("emits a bonus action card for a custom potion in equipment", () => {
    const char = makeChar({
      equipment: [
        {
          custom: true,
          name: "Pozione di Guarigione",
          quantity: 2,
          isPotion: true,
          potionFormula: "2d4+2",
        },
      ],
    });
    const actions = localizeActions(char, "it");
    const potion = actions.find((a) => a.id.startsWith("item-custom-"));
    expect(potion).toBeDefined();
    expect(potion?.type).toBe("bonus");
    expect(potion?.summary.healing).toBe("2d4+2");
    expect(potion?.summary.uses).toEqual({ current: 2, total: 2 });
    expect(potion?.name).toBe("Pozione di Guarigione");
    expect(potion?.costEquipment).toBe("custom-Pozione di Guarigione");
  });

  // REGRESSION (owner 2026-06-08): "a Potion of Healing in the inventory doesn't show
  // up as an action in the combat tab." potion-of-healing is a MAGIC item, and a
  // minimized/imported ref carries ONLY its srdId + quantity (no isPotion/potionFormula
  // — those were dropped by the v2 schema). The drink action must derive potion-ness +
  // the heal formula from the SRD catalogue, not from stale ref flags. Fails before the
  // fix (the loop required itemRef.isPotion/potionFormula → skipped the minimal ref).
  it("emits a drink action for a MINIMAL SRD magic-item potion (no ref flags)", () => {
    const char = makeChar({
      equipment: [{ srdId: "potion-of-healing", quantity: 3 }],
    });
    const en = localizeActions(char, "en");
    const potion = en.find((a) => a.id === "item-potion-of-healing");
    expect(potion).toBeDefined();
    expect(potion?.type).toBe("bonus");
    expect(potion?.summary.healing).toBe("2d4+2"); // from magic-item potionFormula
    expect(potion?.summary.uses).toEqual({ current: 3, total: 3 });
    expect(potion?.name).toBe("Potion of Healing"); // from the magic-item index, not a slug
    expect(potion?.costEquipment).toBe("potion-of-healing"); // spends a unit on use
    // Localized (IT) — proves the name resolves through the catalogue, not slug-casing.
    const it = localizeActions(char, "it");
    expect(it.find((a) => a.id === "item-potion-of-healing")?.name).toBe(
      "Pozione di Guarigione"
    );
  });

  // REGRESSION (owner 2026-06-08): the inventory badge showed the potion GREEN
  // (Action) when it should be BLUE (Bonus Action). The economy-slot colour is keyed
  // universally off the slot, so the bug was the slot value — the inventory hardcoded
  // "action". Both the inventory badge and the combat card now derive the slot from
  // the ONE shared `consumableActionSlot`, so they can never disagree (golden rule 6).
  it("encodes the action-economy slot from one shared helper (potion → bonus)", () => {
    expect(consumableActionSlot({ isPotion: true, isConsumable: true })).toBe("bonus");
    expect(consumableActionSlot({ isPotion: false, isConsumable: true })).toBe("action");
    expect(consumableActionSlot({ isPotion: false, isConsumable: false })).toBe("free");
    // The combat action the engine emits for a potion carries that same bonus slot.
    const char = makeChar({ equipment: [{ srdId: "potion-of-healing", quantity: 1 }] });
    const potion = localizeActions(char, "en").find(
      (a) => a.id === "item-potion-of-healing"
    );
    expect(potion?.type).toBe("bonus");
  });

  it("does not emit a card for a potion with quantity 0", () => {
    const char = makeChar({
      equipment: [
        {
          custom: true,
          name: "Healing Potion",
          quantity: 0,
          isPotion: true,
          potionFormula: "2d4+2",
        },
      ],
    });
    const actions = localizeActions(char, "en");
    const potion = actions.find((a) => a.id.startsWith("item-"));
    expect(potion).toBeUndefined();
  });

  it("does not emit a card for equipment without isPotion flag", () => {
    const char = makeChar({
      equipment: [
        {
          custom: true,
          name: "Torch",
          quantity: 5,
          isPotion: false,
          potionFormula: undefined,
        },
      ],
    });
    const actions = localizeActions(char, "en");
    expect(actions.find((a) => a.id.startsWith("item-"))).toBeUndefined();
  });

  it("potion card shows quantity as uses tracker", () => {
    const char = makeChar({
      equipment: [
        {
          custom: true,
          name: "Potion of Healing",
          quantity: 3,
          isPotion: true,
          potionFormula: "2d4+2",
        },
      ],
    });
    const actions = localizeActions(char, "en");
    const potion = actions.find((a) => a.id.startsWith("item-custom-"));
    expect(potion?.summary.uses).toEqual({ current: 3, total: 3 });
  });

  it("potion card is not defaultPinned", () => {
    const char = makeChar({
      equipment: [
        {
          custom: true,
          name: "Potion of Healing",
          quantity: 1,
          isPotion: true,
          potionFormula: "2d4+2",
        },
      ],
    });
    const actions = localizeActions(char, "en");
    const potion = actions.find((a) => a.id.startsWith("item-custom-"));
    expect(potion?.defaultPinned).toBe(false);
  });

  it("multiple different potions each get their own card", () => {
    const char = makeChar({
      equipment: [
        {
          custom: true,
          name: "Potion of Healing",
          quantity: 2,
          isPotion: true,
          potionFormula: "2d4+2",
        },
        {
          custom: true,
          name: "Potion of Greater Healing",
          quantity: 1,
          isPotion: true,
          potionFormula: "4d4+4",
        },
      ],
    });
    const actions = localizeActions(char, "en");
    const potions = actions.filter((a) => a.id.startsWith("item-custom-"));
    expect(potions).toHaveLength(2);
    const formulas = potions.map((p) => p.summary.healing);
    expect(formulas).toContain("2d4+2");
    expect(formulas).toContain("4d4+4");
  });

  it("costEquipment uses srdId for SRD potions", () => {
    const char = makeChar({
      equipment: [
        { srdId: "healing-potion", quantity: 3, isPotion: true, potionFormula: "2d4+2" },
      ],
    });
    const actions = localizeActions(char, "en");
    const potion = actions.find((a) => a.id === "item-healing-potion");
    expect(potion?.costEquipment).toBe("healing-potion");
  });

  it("costEquipment uses custom- prefix for custom potions", () => {
    const char = makeChar({
      equipment: [
        {
          custom: true,
          name: "Elixir of Life",
          quantity: 1,
          isPotion: true,
          potionFormula: "8d4+8",
        },
      ],
    });
    const actions = localizeActions(char, "en");
    const potion = actions.find((a) => a.id.startsWith("item-custom-"));
    expect(potion?.costEquipment).toBe("custom-Elixir of Life");
  });
});

// ─── S8 ROLL-ENTRY — dice self-heal apply seam ───────────────────────────────

/**
 * S8 surfaces a self-heal ACTION (Second Wind: "1d10 + Fighter level") with a
 * STRUCTURED `summary.healApply` ({ dice, bonus }) so the card can offer a
 * roll-entry-then-apply affordance. Golden rule 21: the app NEVER rolls — `dice`
 * is the portion the PLAYER supplies, `bonus` is the deterministic part the engine
 * resolved (multiclass-correct, the owning class's level). The card applies
 * `enteredRoll + bonus`; no fabricated die total is ever auto-applied.
 *
 * Pure: asserted against the producing presenter (`localizeActions`), not a DOM
 * mount (golden rule 13).
 */
describe("resolveActions — S8 dice self-heal carries a roll-entry apply field", () => {
  it("Second Wind (Fighter 5) exposes healApply = { dice: 1d10, bonus: 5 }", () => {
    const char = makeChar({
      classes: [{ classId: "fighter", level: 5 }],
      features: [{ srdId: "fighter-second-wind" }],
    });
    const sw = localizeActions(char, "en").find(
      (a) => a.id === "fighter-second-wind-bonus"
    );
    expect(sw, "Fighter should surface a Second Wind bonus action").toBeTruthy();
    // The roll-entry payload: the DIE the player rolls + the DETERMINISTIC bonus.
    expect(sw?.summary.healApply).toEqual({ dice: "1d10", bonus: 5 });
    // The display chip still shows the full formula (the player sees what to roll).
    expect(sw?.summary.healing).toBe("1d10+5");
  });

  it("the deterministic bonus is the OWNING class level (multiclass-correct)", () => {
    // A Fighter 3 / Wizard 5 → Second Wind heals 1d10 + 3 (Fighter level), NOT 8.
    const char = makeChar({
      classes: [
        { classId: "fighter", level: 3 },
        { classId: "wizard", level: 5 },
      ],
      features: [{ srdId: "fighter-second-wind" }],
    });
    const sw = localizeActions(char, "en").find(
      (a) => a.id === "fighter-second-wind-bonus"
    );
    expect(sw?.summary.healApply).toEqual({ dice: "1d10", bonus: 3 });
  });

  it("a FLAT/string heal (potion) carries NO healApply — only dice-action heals do", () => {
    // A potion sets `summary.healing` (a string), never the structured `heal` —
    // so it gets no roll-entry apply field (it isn't a self-targeting feature heal).
    const char = makeChar({ equipment: [{ srdId: "potion-of-healing", quantity: 1 }] });
    const potion = localizeActions(char, "en").find(
      (a) => a.id === "item-potion-of-healing"
    );
    expect(potion?.summary.healing).toBe("2d4+2");
    expect(potion?.summary.healApply).toBeUndefined();
  });
});

// ─── Cross-Feature Cost Tracker (Focus Points) ───────────────────────────────

// ─── Custom Spells in Combat Panel ───────────────────────────────────────────

describe("resolveActions — custom spells", () => {
  function makeSpellcaster() {
    return makeChar({
      classes: [{ classId: "bard", level: 5 }],
      spellcasting: {
        ability: "CHA",
        preparedCaster: false,
        preparedMax: 0,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 2 },
      ],
    });
  }

  it("includes a custom action-type spell in combat actions", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "Dragon Breath",
        level: 2,
        school: "evocation",
        castingTime: "action",
        range: "Self",
        components: { v: false, s: true, m: false },
        duration: "1 minute",
        concentration: false,
        description: "Breathe fire.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-dragon-breath");
    expect(spell).toBeDefined();
    expect(spell?.type).toBe("action");
    expect(spell?.source).toBe("spell");
    expect(spell?.spellLevel).toBe(2);
    expect(spell?.costsSlot).toBe(true);
    expect(spell?.slotLevel).toBe(2);
    expect(spell?.concentration).toBe(false);
    expect(spell?.name).toBe("Dragon Breath");
  });

  it("custom bonus-action spell gets type 'bonus'", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "Swift Mend",
        level: 1,
        school: "conjuration",
        castingTime: "bonus",
        range: "Touch",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "Quick heal.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-swift-mend");
    expect(spell).toBeDefined();
    expect(spell?.type).toBe("bonus");
    expect(spell?.costsSlot).toBe(true);
  });

  it("custom reaction spell gets type 'reaction'", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "Counter Ward",
        level: 3,
        school: "abjuration",
        castingTime: "reaction",
        range: "60 feet",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "Counter a spell.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-counter-ward");
    expect(spell).toBeDefined();
    expect(spell?.type).toBe("reaction");
  });

  it("custom cantrip (level 0) appears but does not cost a slot", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "Chaos Spark",
        level: 0,
        school: "evocation",
        castingTime: "action",
        range: "60 feet",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "A spark of chaos.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-chaos-spark");
    expect(spell).toBeDefined();
    expect(spell?.costsSlot).toBe(false);
    expect(spell?.slotLevel).toBeUndefined();
    expect(spell?.spellLevel).toBe(0);
  });

  it("custom concentration spell has concentration: true", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "Arcane Veil",
        level: 2,
        school: "abjuration",
        castingTime: "action",
        range: "Self",
        components: { v: true, s: true, m: false },
        duration: "Up to 1 minute",
        concentration: true,
        description: "A veil of arcane energy.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-arcane-veil");
    expect(spell).toBeDefined();
    expect(spell?.concentration).toBe(true);
  });

  it("custom spell summary includes range and duration (non-instantaneous)", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "Phantom Flame",
        level: 1,
        school: "illusion",
        castingTime: "action",
        range: "30 feet",
        components: { v: true, s: false, m: false },
        duration: "1 hour",
        concentration: false,
        description: "An illusory flame.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-phantom-flame");
    expect(spell?.summary.range).toBe("30 feet");
    expect(spell?.summary.duration).toBe("1 hour");
  });

  it("instantaneous custom spell has no duration in summary", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "Magic Bolt",
        level: 1,
        school: "evocation",
        castingTime: "action",
        range: "120 feet",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "A bolt of magic.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-magic-bolt");
    expect(spell?.summary.duration).toBeUndefined();
  });

  it("custom spell components reflected in summary", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "All Components",
        level: 1,
        school: "transmutation",
        castingTime: "action",
        range: "Touch",
        components: { v: true, s: true, m: true, material: "a pinch of dust" },
        duration: "Instantaneous",
        concentration: false,
        description: "Uses all components.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-all-components");
    expect(spell?.summary.components).toEqual({ v: true, s: true, m: true });
  });

  it("custom spell description is passed through to the action", () => {
    const char = makeSpellcaster();
    const desc = "This spell does amazing things.";
    char.character.spells = [
      {
        custom: true,
        name: "Test Spell",
        level: 1,
        school: "evocation",
        castingTime: "action",
        range: "Touch",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: desc,
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === "custom-spell-test-spell");
    expect(spell?.description).toBe(desc);
  });

  it("custom spell id handles special characters in name", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      {
        custom: true,
        name: "Zap & Blast!",
        level: 1,
        school: "evocation",
        castingTime: "action",
        range: "30 feet",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "Zap.",
      },
    ];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id.startsWith("custom-spell-"));
    expect(spell).toBeDefined();
    // ID should only contain alphanumeric chars and dashes
    expect(spell?.id).toMatch(/^custom-spell-[a-z0-9-]+$/);
  });

  it("SRD spells and custom spells both appear when mixed", () => {
    const char = makeSpellcaster();
    char.character.spells = [
      { srdId: "fireball" },
      {
        custom: true,
        name: "Custom Blast",
        level: 2,
        school: "evocation",
        castingTime: "action",
        range: "60 feet",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "A custom blast.",
      },
    ];
    const actions = localizeActions(char, "en");
    const fireball = actions.find((a) => a.id === "spell-fireball");
    const custom = actions.find((a) => a.id === "custom-spell-custom-blast");
    expect(fireball).toBeDefined();
    expect(custom).toBeDefined();
  });
});

describe("resolveActions — S1 while-active buff spell auto-light (activatesKey)", () => {
  function makeSpellcaster(): CharacterDoc {
    return makeChar({
      classes: [{ classId: "bard", level: 5 }],
      spellcasting: {
        ability: "CHA",
        preparedCaster: false,
        preparedMax: 0,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 2 },
      ],
    });
  }

  // A while-active BUFF spell carries its standing effect as a `while-active`
  // grant on `spell.grants` whose stable `activeKey` is `spell-<id>`; a normal
  // damage/utility spell carries no such grant. The cast action must mirror the
  // FEATURE path (Rage/Bladesong) and stamp `activatesKey` so the combat commit
  // auto-lights the rail chip — only for the buffs.
  const cases: ReadonlyArray<{ srdId: string; activeKey: string | undefined }> = [
    // +2 AC for the duration → its chip lights on cast.
    { srdId: "shield-of-faith", activeKey: "spell-shield-of-faith" },
    // +1d4 radiant weapon rider for the duration → lights on cast.
    { srdId: "divine-favor", activeKey: "spell-divine-favor" },
    // AC formula for the duration → lights on cast.
    { srdId: "mage-armor", activeKey: "spell-mage-armor" },
    // Plain damage spell — no standing effect → lights NOTHING.
    { srdId: "fireball", activeKey: undefined },
  ];

  it.each(cases)("$srdId → activatesKey = $activeKey", ({ srdId, activeKey }) => {
    const char = makeSpellcaster();
    char.character.spells = [{ srdId }];
    const actions = localizeActions(char, "en");
    const spell = actions.find((a) => a.id === `spell-${srdId}`);
    expect(spell).toBeDefined();
    expect(spell?.activatesKey).toBe(activeKey);
  });
});

describe("resolveActions — multiclass per-spell DC/attack (2024 RAW)", () => {
  function mcDoc(): CharacterDoc {
    const doc = buildDevScenario("scn-wizard-cleric-multiclass");
    if (!doc) throw new Error("expected the wizard-cleric-multiclass scenario");
    return doc;
  }
  // The combat panel honors per-OWNING-class casting ability. Talenor = Wizard 5
  // (Evoker) / Cleric 3, total level 8 → PB +3. Sacred Flame (Cleric → WIS 15,
  // +2) shows DC 13; Fireball (Wizard → INT 16, +3) shows DC 14 — same character.
  it("Cleric save spell uses WIS, Wizard save spell uses INT — different DCs", () => {
    const doc = mcDoc();
    const actions = localizeActions(doc, "en");
    const sacredFlame = actions.find((a) => a.id === "spell-sacred-flame");
    const fireball = actions.find((a) => a.id === "spell-fireball");
    expect(sacredFlame?.summary.saveDC).toBe(13); // Cleric → WIS
    expect(fireball?.summary.saveDC).toBe(14); // Wizard → INT
    expect(sacredFlame?.summary.saveDC).not.toBe(fireball?.summary.saveDC);
  });

  it("a global save-DC override pins every spell's combat DC (override-first)", () => {
    const doc = mcDoc();
    if (doc.character.spellcasting) doc.character.spellcasting.saveDCOverride = 19;
    const actions = localizeActions(doc, "en");
    expect(actions.find((a) => a.id === "spell-sacred-flame")?.summary.saveDC).toBe(19);
    expect(actions.find((a) => a.id === "spell-fireball")?.summary.saveDC).toBe(19);
  });
});

describe("resolveActions — class-scoped DC bump per owning class (B6)", () => {
  // B6: the combat per-spell DC/attack recompute must fire when the owning CLASS
  // diverges from the primary — NOT only when the ability diverges. A Bard 6 /
  // Sorcerer 3 (BOTH Charisma) with Innate Sorcery active emits a `scope:"sorcerer"`
  // +1 spell save DC; that +1 must land on a Sorcerer-owned spell and NOTHING
  // else, even though every spell shares the one CHA ability. Pre-fix the gate
  // keyed on ability alone (CHA == CHA → no recompute), so the Sorcerer spell fell
  // to the PRIMARY-bard-scoped DC and the +1 was DROPPED — and (mirror) a primary
  // Sorcerer's bard spell wrongly INHERITED the +1.
  //
  // Bard 6 / Sorcerer 3, CHA 20 (+5), total level 9 → PB +4 → base DC 17.
  function sorcbard(): CharacterDoc {
    return buildScenario({
      name: "Sorcbard",
      raceId: "human",
      classId: "bard",
      subclassId: "college-of-lore",
      level: 6,
      secondaryClasses: [
        { classId: "sorcerer", subclassId: "draconic-sorcery", level: 3 },
      ],
      background: "criminal",
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 20 },
      spells: [
        { srdId: "burning-hands", prepared: true }, // sorcerer/wizard → Sorcerer-owned (DEX save)
        { srdId: "fireball", prepared: true }, // sorcerer/wizard → Sorcerer-owned
        { srdId: "dissonant-whispers", prepared: true }, // Bard-only (WIS save)
      ],
      activeFeatures: ["sorcerer-innate-sorcery"], // lights the scope:"sorcerer" +1 DC
    });
  }

  it("Innate Sorcery's +1 lands on Sorcerer-owned spells (DC 18), NOT on Bard-owned (DC 17) — same CHA", () => {
    const doc = sorcbard();
    const actions = localizeActions(doc, "en");
    // Sorcerer-owned save spells get the sorcerer-scoped +1 → 17 + 1 = 18.
    expect(actions.find((a) => a.id === "spell-burning-hands")?.summary.saveDC).toBe(18);
    expect(actions.find((a) => a.id === "spell-fireball")?.summary.saveDC).toBe(18);
    // The Bard-owned spell keeps the base DC (no sorcerer bump).
    expect(actions.find((a) => a.id === "spell-dissonant-whispers")?.summary.saveDC).toBe(
      17
    );
  });

  it("MIRROR — a primary Sorcerer's Bard-owned spell does NOT inherit the sorcerer +1 (no over-count)", () => {
    // Sorcerer 6 / Bard 3 → primary = Sorcerer, so the precomputed DC already folds
    // the sorcerer +1 (18). The Bard-owned spell must recompute under the BARD scope
    // and drop back to 17 — the mirror of the drop bug.
    const doc = buildScenario({
      name: "Bardsorc",
      raceId: "human",
      classId: "sorcerer",
      subclassId: "draconic-sorcery",
      level: 6,
      secondaryClasses: [{ classId: "bard", subclassId: "college-of-lore", level: 3 }],
      background: "criminal",
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 20 },
      spells: [
        { srdId: "burning-hands", prepared: true }, // Sorcerer-owned (primary)
        { srdId: "dissonant-whispers", prepared: true }, // Bard-owned
      ],
      activeFeatures: ["sorcerer-innate-sorcery"],
    });
    const actions = localizeActions(doc, "en");
    expect(actions.find((a) => a.id === "spell-burning-hands")?.summary.saveDC).toBe(18); // sorcerer +1
    expect(actions.find((a) => a.id === "spell-dissonant-whispers")?.summary.saveDC).toBe(
      17
    ); // NO over-count
  });

  // The always-on class-scoped ITEM analog (Rod of the Pact Keeper) exercises a
  // PACK magic item: content-pack/tests/unit/smart-tracker.pack.test.ts.
});

describe("resolveActions — cross-feature costTracker", () => {
  it("Flurry of Blows references monk-focus as costTracker", () => {
    const char = makeChar({
      classes: [{ classId: "monk", level: 3 }],
      features: [{ srdId: "monk-focus" }, { srdId: "monk-flurry-of-blows" }],
    });
    const actions = localizeActions(char, "en");
    const flurry = actions.find((a) => a.id === "monk-flurry-of-blows-bonus");
    expect(flurry).toBeDefined();
    expect(flurry?.costTracker).toBe("monk-focus");
    expect(flurry?.costTrackerIsPool).toBe(true);
    // Stable unit token (localized at the render boundary — golden rule 7).
    expect(flurry?.costTrackerUnit).toBe("points");
  });

  it("Flurry of Blows shows Focus Point uses remaining in summary", () => {
    const char = makeChar({
      classes: [{ classId: "monk", level: 3 }],
      features: [{ srdId: "monk-focus" }, { srdId: "monk-flurry-of-blows" }],
    });
    // Spend 1 focus point
    char.session.trackers["monk-focus"] = { used: 1 };
    const actions = localizeActions(char, "en");
    const flurry = actions.find((a) => a.id === "monk-flurry-of-blows-bonus");
    expect(flurry?.summary.uses).toEqual({
      current: 2, // 3 (level) - 1 (used) = 2
      total: 3,
      isPool: true,
      unit: "points",
    });
  });

  it("Stunning Strike costs 1 Focus Point from monk-focus", () => {
    const char = makeChar({
      classes: [{ classId: "monk", level: 5 }],
      features: [{ srdId: "monk-focus" }, { srdId: "monk-stunning-strike" }],
    });
    const actions = localizeActions(char, "en");
    const stun = actions.find((a) => a.id === "monk-stunning-strike-free");
    expect(stun).toBeDefined();
    expect(stun?.costTracker).toBe("monk-focus");
    expect(stun?.trackerCost).toBe(1); // explicit fixed cost, no pool prompt
  });
});

// ─── S11 — declarative save-based attacks (damage dice + type + save DC) ──────
// The seam S11 closes: a feature/trait action's damage dice + type + save DC were
// FACTS living only in i18n prose (the golden-rule-5 leak). Each assertion pins
// the resolved summary against the wikidot SRD facts at ≥2 levels (scaling) — the
// cheapest pin via the producing resolver (golden rule 13), with a thin
// render check that the localized card reflects the damage + DC.
describe("resolveActions — S11 save-based attacks (G1/G14/G15-DC)", () => {
  const SCORES_DRACONIC = { STR: 12, DEX: 14, CON: 16, INT: 10, WIS: 10, CHA: 10 };
  const SCORES_CLERIC = { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 8 };

  function dragonborn(level: number, ancestry: string): CharacterDoc {
    const char = makeChar({
      level,
      classes: [{ classId: "fighter", level }],
      race: asRaceId("dragonborn"),
      abilityScores: SCORES_DRACONIC,
    });
    char.session.grantBundleChoices = { "dragonborn-ancestry": ancestry };
    return char;
  }

  it("Dragonborn Breath Weapon: DEX save vs CON-based DC, 1d10→2d10, type by ancestry", () => {
    // L1: DC 8 + CON +3 + PB +2 = 13; 1d10; red ancestry → Fire.
    const l1 = localizeActions(dragonborn(1, "red"), "en").find(
      (a) => a.id === "race:dragonborn:breath-weapon-action"
    );
    expect(l1?.summary.saveAbility).toBe("DEX");
    expect(l1?.summary.saveDC).toBe(13);
    expect(l1?.summary.damage).toBe("1d10");
    expect(l1?.summary.damageType).toBe("fire");
    // L5: PB +3 → DC 14; dice step up to 2d10 (the next character-level threshold).
    const l5 = localizeActions(dragonborn(5, "white"), "en").find(
      (a) => a.id === "race:dragonborn:breath-weapon-action"
    );
    expect(l5?.summary.saveDC).toBe(14);
    expect(l5?.summary.damage).toBe("2d10"); // scaling FROM the level table
    expect(l5?.summary.damageType).toBe("cold"); // white ancestry → Cold
  });

  it("Dragonborn Breath Weapon: no ancestry chosen ⇒ no damage type (still rolls dice + DC)", () => {
    const noPick = makeChar({
      level: 1,
      classes: [{ classId: "fighter", level: 1 }],
      race: asRaceId("dragonborn"),
      abilityScores: SCORES_DRACONIC,
    });
    const breath = localizeActions(noPick, "en").find(
      (a) => a.id === "race:dragonborn:breath-weapon-action"
    );
    expect(breath?.summary.damage).toBe("1d10");
    expect(breath?.summary.damageType).toBeUndefined();
  });

  function clericChar(level: number): CharacterDoc {
    return makeChar({
      level,
      classes: [{ classId: "cleric", level }],
      abilityScores: SCORES_CLERIC,
      features: [{ srdId: "cleric-channel-divinity" }, { srdId: "cleric-divine-spark" }],
    });
  }

  it("Cleric Divine Spark: CON save vs WIS-based DC, Nd8 + WIS by Cleric level, Necrotic/Radiant choice + heal mode", () => {
    // L2: DC 8 + PB +2 + WIS +3 = 13; 1d8 + WIS (+3) = "1d8+3" (S11b additive).
    const l2 = localizeActions(clericChar(2), "en").find(
      (a) => a.id === "cleric-divine-spark-action"
    );
    expect(l2?.summary.saveAbility).toBe("CON");
    expect(l2?.summary.saveDC).toBe(13);
    expect(l2?.summary.damage).toBe("1d8+3");
    expect(l2?.summary.damageTypes).toEqual(["necrotic", "radiant"]);
    expect(l2?.summary.multiDamageTypeFlavor).toBe("choice");
    // S11b heal-or-damage mode: the SAME total surfaces as a heal chip + apply.
    expect(l2?.summary.healing).toBe("1d8+3");
    expect(l2?.summary.healApply).toEqual({ dice: "1d8", bonus: 3 });
    // L7: PB +3 → DC 14; dice step to 2d8 at the Cleric-level-7 threshold, +WIS.
    const l7 = localizeActions(clericChar(7), "en").find(
      (a) => a.id === "cleric-divine-spark-action"
    );
    expect(l7?.summary.saveDC).toBe(14);
    expect(l7?.summary.damage).toBe("2d8+3");
  });

  // The `addLevel` additive (Light Domain Radiance of the Dawn) and the
  // no-damage save-based bonus action (Lupin Howl) exercise PACK content:
  // content-pack/tests/unit/smart-tracker.pack.test.ts.

  it("the localized card reflects the damage + save facts (thin render-side wiring)", () => {
    // The presenter passes the engine's damage/type/saveDC through unchanged, and
    // the chip/facts recipe a damage spell uses lights up — proven via the
    // localized summary the combat card reads.
    const en = localizeActions(dragonborn(5, "gold"), "en").find(
      (a) => a.id === "race:dragonborn:breath-weapon-action"
    );
    expect(en?.summary.damage).toBe("2d10");
    expect(en?.summary.damageType).toBe("fire");
    expect(en?.summary.saveDC).toBe(14);
    expect(en?.summary.saveAbility).toBe("DEX");
  });
});

// ─── resolveTrackerTotal formula tests ───────────────────────────────────────

import { resolveTrackerTotal } from "@/lib/smart-tracker";

describe("resolveTrackerTotal", () => {
  function makeDoc(
    level: number,
    abilityScores?: Partial<Record<string, number>>
  ): CharacterDoc {
    return makeChar({
      level,
      abilityScores: {
        STR: 10,
        DEX: 14,
        CON: 12,
        INT: 16,
        WIS: 10,
        CHA: 14,
        ...(abilityScores ?? {}),
      },
    });
  }

  it("resolves a pure number", () => {
    expect(resolveTrackerTotal("5", makeDoc(1))).toBe(5);
  });

  it("resolves PB", () => {
    expect(resolveTrackerTotal("PB", makeDoc(5))).toBe(3); // PB at level 5 = +3
  });

  it("resolves level", () => {
    expect(resolveTrackerTotal("level", makeDoc(9))).toBe(9);
  });

  it("resolves ability modifier (CHA=14 → +2)", () => {
    expect(resolveTrackerTotal("CHA", makeDoc(1))).toBe(2);
  });

  it("resolves level*5 (Paladin Lay on Hands)", () => {
    expect(resolveTrackerTotal("level*5", makeDoc(5))).toBe(25);
  });

  it("resolves 1+level (Warlock Healing Light)", () => {
    expect(resolveTrackerTotal("1+level", makeDoc(7))).toBe(8);
  });

  it("resolves level*2+INT (Wizard Arcane Ward, INT=16 → +3)", () => {
    expect(resolveTrackerTotal("level*2+INT", makeDoc(6))).toBe(15); // 6*2 + 3 = 15
  });

  it("floors ability-based formulas at 1", () => {
    // INT=8 → mod = -1; formula "INT" → max(1, -1) = 1
    expect(resolveTrackerTotal("INT", makeDoc(1, { INT: 8 }))).toBe(1);
  });

  it("floors addition formulas at 1", () => {
    // level=1, INT=8 → 1*2+(-1) = 1, but floor at 1
    expect(resolveTrackerTotal("level*2+INT", makeDoc(1, { INT: 8 }))).toBe(1);
  });

  it("resolves ceil(level/2) for Wizard Arcane Recovery (CQ5)", () => {
    // Wizard level 5 → ceil(5/2) = 3 combined slot levels
    expect(resolveTrackerTotal("ceil(level/2)", makeDoc(5))).toBe(3);
    expect(resolveTrackerTotal("ceil(level/2)", makeDoc(20))).toBe(10);
  });

  it("resolves floor(level/2) for half-level patterns (CQ5)", () => {
    expect(resolveTrackerTotal("floor(level/2)", makeDoc(7))).toBe(3);
  });

  it("warns + falls back to 1 on unknown formula (CQ5)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveTrackerTotal("nonsense-formula", makeDoc(5))).toBe(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Unknown tracker formula"));
    spy.mockRestore();
  });

  it("resolves subtraction A-B (CQ5)", () => {
    expect(resolveTrackerTotal("level-1", makeDoc(7))).toBe(6);
    expect(resolveTrackerTotal("PB-1", makeDoc(5))).toBe(2); // PB 3 - 1 = 2
  });

  it("floors subtraction at 1 (CQ5)", () => {
    // level 1 - 5 = -4, clamped to 1
    expect(resolveTrackerTotal("level-5", makeDoc(1))).toBe(1);
  });

  it("resolves top-level division A/N (CQ5)", () => {
    // level 7 / 2 = 3.5, floored to 3
    expect(resolveTrackerTotal("level/2", makeDoc(7))).toBe(3);
    // level 1 / 2 = 0.5, floored to 0, clamped to 1
    expect(resolveTrackerTotal("level/2", makeDoc(1))).toBe(1);
  });
});

// ─── S12b multi-instance + G24 recurrence (spell-data structured shapes) ──────
describe("resolveActions — S12b multi-instance spell damage (Magic Missile / Scorching Ray)", () => {
  function makeWizard(spellSrdId: string) {
    const char = makeChar({
      classes: [{ classId: "wizard", level: 5 }],
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 10, CHA: 10 },
      spellcasting: {
        ability: "INT",
        preparedCaster: true,
        preparedMax: 6,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 2 },
      ],
    });
    char.character.spells = [{ srdId: spellSrdId, prepared: true }];
    return char;
  }

  // A faithful-enough t for the verdict chip: short type + the multi-instance
  // interpolation. (The chip budget is generous; "3 × 1d4+1 Frc" fits.)
  const t = ((key: string, opts?: { count?: number; dice?: string }) => {
    if (key === "spells.multiInstance") return `${opts?.count} × ${opts?.dice}`;
    const m = /^srd\.damageShort_(.+)$/.exec(key);
    const type = m?.[1];
    if (type) return type.slice(0, 3);
    return key;
  }) as unknown as Parameters<typeof combatVerdict>[1];

  it("Magic Missile carries instances=3 at base; the verdict shows '3 × 1d4+1'", () => {
    // fail-before: without `summary.instances` + the combatVerdict multi-instance
    // branch the chip showed the per-instance "1d4+1" only. `localizeActions`
    // carries `instances` through to the display summary (via `...rest`).
    const acts = localizeActions(makeWizard("magic-missile"), "en");
    const mm = acts.find((a) => a.spellId === "magic-missile");
    if (!mm) throw new Error("magic-missile action not found");
    expect(mm.summary.damage).toBe("1d4+1"); // the per-instance formula (rider math)
    expect(mm.summary.instances).toBe(3);
    expect(combatVerdict(mm, t)).toContain("3 × 1d4+1");
  });

  it("Magic Missile upcast: spellInstanceCount resolves +1 dart per slot above 1st (4 at L2)", () => {
    const mm = { level: 1, instances: 3, instancesPerUpcast: 1 };
    expect(spellInstanceCount(mm, 1)).toBe(3);
    expect(spellInstanceCount(mm, 2)).toBe(4);
  });

  it("Scorching Ray carries instances=3 (2d6 each); upcast +1 ray per slot above 2nd (4 at L3)", () => {
    const acts = localizeActions(makeWizard("scorching-ray"), "en");
    const sr = acts.find((a) => a.spellId === "scorching-ray");
    if (!sr) throw new Error("scorching-ray action not found");
    expect(sr.summary.damage).toBe("2d6");
    expect(sr.summary.instances).toBe(3);
    expect(combatVerdict(sr, t)).toContain("3 × 2d6");
    const ray = { level: 2, instances: 3, instancesPerUpcast: 1 };
    expect(spellInstanceCount(ray, 3)).toBe(4);
  });

  it("M03/M04/M14 — a dual-instance spell surfaces its second damage on the combat chip", () => {
    // fail-before: Ice Storm's primary was mislabeled Cold and its 4d6 Cold half
    // was absent, so the chip read "2d10 col" (wrong type, half the damage). Now
    // the primary is Bludgeoning and `secondaryDamage` carries the fixed 4d6 Cold.
    const storm = localizeActions(makeWizard("ice-storm"), "en").find(
      (a) => a.spellId === "ice-storm"
    );
    if (!storm) throw new Error("ice-storm action not found");
    expect(storm.summary.damage).toBe("2d10");
    expect(storm.summary.damageType).toBe("bludgeoning");
    expect(storm.summary.secondaryDamage).toEqual({ dice: "4d6", damageType: "cold" });
    expect(combatVerdict(storm, t)).toBe("2d10 blu + 4d6 col");

    // Ice Knife: 1d10 Piercing on hit + 2d6 Cold on a DEX save (primary was Cold).
    const knife = localizeActions(makeWizard("ice-knife"), "en").find(
      (a) => a.spellId === "ice-knife"
    );
    if (!knife) throw new Error("ice-knife action not found");
    expect(knife.summary.damageType).toBe("piercing");
    expect(knife.summary.secondaryDamage).toEqual({ dice: "2d6", damageType: "cold" });
    expect(combatVerdict(knife, t)).toBe("1d10 pie + 2d6 col");
  });

  it("a single-roll spell carries NO instances (the surfaces show the bare die)", () => {
    const acts = resolveActions(makeWizard("fireball"));
    const fb = acts.find((a) => a.spellId === "fireball");
    expect(fb?.summary.instances).toBeUndefined();
    expect(fb?.summary.damage).toBe("8d6");
  });
});

describe("resolveActions — G24 spell-area recurrence cadence (Moonbeam / Spirit Guardians)", () => {
  function makeCleric(spellSrdId: string) {
    const char = makeChar({
      classes: [{ classId: "cleric", level: 5 }],
      abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 12 },
      spellcasting: {
        ability: "WIS",
        preparedCaster: true,
        preparedMax: 8,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 2 },
      ],
    });
    char.character.spells = [{ srdId: spellSrdId, prepared: true }];
    return char;
  }

  it("Spirit Guardians carries the on-enter-or-end-turn recurrence", () => {
    // fail-before: without the `recurrence` field + the summary wiring the
    // cadence note was absent.
    const acts = resolveActions(makeCleric("spirit-guardians"));
    const sg = acts.find((a) => a.spellId === "spirit-guardians");
    expect(sg?.summary.recurrence).toBe("on-enter-or-end-turn");
  });

  it("Moonbeam carries the on-enter-or-end-turn recurrence (Druid)", () => {
    const char = makeChar({
      classes: [{ classId: "druid", level: 5 }],
      abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 12 },
      spellcasting: {
        ability: "WIS",
        preparedCaster: true,
        preparedMax: 8,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
      ],
    });
    char.character.spells = [{ srdId: "moonbeam", prepared: true }];
    const moon = resolveActions(char).find((a) => a.spellId === "moonbeam");
    expect(moon?.summary.recurrence).toBe("on-enter-or-end-turn");
  });

  it("the recurrence token survives localization onto the display summary", () => {
    const sg = localizeActions(makeCleric("spirit-guardians"), "en").find(
      (a) => a.spellId === "spirit-guardians"
    );
    expect(sg?.summary.recurrence).toBe("on-enter-or-end-turn");
  });

  it("a once-at-cast spell carries no recurrence (Fireball)", () => {
    const fb = resolveActions(makeCleric("fireball")).find(
      (a) => a.spellId === "fireball"
    );
    expect(fb?.summary.recurrence).toBeUndefined();
  });
});
