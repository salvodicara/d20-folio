/**
 * LevelUpWizard (the wizard-F route) — integration parity for the contracts the
 * old LevelUpModal tests pinned, RE-HOMED onto the stepped route (the modal was
 * superseded → deleted): metamagic multi-pick, subclass maneuvers (#29),
 * subclass build-bundles (#29), the recurring School Savant entitlement (A2),
 * the ASI feat's INLINE attributed asks (owner 2026-06-10) — now living in the
 * morph list's asks column — and the NEW #36 multiclass class fork (legal
 * classes offered, illegal filtered, single-class zero-friction default).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { makeCharacterDoc } from "./_helpers";
import { useCharacterStore } from "@/stores/characterStore";
import { useAuthStore } from "@/stores/authStore";
import i18n from "@/i18n";

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));
vi.mock("@/lib/firestore", () => ({
  updateCharacter: vi.fn().mockResolvedValue(undefined),
  saveCharacterSnapshot: vi.fn().mockResolvedValue(undefined),
}));
// The route normally subscribes to Firestore; tests preset the store directly.
vi.mock("@/hooks/useCharacterSubscription", () => ({
  useCharacterSubscription: () => {},
}));

import { LevelUpWizard } from "@/features/leveling/LevelUpWizard";

function renderWizard() {
  const router = createMemoryRouter(
    [
      { path: "/characters/:characterId/level-up", element: <LevelUpWizard /> },
      // The completion CTA's destination — a stub so the test can assert the
      // navigation actually happened (the ceremony never auto-dismisses).
      { path: "/characters/:characterId", element: <div data-testid="sheet-stub" /> },
    ],
    { initialEntries: ["/characters/c1/level-up"] }
  );
  return { ...render(<RouterProvider router={router} />), router };
}

/** Advance to the next step via the footer CTA ("Continue to <step>"). */
function clickContinue() {
  const btn = screen
    .getAllByRole("button")
    .find((b) => /^Continue to /.test(b.textContent));
  if (!btn) throw new Error("Continue button not found");
  fireEvent.click(btn);
}

function setChar(over: Parameters<typeof makeCharacterDoc>[0], session?: object) {
  useAuthStore.setState({ user: { uid: "u1" } as never });
  useCharacterStore.setState({
    loading: false,
    character: makeCharacterDoc(over, session),
  });
}

// ─── metamagic (multi-pick on the wizard-F pick list — C1) ────────────────────

/** The `.wiz-pick` block whose head matches `re` (the F pick-list scope). */
function pickListByHeading(re: RegExp): HTMLElement {
  const heading = screen.getByText(re);
  const block = heading.closest(".wiz-pick");
  if (!block) throw new Error(`pick list not found: ${re}`);
  return block as HTMLElement;
}

/** Read-then-choose: expand the row by name, then hit its explicit commit CTA. */
function expandAndChoose(scope: HTMLElement, name: string) {
  const row = within(scope)
    .getAllByRole("button")
    .find((b) => b.classList.contains("wiz-row") && b.textContent.includes(name));
  if (!row) throw new Error(`row not found: ${name}`);
  fireEvent.click(row); // unfold the reading prose (never commits)
  const commit = within(scope)
    .getAllByRole("button")
    .find((b) => new RegExp(`^Choose ${name}`).test(b.textContent));
  if (!commit) throw new Error(`commit CTA not found: ${name}`);
  fireEvent.click(commit);
}

describe("LevelUpWizard — metamagic picker (Sorcerer 1→2)", () => {
  beforeEach(() => {
    setChar({
      classes: [{ classId: "sorcerer", level: 1 }],
      hitDieType: 6,
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 16 },
      savingThrows: ["CON", "CHA"],
    });
  });

  it("the Choices step renders F pick rows; reading never commits, Choose does, FIFO at the cap", () => {
    renderWizard();
    clickContinue(); // hp → choices
    const list = pickListByHeading(/Choose \d+ Metamagic/i);
    const rowNames = within(list)
      .getAllByRole("button")
      .filter((b) => b.classList.contains("wiz-row"))
      .map((b) => b.querySelector(".wiz-row-name")?.textContent);
    expect(rowNames.length).toBeGreaterThan(2);
    const [a, b, c] = rowNames;
    if (!a || !b || !c) throw new Error("need three options");
    // Expanding a row to READ does not commit (the counter stays 0).
    const firstRow = within(list)
      .getAllByRole("button")
      .find((x) => x.classList.contains("wiz-row") && x.textContent.includes(a));
    fireEvent.click(firstRow as HTMLElement);
    expect(within(list).getByText("0 / 2")).toBeInTheDocument();
    // Explicit Choose commits — twice fills the pool.
    const commit = within(list)
      .getAllByRole("button")
      .find((x) => new RegExp(`^Choose ${a}`).test(x.textContent));
    fireEvent.click(commit as HTMLElement);
    expandAndChoose(pickListByHeading(/Choose \d+ Metamagic/i), b);
    expect(
      within(pickListByHeading(/Choose \d+ Metamagic/i)).getByText("2 / 2")
    ).toBeInTheDocument();
    // A third pick FIFO-replaces the OLDEST (the spell/feat picker rule).
    expandAndChoose(pickListByHeading(/Choose \d+ Metamagic/i), c);
    const picked = Array.from(
      pickListByHeading(/Choose \d+ Metamagic/i).querySelectorAll(
        ".wiz-entry[data-picked] .wiz-row-name"
      )
    ).map((el) => el.textContent);
    expect(picked).toHaveLength(2);
    expect(picked).toContain(b);
    expect(picked).toContain(c);
    expect(picked).not.toContain(a);
  });
});

// ─── Subclass maneuvers (#29, ported) ──────────────────────────────────────────

// (The maneuver picker pins — a pack subclass — live in
// `content-pack/tests/unit/level-up-wizard.pack.test.tsx`.)

// ─── Champion "Additional Fighting Style" (2024 fighter:champion, L7) ──────────
// The wizard's fighting-style gate read only the BASE class table row, so the
// SECOND Fighting Style the Champion grants at L7 (subclass feature) was never
// surfaced. The gate now reads `getFeaturesAtLevel` (which includes subclass
// features), scoped to the effective subclass — so a Champion 6→7 is prompted,
// and a non-Champion Fighter 6→7 is not.

describe("LevelUpWizard — Champion Additional Fighting Style (Fighter 6→7)", () => {
  it("a Champion 6→7 is prompted for a 2nd Fighting Style, excluding the owned one", () => {
    setChar({
      classes: [{ classId: "fighter", subclassId: "champion", level: 6 }],
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
      // The base L1 style already chosen (Archery) — it must be EXCLUDED (distinct).
      features: [
        { srdId: "fighter-fighting-style" },
        { srdId: "archery" },
        { srdId: "fighter-champion-improved-critical" },
      ],
    });
    renderWizard();
    clickContinue(); // hp → choices
    const list = pickListByHeading(/Choose a Fighting Style/i);
    const names = Array.from(list.querySelectorAll(".wiz-row-name")).map(
      (el) => el.textContent
    );
    expect(names.length).toBeGreaterThan(2);
    expect(names.some((n) => /^Archery$/i.test(n))).toBe(false); // owned → excluded
    expect(names.some((n) => /^Defense$/i.test(n))).toBe(true);
  });

  it("a non-Champion Fighter 6→7 is NOT prompted for a Fighting Style", () => {
    setChar({
      classes: [
        {
          classId: "fighter",
          subclassId: "battle-master",
          level: 6,
          maneuverChoices: ["ambush"],
        },
      ],
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
      features: [
        { srdId: "fighter-fighting-style" },
        { srdId: "archery" },
        { srdId: "fighter-battle-master-combat-superiority" },
      ],
    });
    renderWizard();
    clickContinue(); // hp → choices
    expect(screen.queryByText(/Choose a Fighting Style/i)).toBeNull();
  });
});

// ─── caster Fighting Styles (Blessed / Druidic Warrior) ───────────────────────
// The two 2024 caster Fighting Styles are class-locked: Blessed Warrior is a
// Paladin-only option (2 Cleric cantrips, CHA), Druidic Warrior a Ranger-only
// one (2 Druid cantrips, WIS). Picking one surfaces a cantrip sub-pick INLINE
// under the style picker — the SAME shared feature-choices section Magic
// Initiate uses (no parallel picker). The wiring test pins: the style is
// offered to the right class only, and selecting it reveals the cantrip picker.

// (The Blessed/Druidic Warrior caster-style pins — pack fighting styles —
// live in `content-pack/tests/unit/level-up-wizard.pack.test.tsx`.)

// ─── subclass build-bundles (#29, ported) ─────────────────────────────────────

describe("LevelUpWizard — unchosen Divine Order bundle (Cleric 5→6)", () => {
  beforeEach(() => {
    setChar(
      {
        classes: [{ classId: "cleric", level: 5 }],
        hitDieType: 8,
        abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 8 },
        savingThrows: ["WIS", "CHA"],
        features: [{ srdId: "cleric-divine-order" }, { srdId: "cleric-spellcasting" }],
      },
      { grantBundleChoices: {} }
    );
  });

  it("surfaces the bundle on the Choices step and commits a pick", () => {
    renderWizard();
    clickContinue(); // hp → choices
    const selector = screen.getByTestId("grant-bundle-selector");
    expect(within(selector).getByText("Divine Order")).toBeInTheDocument();
    const protector = within(selector).getByRole("button", { name: "Protector" });
    fireEvent.click(protector);
    expect(within(selector).getByRole("button", { name: "Protector" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});

// ─── recurring School Savant (A2, ported) ─────────────────────────────────────

// (The recurring School Savant pins — the Abjurer subclass is pack content,
// and the public Evoker carries no Savant feature — live in
// `content-pack/tests/unit/level-up-wizard.pack.test.tsx`.)

// ─── the ASI feat's INLINE asks (owner 2026-06-10, re-homed to the asks column) ─

describe("LevelUpWizard — the boon feat's asks expand INSIDE its entry, attributed", () => {
  beforeEach(() => {
    setChar({
      classes: [
        {
          classId: "fighter",
          subclassId: "champion",
          level: 3,
          weaponMasteries: ["longsword", "greatsword", "flail"],
        },
      ],
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
      savingThrows: ["STR", "CON"],
    });
  });

  function gotoBoonFeatList() {
    renderWizard();
    clickContinue(); // hp → boon
    fireEvent.click(screen.getByRole("button", { name: "Choose a Feat" })); // fork tab
  }

  function openAndChoose(name: string) {
    const row = screen
      .getAllByRole("button")
      .find((b) => b.classList.contains("wiz-row") && b.textContent.includes(name));
    if (!row) throw new Error(`row not found: ${name}`);
    fireEvent.click(row); // read
    fireEvent.click(screen.getByRole("button", { name: `Choose ${name}` })); // commit
  }

  it("choosing Magic Initiate opens its asks INSIDE its own entry (one attribution)", () => {
    gotoBoonFeatList();
    openAndChoose("Magic Initiate (Cleric)");
    const entry = document.querySelector('[data-fid="magic-initiate-cleric"]');
    expect(entry).toHaveAttribute("data-chosen");
    // The asks column hosts the feat's spell slots — attribution is the entry
    // itself, so NO "From <feat>" cause-head renders inside it (rule 19).
    const asks = entry?.querySelector(".wiz-asks");
    expect(asks).not.toBeNull();
    expect(asks).toHaveTextContent(/Pick 2/);
    expect(asks).toHaveTextContent(/Pick 1/);
    expect(asks?.querySelector(".cause-block")).toBeNull();
    // The asks track is OPEN on the one persistent spread.
    expect(entry?.querySelector(".wiz-spread")).toHaveAttribute("data-asks");
    // No far-away Choices step exists for the feat's own slots.
    expect(screen.queryByText("Feature Choices")).toBeNull();
  });

  it("a half-feat's +1 ability picker renders INSIDE the asks column and commits", () => {
    gotoBoonFeatList();
    openAndChoose("Grappler");
    const entry = document.querySelector('[data-fid="grappler"]');
    const asks = entry?.querySelector(".wiz-asks");
    expect(asks).not.toBeNull();
    const hint = screen.getByText(/Choose which ability to increase/i);
    expect((asks as HTMLElement).contains(hint)).toBe(true);
    const chip = within(asks as HTMLElement)
      .getAllByRole("button")
      .find((b) => b.classList.contains("lvl-pick") && /STR/.test(b.textContent));
    if (!chip) throw new Error("STR chip not found");
    fireEvent.click(chip);
    const chipAfter = within(
      document.querySelector('[data-fid="grappler"] .wiz-asks') as HTMLElement
    )
      .getAllByRole("button")
      .find((b) => b.classList.contains("lvl-pick") && /STR/.test(b.textContent));
    expect(chipAfter).toHaveClass("selected");
  });

  it("a no-asks feat (Alert) keeps the asks track CLOSED when chosen", () => {
    gotoBoonFeatList();
    openAndChoose("Alert");
    const entry = document.querySelector('[data-fid="alert"]');
    expect(entry).toHaveAttribute("data-chosen");
    expect(entry?.querySelector(".wiz-spread")).not.toHaveAttribute("data-asks");
  });
});

// ─── D7 — the L19 Epic Boon gate: feat-only, no ASI fork ──────────────────────────

describe("LevelUpWizard — L19 Epic Boon gate (D7)", () => {
  beforeEach(() => {
    setChar({
      classes: [{ classId: "fighter", subclassId: "champion", level: 18 }],
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
      savingThrows: ["STR", "CON"],
    });
  });

  it("the boon step shows NO +2/+1 ASI fork and offers ONLY Epic Boon feats", () => {
    renderWizard();
    clickContinue(); // hp → boon
    // The +2/+1 ASI fork tabs are SUPPRESSED at the epic-boon gate (2024 RAW grants
    // specifically an Epic Boon feat — no bare ASI, no general feat).
    expect(screen.queryByRole("button", { name: /^\+2$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose a Feat" })).toBeNull();
    // The feat rows that DO render are all Epic Boon feats (category-restricted pool).
    const rowNames = screen
      .getAllByRole("button")
      .filter((b) => b.classList.contains("wiz-row"))
      .map((b) => b.querySelector(".wiz-row-name")?.textContent ?? "");
    expect(rowNames.length).toBeGreaterThan(0);
    // Boon of Combat Prowess / Irresistible Offense / etc. — every offered row is an
    // Epic Boon (their names all start with "Boon of ").
    expect(rowNames.every((n) => /^Boon of /.test(n))).toBe(true);
  });
});

// ─── #36 — the multiclass class fork ──────────────────────────────────────────

describe("LevelUpWizard — the multiclass fork (#36)", () => {
  it("offers RAW-legal new classes only; picking one routes the wizard to its L1", () => {
    setChar({
      classes: [
        {
          classId: "fighter",
          subclassId: "champion",
          level: 4,
          weaponMasteries: ["longsword", "greatsword", "flail"],
        },
      ],
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 14 },
      savingThrows: ["STR", "CON"],
    });
    renderWizard();
    // The fork gallery is on the HP step: legal classes offered, illegal filtered.
    expect(screen.getByText(/Which class advances/i)).toBeInTheDocument();
    // Compare card NAMES (a legal class's gloss may mention another class).
    const cardNames = screen
      .getAllByRole("option")
      .map((c) => c.querySelector(".wiz-card-name")?.textContent);
    expect(cardNames).toContain("Bard"); // CHA 14 ≥ 13
    expect(cardNames).not.toContain("Wizard"); // INT 10 — filtered
    expect(cardNames).not.toContain("Monk"); // DEX/WIS < 13
    // Default = advance the primary (Fighter chosen).
    const fighterCard = screen
      .getAllByRole("option")
      .find((c) => c.textContent.includes("Fighter"));
    expect(fighterCard).toHaveAttribute("aria-selected", "true");
    // Picking Bard reroutes: the eyebrow context + later steps now serve Bard L1.
    const bardCard = screen
      .getAllByRole("option")
      .find((c) => c.textContent.includes("Bard"));
    if (!bardCard) throw new Error("Bard card not found");
    fireEvent.click(bardCard);
    expect(bardCard).toHaveAttribute("aria-selected", "true");
    // Bard L1 asks for its spells → a Spells step appears in the orbs.
    expect(screen.getByRole("button", { name: "Spells" })).toBeInTheDocument();
    // The Choices step carries the multiclass skill pick, attributed to Bard.
    clickContinue(); // hp → choices
    expect(
      screen.getByText(/Choose 1 skill \(multiclassing into Bard\)/i)
    ).toBeInTheDocument();
    // The entry-grant note lists Bard's partial proficiencies. P2 wrapped
    // "Multiclassing" in a GlossaryTip slot, so the sentence spans elements —
    // match on the note paragraph's CONCATENATED text, not a single text node.
    const mcNote = Array.from(document.querySelectorAll("p")).find((p) =>
      /Multiclassing into Bard grants/i.test(p.textContent)
    );
    expect(mcNote).toBeTruthy();
    // The gloss trigger itself is wired to the multiclass glossary entry.
    expect(
      screen.getByRole("button", { name: /learn about multiclassing/i })
    ).toBeInTheDocument();
  });

  it("a Jack-of-All-Trades bard multiclassing into Rogue still gets the unowned class skills (the live 'Nessun risultato' dead-end)", () => {
    // Live-fixture-shaped: a Bard 3 whose rehydrated skills map carries a JoAT
    // `halfProficiency` entry for EVERY unproficient skill — so a presence-keyed
    // "owned" filter sees all 18 skills as taken and renders an EMPTY pool
    // (the owner's Ladro dead-end, 2026-06-11). Half proficiency is a check
    // bonus, NOT a proficiency — it must never block the pick.
    setChar({
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 3 }],
      hitDieType: 8,
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 16 },
      savingThrows: ["DEX", "CHA"],
      skills: {
        acrobatics: "proficient",
        stealth: "expertise",
        "sleight-of-hand": "proficient",
        performance: "proficient",
        persuasion: "expertise",
        deception: "proficient",
        perception: "proficient",
        investigation: "proficient",
        insight: "proficient",
        // the JoAT refill (`rehydrateCharacter` writes these on every load):
        "animal-handling": "halfProficiency",
        arcana: "halfProficiency",
        athletics: "halfProficiency",
        history: "halfProficiency",
        intimidation: "halfProficiency",
        medicine: "halfProficiency",
        nature: "halfProficiency",
        religion: "halfProficiency",
        survival: "halfProficiency",
      },
    });
    renderWizard();
    const rogueCard = screen
      .getAllByRole("option")
      .find((c) => c.querySelector(".wiz-card-name")?.textContent === "Rogue");
    if (!rogueCard) throw new Error("Rogue card not found");
    fireEvent.click(rogueCard);
    clickContinue(); // hp → choices
    const list = pickListByHeading(/Choose 1 skill \(multiclassing into Rogue\)/i);
    // EXACTLY the rogue-list skills he is not REALLY proficient in — never an
    // empty pool, never the unscoped 18-skill fallback.
    const names = within(list)
      .getAllByRole("button")
      .filter((b) => b.classList.contains("wiz-row"))
      .map((b) => b.querySelector(".wiz-row-name")?.textContent);
    expect(names).toEqual(["Athletics", "Intimidation"]);
    expect(within(list).queryByText(/No results/i)).toBeNull();
    // Both option ids resolve to localized names in BOTH locales (rule 9).
    const tIt = i18n.getFixedT("it");
    expect(tIt("skills.athletics")).toBe("Atletica");
    expect(tIt("skills.intimidation")).toBe("Intimidire");
    // A tap commits the fact pick and completes the requirement (1 / 1).
    const athleticsRow = within(list)
      .getAllByRole("button")
      .find((b) => b.querySelector(".wiz-row-name")?.textContent === "Athletics");
    if (!athleticsRow) throw new Error("Athletics row not found");
    fireEvent.click(athleticsRow);
    expect(within(list).getByText("1 / 1")).toBeInTheDocument();
  });

  it("already proficient in the WHOLE class list ⇒ no skill ask at all (clamped, never unfulfillable)", () => {
    setChar({
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 3 }],
      hitDieType: 8,
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 16 },
      savingThrows: ["DEX", "CHA"],
      // Every skill on the Rogue multiclass list is already a REAL proficiency.
      skills: {
        acrobatics: "proficient",
        athletics: "proficient",
        deception: "proficient",
        insight: "proficient",
        intimidation: "proficient",
        investigation: "proficient",
        perception: "proficient",
        persuasion: "proficient",
        "sleight-of-hand": "proficient",
        stealth: "expertise",
      },
    });
    renderWizard();
    const rogueCard = screen
      .getAllByRole("option")
      .find((c) => c.querySelector(".wiz-card-name")?.textContent === "Rogue");
    if (!rogueCard) throw new Error("Rogue card not found");
    fireEvent.click(rogueCard);
    clickContinue(); // hp → choices
    // Nothing to gain ⇒ the ask DISAPPEARS (rule 19) — never a 0-option
    // requirement the wizard can't complete.
    expect(screen.queryByText(/Choose 1 skill \(multiclassing into Rogue\)/i)).toBeNull();
  });

  it("a single-class character with no legal second class sees NO fork at all", () => {
    setChar({
      classes: [
        {
          classId: "fighter",
          subclassId: "champion",
          level: 4,
          weaponMasteries: ["longsword", "greatsword", "flail"],
        },
      ],
      hitDieType: 10,
      // STR 12 — the fighter fails its OWN multiclass prerequisite → no fork.
      abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 10 },
      savingThrows: ["STR", "CON"],
    });
    renderWizard();
    expect(screen.queryByText(/Which class advances/i)).toBeNull();
  });
});

// ─── B5/A2 — the spell swap is its OWN step, scoped to it alone ───────────────

describe("LevelUpWizard — the spell-swap step (Bard 3→4)", () => {
  beforeEach(() => {
    setChar({
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 3 }],
      hitDieType: 8,
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 16 },
      savingThrows: ["DEX", "CHA"],
      spells: [
        { srdId: "vicious-mockery" },
        { srdId: "healing-word", prepared: true },
        { srdId: "dissonant-whispers", prepared: true },
      ],
    });
  });

  const swapHead = /1\. Choose a spell to replace/i;

  /** Read-then-Learn the first visible spell row. */
  function learnFirstVisible() {
    const row = screen
      .getAllByRole("button")
      .find((b) => b.classList.contains("wiz-row"));
    if (!row) throw new Error("no spell row");
    fireEvent.click(row);
    const learn = screen
      .getAllByRole("button")
      .find((b) => /^Learn /.test(b.textContent));
    if (!learn) throw new Error("no Learn CTA");
    fireEvent.click(learn);
  }

  /** Walk hp → boon(+2 CHA) → spells (learn the required picks). */
  function walkToSpellsComplete() {
    clickContinue(); // hp → boon
    fireEvent.click(screen.getByRole("button", { name: /^CHA/i }));
    clickContinue(); // boon → spells
    learnFirstVisible();
    const cantripTab = screen
      .getAllByRole("button")
      .find(
        (b) => b.classList.contains("wiz-fork-tab") && /Cantrips/.test(b.textContent)
      );
    if (cantripTab) {
      fireEvent.click(cantripTab);
      learnFirstVisible();
    }
  }

  it("A2 — the swap UI renders ONLY on its own orb step, never stacked elsewhere", () => {
    renderWizard();
    // The swap has its own orb…
    expect(screen.getByRole("button", { name: "Spell Swap" })).toBeInTheDocument();
    // …and its UI is absent from the hp, boon and SPELLS steps (the regression:
    // it used to render stacked under the new-spell list).
    expect(screen.queryByText(swapHead)).toBeNull();
    walkToSpellsComplete();
    expect(screen.queryByText(swapHead)).toBeNull();
    clickContinue(); // spells → swap
    expect(screen.getByText(swapHead)).toBeInTheDocument();
  });

  it("offers known spells in the removing voice; the replacement gates to the same level", () => {
    renderWizard();
    walkToSpellsComplete();
    clickContinue(); // spells → swap
    expect(screen.queryByText(/2\. Choose your replacement/i)).toBeNull();
    const dissonant = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.classList.contains("wiz-row") && b.textContent.includes("Dissonant Whispers")
      );
    if (!dissonant) throw new Error("Dissonant Whispers row not found");
    fireEvent.click(dissonant); // read (never commits)
    fireEvent.click(screen.getByRole("button", { name: /Replace Dissonant Whispers/i }));
    // The row wears the REMOVING (vermilion) voice, not the gold pick.
    const entry = document.querySelector('[data-fid="dissonant-whispers"]');
    expect(entry).toHaveAttribute("data-removing");
    expect(entry).not.toHaveAttribute("data-picked");
    // The replacement phase appears, gated to the removed spell's level.
    expect(screen.getByText(/2\. Choose your replacement/i)).toBeInTheDocument();
    expect(screen.getByText(/Level 1 only/i)).toBeInTheDocument();
  });

  // Regression (golden rule 13): the commit step applies the swap via the shared
  // `applySpellSwap` helper — the removed SRD spell is dropped and the chosen
  // replacement appended, the OTHER known spells preserved. Pins the rewire that
  // replaced the wizard's verbatim re-implementation with the tested helper. If
  // the commit dropped/reordered the wrong entry, this fails.
  it("commits the chosen swap into the saved spells (drop removed, add replacement, keep the rest)", async () => {
    renderWizard();
    walkToSpellsComplete();
    clickContinue(); // spells → swap

    // 1. choose Dissonant Whispers (Level 1) as the spell to replace.
    const dissonant = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.classList.contains("wiz-row") && b.textContent.includes("Dissonant Whispers")
      );
    if (!dissonant) throw new Error("Dissonant Whispers row not found");
    fireEvent.click(dissonant); // read
    fireEvent.click(screen.getByRole("button", { name: /Replace Dissonant Whispers/i }));

    // 2. learn the first eligible Level-1 replacement (not an already-known
    //    spell). `data-fid` lives on the `.wiz-entry`; its `.wiz-row` button +
    //    Learn CTA are children. Capture its srdId to assert on later.
    const known = new Set(["vicious-mockery", "healing-word", "dissonant-whispers"]);
    const replEntry = Array.from(
      document.querySelectorAll<HTMLElement>(".wiz-entry[data-fid]")
    ).find((e) => {
      const fid = e.getAttribute("data-fid");
      return fid != null && !known.has(fid);
    });
    if (!replEntry) throw new Error("no replacement entry found");
    const replId = replEntry.getAttribute("data-fid");
    if (!replId) throw new Error("replacement entry has no data-fid");
    const replRow = replEntry.querySelector<HTMLButtonElement>(".wiz-row");
    if (!replRow) throw new Error("replacement row button not found");
    fireEvent.click(replRow); // read (unfolds its Learn CTA)
    const learn = within(replEntry)
      .getAllByRole("button")
      .find((b) => /^Learn /.test(b.textContent));
    if (!learn) throw new Error("Learn CTA for the replacement not found");
    fireEvent.click(learn);

    // 3. drive to confirm and apply the level-up.
    clickContinue(); // swap → review
    const confirm = screen
      .getAllByRole("button")
      .find((b) => /^Confirm: Level 4/.test(b.textContent));
    if (!confirm) throw new Error("confirm CTA not found");
    // `setCharacter(updatedDoc)` runs synchronously in the confirm handler
    // (before its `await updateCharacter`); flush the trailing async write so no
    // act() warning escapes.
    fireEvent.click(confirm);
    await act(async () => {
      await Promise.resolve();
    });

    // The committed character carries the swap: replacement in, removed out, the
    // other two known spells untouched.
    const saved = useCharacterStore.getState().character;
    if (!saved) throw new Error("no character in store after commit");
    const srdIds = saved.character.spells
      .filter((s): s is { srdId: string } => "srdId" in s)
      .map((s) => s.srdId);
    expect(srdIds).toContain(replId);
    expect(srdIds).not.toContain("dissonant-whispers");
    expect(srdIds).toContain("healing-word");
    expect(srdIds).toContain("vicious-mockery");
  });
});

// ─── A3 — the completion banner reports the ACHIEVED level ────────────────────

describe("LevelUpWizard — the completion ceremony (A3 + no auto-dismiss)", () => {
  function driveToCeremony() {
    setChar({
      classes: [
        {
          classId: "fighter",
          subclassId: "champion",
          // L5→6: an ASI boon level that is NOT a Weapon Mastery threshold
          // (the column is 4 at both L5 and L6), so the flow is hp → boon →
          // review with no Feature Choices step — keeping this test about the
          // completion ceremony, not the #30 mastery picker.
          level: 5,
          weaponMasteries: ["longsword", "greatsword", "flail"],
        },
      ],
      hitDieType: 10,
      // STR 12: no multiclass fork; level 6 = ASI boon.
      abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 10 },
      savingThrows: ["STR", "CON"],
    });
    renderWizard();
    clickContinue(); // hp → boon
    fireEvent.click(screen.getByRole("button", { name: /^STR/i })); // +2 STR
    clickContinue(); // boon → review
    const confirm = screen
      .getAllByRole("button")
      .find((b) => /^Confirm: Level 6/.test(b.textContent));
    if (!confirm) throw new Error("confirm CTA not found");
    fireEvent.click(confirm);
  }

  it("5→6 says 'Level 6!', never the next level (off-by-one regression)", async () => {
    driveToCeremony();
    // The banner celebrates the level REACHED (6) — the store advancing
    // underneath must not bump it to 7.
    expect(await screen.findByText("Level 6!")).toBeInTheDocument();
    expect(screen.queryByText("Level 7!")).toBeNull();
  });

  it("NEVER auto-dismisses; the explicit CTA is the one way to the sheet (owner 2026-06-11)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      driveToCeremony();
      expect(await screen.findByText("Level 6!")).toBeInTheDocument();
      // Far past the old 2.2s timer: the ceremony must STILL be on screen —
      // the user reads it at their own pace.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(screen.getByText("Level 6!")).toBeInTheDocument();
      expect(screen.queryByTestId("sheet-stub")).toBeNull();
      // ONE clear primary CTA dismisses — to the character sheet.
      fireEvent.click(screen.getByRole("button", { name: /To the sheet/i }));
      expect(await screen.findByTestId("sheet-stub")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── subclass step (gallery, ported from the OptionGrid step) ─────────────────

describe("LevelUpWizard — the subclass gallery (Fighter 2→3)", () => {
  beforeEach(() => {
    setChar({
      classes: [
        {
          classId: "fighter",
          level: 2,
          weaponMasteries: ["longsword", "greatsword", "flail"],
        },
      ],
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
    });
  });

  it("renders one plaque per subclass; picking marks it selected", () => {
    renderWizard();
    clickContinue(); // hp → subclass
    const champion = screen
      .getAllByRole("option")
      .find((c) => c.textContent.includes("Champion"));
    expect(champion).toBeDefined();
    if (!champion) return;
    expect(champion).toHaveAttribute("aria-selected", "false");
    fireEvent.click(champion);
    expect(champion).toHaveAttribute("aria-selected", "true");
  });

  it("enthrones the chosen subclass with its granted features (detail on selected)", () => {
    renderWizard();
    clickContinue(); // hp → subclass
    const champion = screen
      .getAllByRole("option")
      .find((c) => c.textContent.includes("Champion"));
    if (!champion) throw new Error("Champion plaque not found");
    fireEvent.click(champion);
    // The hero altar reveals the unlock-level feature by name (Improved Critical).
    const hero = document.querySelector(".wiz-hero");
    expect(hero).not.toBeNull();
    expect(hero?.textContent).toMatch(/Improved Critical/i);
    // Release is an in-place undo on the altar itself (§2.7.1).
    fireEvent.click(within(hero as HTMLElement).getByRole("button"));
    expect(document.querySelector(".wiz-hero.empty")).not.toBeNull();
  });

  it("the review recap lists the subclass row as a ONE-TAP jump back to its step", () => {
    renderWizard();
    clickContinue(); // hp → subclass
    const champion = screen
      .getAllByRole("option")
      .find((c) => c.textContent.includes("Champion"));
    if (!champion) throw new Error("Champion plaque not found");
    fireEvent.click(champion);
    clickContinue(); // subclass → review
    // The recap attributes the choice…
    const row = screen
      .getAllByRole("button")
      .find(
        (b) =>
          b.classList.contains("wiz-review-jump") && b.textContent.includes("Champion")
      );
    expect(row).toBeDefined();
    // …and the chosen subclass's feature joins the New Features reveal.
    expect(screen.getByText(/^Improved Critical$/i)).toBeInTheDocument();
    if (!row) return;
    // One tap jumps back to the owning step.
    fireEvent.click(row);
    expect(screen.getByText(/Choose Your Subclass/i)).toBeInTheDocument();
  });
});

// ─── HP step — the constrained manual roll (§15.7 / golden rule 20) ───────────

describe("LevelUpWizard — manual HP roll is constrained to the die", () => {
  beforeEach(() => {
    setChar({
      classes: [{ classId: "fighter", level: 4 }],
      hitDieType: 10,
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
    });
  });

  it("typing an out-of-range roll clamps to [1, hitDie]", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /Manual Roll/i }));
    // The roll is now the shared clamped NumberStepper (a role=spinbutton field):
    // the committed value clamps to [1, hitDie] regardless of what is typed (the
    // draft reverts on blur), so a 99 / 0 is unrepresentable.
    const field = screen.getByRole("spinbutton", { name: /Manual Roll/i });
    fireEvent.change(field, { target: { value: "99" } });
    fireEvent.blur(field);
    expect(field).toHaveValue("10");
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.blur(field);
    expect(field).toHaveValue("1");
  });

  it("every valid roll value is tappable — one die-face button per face", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /Manual Roll/i }));
    const faces = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));
    expect(faces).toHaveLength(10);
    const seven = faces.find((b) => b.textContent === "7");
    expect(seven).toBeDefined();
    if (!seven) return;
    fireEvent.click(seven);
    expect(seven).toHaveAttribute("aria-pressed", "true");
    // The stepper field reflects the tapped face — one shared state.
    expect(screen.getByRole("spinbutton", { name: /Manual Roll/i })).toHaveValue("7");
  });

  it("the eyebrow separator is nbsp-glued, so a wrap never orphans a leading '·'", () => {
    renderWizard();
    const eyebrow = document.querySelector(".wiz-eyebrow");
    const text = eyebrow?.textContent ?? "";
    expect(text).toContain("·");
    // A regular space NEVER precedes the "·" (that is what would let a wrap push a
    // stray "·" to the start of the next line); it is glued with a non-breaking one.
    expect(/ ·/.test(text)).toBe(false);
    expect(/\u00A0·/.test(text)).toBe(true);
  });
});
