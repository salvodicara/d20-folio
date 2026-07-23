/**
 * The unified weapon facts seam (owner mandate 2026-06-12): ONE
 * `buildWeaponFacts` presenter + ONE `WeaponFacts` component shared by the
 * combat action card and the inventory WeaponCard.
 *
 * Pins:
 *  - the builder: chip assembly (stable ids + localized labels, EN/IT), the
 *    thrown/ammunition distance conversion, range formatting, mastery
 *    dedup/gating-by-construction;
 *  - EQUIVALENCE: for the same weapon on the same character, the inventory
 *    presenter and the combat presenter emit the IDENTICAL WeaponFactsVM —
 *    the two surfaces cannot diverge;
 *  - the versatile-enchant regression: a bound +N folds into BOTH the
 *    one-handed and the two-handed formula (combat used the bare ability mod
 *    on the two-handed one);
 *  - combat-side mastery gating: `weaponMastery` only when picked;
 *  - the component: damage/to-hit/range rows, glossed chips (GlossaryTip for
 *    every known term, plain chip for a custom property), rubric strips the
 *    per-weapon parenthetical;
 *  - the shared-recipe guard: BOTH surfaces import the ONE component.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import i18n from "@/i18n";
import { buildWeaponFacts, type WeaponFactsVM } from "@/lib/views/weapon-facts-view";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import { localizeActions } from "@/lib/views/combat-action-view";
import { WeaponFacts } from "@/components/shared/WeaponFacts";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const mock = (): CharacterDoc => structuredClone(MOCK_CHARACTER);

afterEach(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

// ── the builder ───────────────────────────────────────────────────────────────

describe("buildWeaponFacts — chips + range (EN/IT)", () => {
  const input = {
    damage: "1d4+3",
    damageType: "piercing",
    attackBonus: 7,
    rangeSpec: { kind: "melee", reachFt: 5, thrown: { nearFt: 20, farFt: 60 } },
    properties: ["Finesse", "Light", "Thrown (Range 20/60)"],
    category: "simple",
    mastery: "Nick",
  } as const;

  it("assembles category → property → mastery chips with stable ids (EN)", () => {
    const vm = buildWeaponFacts({ ...input }, "en");
    expect(vm.chips).toEqual([
      { kind: "category", id: "simple", label: "Simple" },
      { kind: "property", id: "finesse", label: "Finesse" },
      { kind: "property", id: "light", label: "Light" },
      { kind: "property", id: "thrown", label: "Thrown (Range 20/60)" },
      { kind: "mastery", id: "nick", label: "Nick" },
    ]);
    expect(vm.range).toBe("5 ft / 20/60 ft");
    expect(vm.damageOneHanded).toBe("1d4+3");
    expect(vm.damageTwoHanded).toBeNull();
  });

  it("localizes labels + converts distances in IT (same stable ids)", () => {
    const vm = buildWeaponFacts({ ...input }, "it");
    expect(vm.chips).toEqual([
      { kind: "category", id: "simple", label: "Semplice" },
      { kind: "property", id: "finesse", label: "Accurata" },
      { kind: "property", id: "light", label: "Leggera" },
      { kind: "property", id: "thrown", label: "Da Lancio (Gittata 6/18 m)" },
      { kind: "mastery", id: "nick", label: "Graffio" },
    ]);
    expect(vm.range).toBe("1,5 m / 6/18 m");
  });

  // RA-13 — number-bearing masteries print their engine-resolved value on the
  // chip label, localized ("DC" → "CD"); other masteries stay plain.
  it("RA-13 — Topple/Graze chip labels carry the resolved numbers (EN + IT)", () => {
    const en = buildWeaponFacts(
      {
        ...input,
        mastery: "Topple",
        extraMasteries: ["Graze"],
        masteryDetail: { toppleDc: 14, grazeDamage: 3 },
      },
      "en"
    );
    expect(en.chips.filter((c) => c.kind === "mastery").map((c) => c.label)).toEqual([
      "Topple · DC 14",
      "Graze · 3",
    ]);
    const it_ = buildWeaponFacts(
      { ...input, mastery: "Topple", masteryDetail: { toppleDc: 14 } },
      "it"
    );
    expect(it_.chips.find((c) => c.id === "topple")?.label).toBe("Rovesciamento · CD 14");
    // Graze floors at 0 for a negative attack mod (damage is never negative).
    const floored = buildWeaponFacts(
      { ...input, mastery: "Graze", masteryDetail: { grazeDamage: 0 } },
      "en"
    );
    expect(floored.chips.find((c) => c.id === "graze")?.label).toBe("Graze · 0");
    // No detail → plain label (defensive: an unresolved row degrades gracefully).
    const plain = buildWeaponFacts({ ...input, mastery: "Topple" }, "en");
    expect(plain.chips.find((c) => c.id === "topple")?.label).toBe("Topple");
  });

  it("no mastery input → no mastery chip (gating by construction); extras dedup", () => {
    const none = buildWeaponFacts({ ...input, mastery: null }, "en");
    expect(none.chips.some((c) => c.kind === "mastery")).toBe(false);
    const extras = buildWeaponFacts(
      { ...input, mastery: "Push", extraMasteries: ["Push", "Topple"] },
      "en"
    );
    expect(extras.chips.filter((c) => c.kind === "mastery").map((c) => c.id)).toEqual([
      "push",
      "topple",
    ]);
  });
});

// ── surface equivalence (the shared-recipe pin) ───────────────────────────────

describe("weapon facts — combat and inventory surfaces are EQUIVALENT", () => {
  function withMasteredLongsword(): CharacterDoc {
    const doc = mock();
    doc.character.weapons.push({ srdId: "longsword", quantity: 1 });
    const entry = doc.character.classes[0];
    if (!entry) throw new Error("mock has no classes[] entry");
    entry.weaponMasteries = ["longsword"];
    return doc;
  }

  it.each(["en", "it"] as const)(
    "the same weapon yields the IDENTICAL WeaponFactsVM on both presenters (%s)",
    (locale) => {
      const doc = withMasteredLongsword();
      const inventory = buildInventoryViewModel(doc, locale).weapons.find(
        (w) => w.id === "longsword"
      );
      const combat = localizeActions(doc, locale).find(
        (a) => a.id === "weapon-longsword"
      );
      expect(inventory).toBeDefined();
      expect(combat?.weaponFacts).toBeDefined();
      expect(combat?.weaponFacts).toEqual(inventory?.facts);
      // …and the owned mastery chip is present on BOTH (longsword → Sap).
      expect(inventory?.facts.chips.find((c) => c.kind === "mastery")).toMatchObject({
        id: "sap",
      });
    }
  );

  // RA-13 — the resolved Topple DC rides the ONE `buildWeaponFacts` seam, so the
  // combat card and the inventory card print the SAME number-bearing chip label
  // for the same mastered weapon (golden rule 6 — agreement by construction).
  it("RA-13 — the resolved Topple chip label is IDENTICAL across both surfaces", () => {
    const doc = mock();
    doc.character.weapons.push({ srdId: "quarterstaff", quantity: 1 });
    const entry = doc.character.classes[0];
    if (!entry) throw new Error("mock has no classes[] entry");
    entry.weaponMasteries = ["quarterstaff"];
    const inventory = buildInventoryViewModel(doc, "en").weapons.find(
      (w) => w.id === "quarterstaff"
    );
    const combat = localizeActions(doc, "en").find((a) => a.id === "weapon-quarterstaff");
    const invLabel = inventory?.facts.chips.find((c) => c.id === "topple")?.label;
    const combatLabel = combat?.weaponFacts?.chips.find((c) => c.id === "topple")?.label;
    expect(invLabel).toMatch(/^Topple · DC \d+$/);
    expect(combatLabel).toBe(invLabel);
    // The whole VM agrees too (the number lives inside the shared chip).
    expect(combat?.weaponFacts).toEqual(inventory?.facts);
  });

  // RA-17 — the Heavy-property attack-roll Disadvantage advisory rides the ONE
  // `buildWeaponFacts` seam, so it agrees on both weapon surfaces by construction
  // (golden rule 6). The mock (Lyra Voss) is STR 8 / DEX 16.
  it("RA-17 — a Heavy MELEE weapon flags Disadvantage on both surfaces when STR < 13", () => {
    const doc = mock();
    doc.character.weapons.push({ srdId: "greatsword", quantity: 1 });
    const inventory = buildInventoryViewModel(doc, "en").weapons.find(
      (w) => w.id === "greatsword"
    );
    const combat = localizeActions(doc, "en").find((a) => a.id === "weapon-greatsword");
    expect(inventory?.facts.heavyDisadvantage).toBe(true);
    expect(combat?.weaponFacts?.heavyDisadvantage).toBe(true);
    // The whole VM agrees across surfaces.
    expect(combat?.weaponFacts).toEqual(inventory?.facts);
  });

  it("RA-17 — a Heavy RANGED weapon reads DEX (not STR): DEX 16 clears the advisory", () => {
    // Lyra is STR 8 / DEX 16 — a Longbow (Heavy, Ranged) must NOT flag, proving
    // the ranged branch keys off DEX, not the low STR.
    const doc = mock();
    doc.character.weapons.push({ srdId: "longbow", quantity: 1 });
    const inventory = buildInventoryViewModel(doc, "en").weapons.find(
      (w) => w.id === "longbow"
    );
    const combat = localizeActions(doc, "en").find((a) => a.id === "weapon-longbow");
    expect(inventory?.facts.heavyDisadvantage).toBe(false);
    expect(combat?.weaponFacts?.heavyDisadvantage).toBe(false);
    expect(combat?.weaponFacts).toEqual(inventory?.facts);
  });

  it("RA-17 — a non-Heavy weapon never flags the advisory (defaults off)", () => {
    const doc = mock();
    doc.character.weapons.push({ srdId: "longsword", quantity: 1 });
    const inventory = buildInventoryViewModel(doc, "en").weapons.find(
      (w) => w.id === "longsword"
    );
    const combat = localizeActions(doc, "en").find((a) => a.id === "weapon-longsword");
    expect(inventory?.facts.heavyDisadvantage).toBe(false);
    expect(combat?.weaponFacts?.heavyDisadvantage).toBe(false);
  });

  it("combat emits NO mastery without the pick (gated in the engine)", () => {
    const doc = mock();
    doc.character.weapons.push({ srdId: "longsword", quantity: 1 });
    const combat = localizeActions(doc, "en").find((a) => a.id === "weapon-longsword");
    expect(combat?.weaponFacts?.chips.some((c) => c.kind === "mastery")).toBe(false);
  });

  it("REGRESSION: a bound +N enchant folds into BOTH versatile formulas, on both surfaces", () => {
    const doc = withMasteredLongsword();
    doc.character.equipment.push({ srdId: "weapon-plus-1", quantity: 1 });
    const ref = doc.character.weapons.find(
      (w) => !("custom" in w) && w.srdId === "longsword"
    );
    if (!ref || "custom" in ref) throw new Error("no longsword ref");
    ref.enchantItemId = "weapon-plus-1";

    const modOf = (formula: string) => formula.replace(/^\d+d\d+/, "");
    const inv = buildInventoryViewModel(doc, "en").weapons.find(
      (w) => w.id === "longsword"
    );
    const combat = localizeActions(doc, "en").find((a) => a.id === "weapon-longsword");
    for (const facts of [inv?.facts, combat?.weaponFacts]) {
      expect(facts?.damageTwoHanded).toBeTruthy();
      // The two-handed formula carries the SAME modifier (ability + enchant)
      // as the one-handed one — combat previously dropped the enchant there.
      expect(modOf(facts?.damageTwoHanded ?? "")).toBe(
        modOf(facts?.damageOneHanded ?? "")
      );
    }
    expect(combat?.weaponFacts).toEqual(inv?.facts);
  });

  it("REGRESSION (#94): Archery's +2 lands in the to-hit AND its breakdown on BOTH surfaces", () => {
    // Lyra is a Bard (proficient with the shortbow). Give her the Archery
    // fighting style + ensure a shortbow is carried (the mock has one).
    const doc = mock();
    doc.character.features.push({ srdId: "archery" });
    const baseInv = buildInventoryViewModel(doc, "en").weapons.find(
      (w) => w.id === "shortbow"
    );
    const baseCombat = localizeActions(doc, "en").find((a) => a.id === "weapon-shortbow");
    expect(baseInv).toBeDefined();
    expect(baseCombat?.weaponFacts).toBeDefined();
    // PREVIOUSLY: inventory omitted the flat to-hit bonus while combat included
    // it — the two surfaces drifted. Now BOTH derive the to-hit from the SAME
    // breakdown, so they agree by construction (golden rule 6).
    expect(baseCombat?.weaponFacts?.attackBonus).toBe(baseInv?.facts.attackBonus);
    // …and Archery is NAMED in the to-hit breakdown on both (its catalogue key,
    // never a bespoke term — #94, golden rule 6).
    for (const facts of [baseInv?.facts, baseCombat?.weaponFacts]) {
      const lines = facts?.attackBreakdown ?? [];
      const archeryLine = lines.find((l) => l.kind === "loc" && l.label === "Archery");
      expect(archeryLine, "Archery line on the to-hit breakdown").toBeDefined();
      expect(archeryLine?.value).toBe("+2");
    }
    // The whole VM (incl. attackBreakdown) is identical across surfaces.
    expect(baseCombat?.weaponFacts).toEqual(baseInv?.facts);
  });

  it("the dual-wield off-hand carries the SAME to-hit breakdown as the main hand (#94)", () => {
    // The mock carries 2 daggers (Light melee) → the off-hand bonus attack row.
    const doc = mock();
    const actions = localizeActions(doc, "en");
    const main = actions.find((a) => a.id === "weapon-dagger");
    const off = actions.find((a) => a.id === "weapon-dagger-offhand");
    expect(main?.weaponFacts?.attackBreakdown).toBeDefined();
    expect(off?.weaponFacts?.attackBreakdown).toBeDefined();
    // Same to-hit composition (the off-hand shares the to-hit) — by construction.
    expect(off?.weaponFacts?.attackBreakdown).toEqual(main?.weaponFacts?.attackBreakdown);
    expect(off?.weaponFacts?.attackBonus).toBe(main?.weaponFacts?.attackBonus);
  });
});

// ── the component ─────────────────────────────────────────────────────────────

const COMPONENT_VM: WeaponFactsVM = {
  damageOneHanded: "1d8+3",
  damageTwoHanded: "1d10+3",
  damageTypeId: "slashing",
  attackBonus: 5,
  range: "5 ft",
  chips: [
    { kind: "category", id: "martial", label: "Martial" },
    { kind: "property", id: "finesse", label: "Finesse" },
    { kind: "property", id: "thrown", label: "Thrown (Range 20/60)" },
    { kind: "property", id: null, label: "Homebrew Quirk" },
    { kind: "mastery", id: "sap", label: "Sap" },
  ],
  breakdown: null,
  // A to-hit composition so the to-hit value opens the breakdown tip (#94).
  attackBreakdown: [
    { kind: "ability", value: "+3", ability: "DEX" },
    { kind: "term", value: "+2", term: "character.proficiencyBonus" },
  ],
  riders: [],
  onHitNote: null,
  heavyDisadvantage: false,
};

describe("WeaponFacts component — rows + glossed chips", () => {
  it("renders labelled one-/two-handed damage rows, the glossed to-hit, and the range", () => {
    render(<WeaponFacts facts={COMPONENT_VM} />);
    expect(screen.getByText("Damage (one-handed)")).toBeInTheDocument();
    expect(screen.getByText("1d8+3 Slashing")).toBeInTheDocument();
    expect(screen.getByText("Damage (two-handed)")).toBeInTheDocument();
    expect(screen.getByText("1d10+3 Slashing")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Learn about to hit" })
    ).toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("5 ft")).toBeInTheDocument();
    // Dice-formula values opt out of machine translation SELECTIVELY ("1d8" is
    // not prose — a translator mangles it); labels/range stay translatable
    // (translation is allowed app-wide; see dom-resilience).
    expect(screen.getByText("1d8+3 Slashing")).toHaveAttribute("translate", "no");
    expect(screen.getByText("1d10+3 Slashing")).toHaveAttribute("translate", "no");
    expect(screen.getByText("+5")).toHaveAttribute("translate", "no");
    expect(screen.getByText("5 ft")).not.toHaveAttribute("translate", "no");
  });

  it("renders the on-hit REMINDER sentence in the on-hit register, and omits it when null", () => {
    // The Armorer Guardian Thunder Pulse Disadvantage reminder (too long for the
    // collapsed 60-char subtitle, so the WEAPON-FACTS panel is its only home).
    const note =
      "A creature you hit has Disadvantage on attacks against targets other than you until the start of your next turn.";
    const withNote: WeaponFactsVM = { ...COMPONENT_VM, onHitNote: note };
    const { rerender } = render(<WeaponFacts facts={withNote} />);
    // The sentence renders under the shared "On a hit" register label.
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.getByText("On a hit")).toBeInTheDocument();
    // Null note → no on-hit register from a note (the fixture also has no riders).
    rerender(<WeaponFacts facts={{ ...COMPONENT_VM, onHitNote: null }} />);
    expect(screen.queryByText(note)).toBeNull();
    expect(screen.queryByText("On a hit")).toBeNull();
  });

  it("RA-17 — renders the Heavy-property Disadvantage advisory, omits it when false (EN + IT)", async () => {
    const flagged: WeaponFactsVM = { ...COMPONENT_VM, heavyDisadvantage: true };
    const { rerender } = render(<WeaponFacts facts={flagged} />);
    expect(
      screen.getByText(
        "This Heavy weapon gives you Disadvantage on attack rolls because your Strength or Dexterity is below 13."
      )
    ).toBeInTheDocument();
    // false → the advisory is absent.
    rerender(<WeaponFacts facts={{ ...COMPONENT_VM, heavyDisadvantage: false }} />);
    expect(screen.queryByText(/Disadvantage on attack rolls/)).toBeNull();
    // IT — the bilingual string renders under the Italian locale (afterEach resets).
    await i18n.changeLanguage("it");
    rerender(<WeaponFacts facts={flagged} />);
    expect(screen.getByText(/Svantaggio ai tiri per colpire/)).toBeInTheDocument();
  });

  it("the damage-breakdown popover opens and its formula lines opt out of translation", () => {
    const vm: WeaponFactsVM = {
      ...COMPONENT_VM,
      // Single-handed → exactly ONE damage row, so the trigger is unambiguous.
      damageTwoHanded: null,
      breakdown: [
        { kind: "ability", ability: "STR", value: "+3" },
        { kind: "loc", label: "Rage", value: "+2", note: { whileActive: true } },
      ],
    };
    render(<WeaponFacts facts={vm} />);
    // The damage label itself is the breakdown trigger.
    fireEvent.click(screen.getByRole("button", { name: "Damage breakdown" }));
    const pop = screen.getByRole("dialog");
    expect(pop).toHaveTextContent("+3");
    expect(pop).toHaveTextContent("Rage");
    // The breakdown is a formula decomposition — its lines container carries
    // the selective machine-translation opt-out.
    const value = within(pop).getByText("+2");
    expect(value.closest('[translate="no"]')).not.toBeNull();
  });

  it("the to-hit value opens its own per-source breakdown popover (#94)", () => {
    const vm: WeaponFactsVM = {
      ...COMPONENT_VM,
      attackBreakdown: [
        { kind: "ability", ability: "DEX", value: "+3" },
        { kind: "term", term: "character.proficiencyBonus", value: "+2" },
        { kind: "loc", label: "Archery", value: "+2" },
      ],
    };
    render(<WeaponFacts facts={vm} />);
    // The to-hit VALUE is the trigger (rubric "Breakdown") — distinct from the
    // label's "to hit" GlossaryTip. Opening it shows the per-source lines.
    fireEvent.click(screen.getByRole("button", { name: "Breakdown" }));
    const pop = screen.getByRole("dialog");
    expect(pop).toHaveTextContent("+3");
    expect(pop).toHaveTextContent("Archery");
    // Formula decomposition → the selective machine-translation opt-out.
    const value = within(pop).getByText("+3");
    expect(value.closest('[translate="no"]')).not.toBeNull();
  });

  it("a to-hit override suppresses the value breakdown (null → plain number)", () => {
    const vm: WeaponFactsVM = { ...COMPONENT_VM, attackBreakdown: null };
    render(<WeaponFacts facts={vm} />);
    // No "Breakdown" trigger on the to-hit value when there's no composition.
    expect(screen.queryByRole("button", { name: "Breakdown" })).toBeNull();
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  it("every known term wears a GlossaryTip; an id-less custom chip stays plain", () => {
    render(<WeaponFacts facts={COMPONENT_VM} />);
    for (const name of [
      "Learn about Martial",
      "Learn about Finesse",
      "Learn about Sap",
      // The rubric strips the per-weapon parenthetical — "Thrown", not
      // "Thrown (Range 20/60)" (the numbers stay on the visible chip).
      "Learn about Thrown",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Homebrew Quirk")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Learn about Homebrew Quirk" })
    ).toBeNull();
  });

  it("tapping a property chip opens the plain-language explanation (EN body)", () => {
    render(<WeaponFacts facts={COMPONENT_VM} />);
    fireEvent.click(screen.getByRole("button", { name: "Learn about Finesse" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Attack with Strength or Dexterity"
    );
  });

  it("tapping the mastery chip explains the mastery (IT body)", async () => {
    await i18n.changeLanguage("it");
    render(<WeaponFacts facts={COMPONENT_VM} />);
    fireEvent.click(screen.getByRole("button", { name: "Scopri cosa significa Sap" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Maestria nelle armi");
  });
});

// ── the shared-recipe guard ───────────────────────────────────────────────────

describe("weapon facts — both surfaces render the ONE shared component", () => {
  const src = (rel: string) =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../src", rel),
      "utf-8"
    );

  it.each([
    ["features/character/center/tabs/PlayTab.tsx"],
    ["features/character/center/tabs/inventory/WeaponCard.tsx"],
  ])("%s imports @/components/shared/WeaponFacts", (rel) => {
    expect(src(rel)).toContain('from "@/components/shared/WeaponFacts"');
  });
});
