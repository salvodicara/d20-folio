/**
 * party-encounter — AddMonsterForm full reset (B25) + MonsterInitChip focus/scroll
 * guard (B27). `@/lib/firebase` is stubbed because the module transitively imports
 * `dm-readers` → `@/lib/firestore` → `@/lib/firebase`; `dm-readers` itself is stubbed
 * too since none of these tests touch DM-reader ACL reconciliation.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/dm-readers", () => ({
  recomputeDmReadersForChars: vi.fn(() => Promise.resolve()),
}));

import {
  AddMonsterForm,
  MonsterCard,
  EncounterTurnControls,
  EncounterBudgetReadout,
  EncounterRoundBar,
} from "@/features/campaigns/party-encounter";
import { addMonster, applyHp, startEncounter } from "@/features/campaigns/encounter";
import { monsterPortraitUrl } from "@/data/monster-art";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";
import type { EncounterBudgetView } from "@/features/campaigns/encounter-view";
import type { CustomMonster, EncounterMonster } from "@/types/campaign";

/** A budget view fixture — override the fields a given test cares about. */
function budgetView(over: Partial<EncounterBudgetView> = {}): EncounterBudgetView {
  return {
    budget: { low: 800, moderate: 1200, high: 1600 },
    pendingPcs: 0,
    partySize: 4,
    costedXp: 0,
    uncostedGroups: 0,
    verdict: null,
    ...over,
  };
}

beforeAll(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
  // jsdom has no layout — the current-combatant auto-scroll would throw otherwise.
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

/** A monster group carrying a bestiary `srdId` (a picker-added group). */
function goblinWithSrd(over: Partial<Parameters<typeof addMonster>[1]> = {}) {
  const state = addMonster(startEncounter({}, [], 1), {
    name: "Goblin A",
    ac: 13,
    maxHp: 7,
    count: 3,
    initiative: null,
    srdId: "goblin-warrior",
    ...over,
  });
  return state.combatants[0] as EncounterMonster;
}

// ─── B25 — AddMonsterForm.add() resets EVERY field ──────────────────────────────

describe("AddMonsterForm — submit() resets every field, not just name/count/notes (B25)", () => {
  it("builds the template + count and clears the whole form back to defaults on create", () => {
    const onSubmit = vi.fn();
    render(<AddMonsterForm submitLabel="Add monster" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Monster name"), {
      target: { value: "Ogre" },
    });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "giant" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Initiative" }), {
      target: { value: "18" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "AC" }), {
      target: { value: "11" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Max HP" }), {
      target: { value: "59" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "How many" }), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("DM notes"), {
      target: { value: "Tough boss" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add monster" }));

    // The template (identity, no per-encounter play state) + the per-add count + init.
    expect(onSubmit).toHaveBeenLastCalledWith(
      { name: "Ogre", ac: 11, maxHp: 59, creatureType: "giant", notes: "Tough boss" },
      3,
      18
    );

    // Every field is back to its empty/default state (B25).
    expect(screen.getByLabelText("Monster name")).toHaveValue("");
    expect(screen.getByLabelText("Type")).toHaveValue("");
    expect(screen.getByRole("spinbutton", { name: "Initiative" })).toHaveAttribute(
      "aria-valuenow",
      "10"
    );
    expect(screen.getByRole("spinbutton", { name: "AC" })).toHaveAttribute(
      "aria-valuenow",
      "12"
    );
    expect(screen.getByRole("spinbutton", { name: "Max HP" })).toHaveAttribute(
      "aria-valuenow",
      "10"
    );
    expect(screen.getByRole("spinbutton", { name: "How many" })).toHaveAttribute(
      "aria-valuenow",
      "1"
    );
    expect(screen.getByLabelText("DM notes")).toHaveValue("");

    // A second, genuinely different monster must NOT inherit the Ogre's stale stats.
    fireEvent.change(screen.getByLabelText("Monster name"), {
      target: { value: "Goblin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add monster" }));
    expect(onSubmit).toHaveBeenLastCalledWith(
      { name: "Goblin", ac: 12, maxHp: 10 },
      1,
      10
    );
  });

  it("EDIT mode hides the count stepper and preserves the entry's portrait art", () => {
    const onSubmit = vi.fn();
    render(
      <AddMonsterForm
        submitLabel="Save"
        showCount={false}
        initial={{
          name: "Ashmaw",
          ac: 14,
          maxHp: 33,
          creatureType: "monstrosity",
          portraitUrl: "https://x/monster-ashmaw.jpeg",
          portraitCrop: { x: 1, y: 2, width: 50, height: 60 },
        }}
        onSubmit={onSubmit}
      />
    );
    expect(screen.queryByRole("spinbutton", { name: "How many" })).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: "Initiative" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenLastCalledWith(
      {
        name: "Ashmaw",
        ac: 14,
        maxHp: 33,
        creatureType: "monstrosity",
        portraitUrl: "https://x/monster-ashmaw.jpeg",
        portraitCrop: { x: 1, y: 2, width: 50, height: 60 },
      },
      1,
      null
    );
  });
});

// ─── B27 — MonsterInitChip focuses without scrolling the page ───────────────────

function ogre(): EncounterMonster {
  const state = addMonster(startEncounter({}, [], 1), {
    name: "Ogre",
    ac: 11,
    maxHp: 59,
    count: 1,
    initiative: null,
  });
  return state.combatants[0] as EncounterMonster;
}

describe("MonsterInitChip (via MonsterCard) — focusing the edit input never scrolls the page (B27)", () => {
  it("calls focus with { preventScroll: true } when the DM opens the initiative editor", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(
      <MonsterCard
        campaignId="camp-test"
        monster={ogre()}
        isCurrent={false}
        apply={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Initiative for Ogre" }));
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});

// ─── §C — the DM statblock disclosure + rename ──────────────────────────────────

describe("MonsterCard — DM statblock disclosure (§C.1/§C.2)", () => {
  it("keeps the DM disclosure collapsed when the turn lands on the monster", () => {
    render(
      <MonsterCard
        campaignId="camp-test"
        monster={goblinWithSrd()}
        isCurrent
        apply={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Goblin A 1" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("resolves canonical database art from srdId instead of a stored portrait copy", () => {
    const hawk = goblinWithSrd({
      name: "Hawk",
      srdId: "hawk",
      portraitUrl: "https://x/obsolete-override.jpeg",
    });
    const { container } = render(
      <MonsterCard campaignId="camp-test" monster={hawk} isCurrent apply={vi.fn()} />
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      monsterPortraitUrl("hawk")
    );
  });

  it("a DM card with srdId shows the Statblock button", () => {
    render(
      <MonsterCard
        campaignId="camp-test"
        monster={goblinWithSrd()}
        isCurrent
        apply={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Goblin A 1" }));
    expect(screen.getByRole("button", { name: "Statblock" })).toBeTruthy();
  });

  it("a DM card WITHOUT srdId shows no Statblock button (hand-typed monster)", () => {
    const noSrd = goblinWithSrd({ srdId: undefined });
    render(
      <MonsterCard campaignId="camp-test" monster={noSrd} isCurrent apply={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Statblock" })).toBeNull();
  });

  it("a PLAYER card (no apply) shows NO disclosure body even with srdId (byte-identical player card)", () => {
    render(
      <MonsterCard campaignId="camp-test" monster={goblinWithSrd()} isCurrent={false} />
    );
    // No DM affordances at all — no statblock, no rename, no remove.
    expect(screen.queryByRole("button", { name: "Statblock" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Monster name" })).toBeNull();
  });
});

describe("MonsterCard — DM rename-in-place routes through apply (§C.4)", () => {
  it("committing a new name calls apply (setMonsterName)", () => {
    const apply = vi.fn();
    render(
      <MonsterCard
        campaignId="camp-test"
        monster={goblinWithSrd()}
        isCurrent
        apply={apply}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Goblin A 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Monster name" }));
    const input = screen.getByLabelText("Monster name");
    fireEvent.change(input, { target: { value: "Goblin B" } });
    fireEvent.blur(input);
    expect(apply).toHaveBeenCalled();
  });
});

describe("MonsterCard — init-chip null relaxation once turns begin (§D.3)", () => {
  it("initLocked + a NULL initiative keeps the chip EDITABLE (a fresh reinforcement)", () => {
    render(
      <MonsterCard
        campaignId="camp-test"
        monster={goblinWithSrd({ initiative: null })}
        isCurrent={false}
        initLocked
        apply={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Initiative for Goblin A/ })).toBeTruthy();
  });

  it("initLocked + a SET initiative renders the STATIC chip (locked like every frozen row)", () => {
    render(
      <MonsterCard
        campaignId="camp-test"
        monster={goblinWithSrd({ initiative: 12 })}
        isCurrent={false}
        initLocked
        apply={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Initiative for Goblin A" })).toBeNull();
  });
});

// ─── §D — the DM XP-budget readout ─────────────────────────────────────────────

describe("EncounterBudgetReadout — verdict chip + costed XP + un-costed marker (§D.2/D.3)", () => {
  const t = i18n.getFixedT("en");

  it("renders the verdict chip label + the costed-XP run for a graded encounter", () => {
    render(
      <EncounterBudgetReadout
        budget={budgetView({ costedXp: 1250, verdict: "moderate" })}
      />
    );
    expect(screen.getByText(t("campaignHub.encounterBudgetModerate"))).toBeTruthy();
    expect(
      screen.getByText(t("campaignHub.encounterBudgetXp", { xp: "1,250" }))
    ).toBeTruthy();
  });

  it("shows the un-costed marker when some groups carry no XP", () => {
    render(
      <EncounterBudgetReadout
        budget={budgetView({ costedXp: 200, verdict: "low", uncostedGroups: 2 })}
      />
    );
    expect(
      screen.getByLabelText(t("campaignHub.encounterBudgetUncosted", { count: 2 }))
    ).toHaveTextContent("+2 ?");
  });

  it("withholds the verdict (muted em-dash chip) while the party budget is pending", () => {
    render(
      <EncounterBudgetReadout budget={budgetView({ pendingPcs: 1, verdict: null })} />
    );
    expect(screen.queryByText(t("campaignHub.encounterBudgetModerate"))).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("EncounterRoundBar — the readout is DM-only (§D.3 player row)", () => {
  it("a DM sees the verdict chip", () => {
    render(
      <EncounterRoundBar
        round={2}
        isDm
        budget={budgetView({ costedXp: 1250, verdict: "moderate" })}
        onEnd={() => {}}
      />
    );
    expect(
      screen.getByText(i18n.getFixedT("en")("campaignHub.encounterBudgetModerate"))
    ).toBeTruthy();
  });

  it("a player sees NO readout (no verdict, no XP run) — only the round badge", () => {
    render(
      <EncounterRoundBar
        round={2}
        isDm={false}
        budget={budgetView({ costedXp: 1250, verdict: "moderate" })}
        onEnd={() => {}}
      />
    );
    expect(
      screen.queryByText(i18n.getFixedT("en")("campaignHub.encounterBudgetModerate"))
    ).toBeNull();
  });
});

describe("AddMonsterForm — the optional CR select stores the CR on the template (§D.4)", () => {
  it("choosing a CR stores `cr` on the template; blank stores none", () => {
    const onSubmit = vi.fn<(t: CustomMonster, c: number, i: number | null) => void>();
    render(<AddMonsterForm submitLabel="Add monster" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Monster name"), {
      target: { value: "Goblin" },
    });
    // Blank CR → no `cr` key (the encounter derives XP later via customMonsterToInput).
    fireEvent.click(screen.getByRole("button", { name: "Add monster" }));
    expect(onSubmit.mock.calls[0]?.[0]?.cr).toBeUndefined();

    // Choose CR 1/4 (value "0.25") → the template carries cr:"0.25".
    fireEvent.change(screen.getByLabelText("Monster name"), {
      target: { value: "Goblin" },
    });
    fireEvent.change(screen.getByLabelText("Challenge Rating (CR)"), {
      target: { value: "0.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add monster" }));
    expect(onSubmit.mock.calls[1]?.[0]?.cr).toBe("0.25");

    // The select resets to blank after the add (next monster starts un-costed).
    expect(screen.getByLabelText("Challenge Rating (CR)")).toHaveValue("");
  });

  it("the CR label carries a teaching tooltip explaining Challenge Rating (EN)", () => {
    render(<AddMonsterForm submitLabel="Add monster" onSubmit={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Learn about Challenge Rating (CR)" })
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      enGlossary.glossary.term.challengeRating
    );
  });

  it("the AC / Init / Max HP field labels each carry a teaching tooltip", () => {
    render(<AddMonsterForm submitLabel="Add monster" onSubmit={vi.fn()} />);
    // AC teaches Armor Class; the stepper keeps its own accessible name.
    expect(screen.getByRole("button", { name: "Learn about Armor Class" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Learn about Initiative" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Learn about Hit Points" })).toBeTruthy();
  });
});

describe("EncounterTurnControls — arrow-key discoverability (§3.5)", () => {
  it("exposes aria-keyshortcuts on the DM's Prev/Next turn buttons", () => {
    render(
      <EncounterTurnControls
        canAdvance
        empty={false}
        onPrev={() => {}}
        onNext={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /previous turn/i })).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowLeft"
    );
    expect(screen.getByRole("button", { name: /next turn/i })).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowRight"
    );
  });

  it("renders nothing (no buttons, no shortcut hint) for a player who cannot advance", () => {
    const { container } = render(
      <EncounterTurnControls
        canAdvance={false}
        empty={false}
        onPrev={() => {}}
        onNext={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// ─── Explain-on-demand: the readout's teaching tooltips (difficulty grade · XP) ────

describe("EncounterBudgetReadout — teaching tooltips (explain-on-demand sweep)", () => {
  const t = i18n.getFixedT("en");

  it("the verdict grade opens a glossary popover teaching what the grade means (EN)", () => {
    render(
      <EncounterBudgetReadout
        budget={budgetView({ costedXp: 1250, verdict: "moderate" })}
      />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Learn about ${t("campaignHub.encounterDifficultyRubric")}`,
      })
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      enGlossary.glossary.term.encounterDifficulty
    );
  });

  it("the costed-XP total opens a glossary popover teaching what encounter XP means (EN)", () => {
    render(
      <EncounterBudgetReadout budget={budgetView({ costedXp: 1250, verdict: "low" })} />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Learn about ${t("campaignHub.encounterXpRubric")}`,
      })
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      enGlossary.glossary.term.encounterXp
    );
  });

  it("the difficulty teaching tooltip is localized in Italian", async () => {
    await i18n.changeLanguage("it");
    try {
      const it = i18n.getFixedT("it");
      render(
        <EncounterBudgetReadout
          budget={budgetView({ costedXp: 1250, verdict: "over" })}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: `Scopri cosa significa ${it("campaignHub.encounterDifficultyRubric")}`,
        })
      );
      expect(screen.getByRole("dialog")).toHaveTextContent(
        itGlossary.glossary.term.encounterDifficulty
      );
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});

// ─── The engine command boundary — the DM damage tap dispatches through it ──────

describe("MonsterCard — damage dispatches through the engine command boundary", () => {
  it("the popover's Damage apply reduces through applyAdversaryDamage (world + mirror)", () => {
    // A REAL encounter document built through the actual reducers; the card's
    // apply captures the dispatched reducer exactly like Party's ApplyFn.
    let encounter = addMonster(startEncounter({}, [], 1), {
      name: "Ogre Brute",
      ac: 11,
      maxHp: 59,
      count: 1,
      initiative: 12,
      srdId: "ogre",
    });
    const apply = vi.fn((fn: (e: typeof encounter) => typeof encounter) => {
      encounter = fn(encounter);
    });
    render(
      <MonsterCard
        campaignId="camp-test"
        monster={encounter.combatants[0] as EncounterMonster}
        isCurrent={false}
        apply={apply}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ogre Brute", expanded: false }));
    fireEvent.click(
      screen
        .getAllByLabelText("Ogre Brute")
        .find((el) => el.classList.contains("vital-hp")) as HTMLElement
    );
    fireEvent.change(screen.getByLabelText(/amount of damage/i), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Damage$/ }));

    expect(apply).toHaveBeenCalledTimes(1);
    const ogre = encounter.combatants[0] as EncounterMonster;
    // The engine signature: the mirrored legacy hp, the chronicle beat AND the
    // committed canonical world persisted on the same encounter value — the
    // legacy-only reducer never produced a `world`.
    expect(ogre.hp.current).toBe(52);
    expect(encounter.events?.[0]).toMatchObject({
      kind: "hp-damage",
      amount: 7,
      current: 52,
      targetId: "monster-1",
    });
    expect(encounter.world).toBeDefined();
  });

  it("the popover's Heal apply reduces through applyAdversaryHeal (world + mirror)", () => {
    // Start the ogre already wounded (real reducers only), then heal 5 through
    // the card's popover: exact current semantics (no overheal, temp untouched),
    // the hp-heal beat, and the committed world on the same encounter value.
    let encounter = addMonster(startEncounter({}, [], 1), {
      name: "Ogre Brute",
      ac: 11,
      maxHp: 59,
      count: 1,
      initiative: 12,
      srdId: "ogre",
    });
    encounter = applyHp(encounter, "monster-1", -20);
    const apply = vi.fn((fn: (e: typeof encounter) => typeof encounter) => {
      encounter = fn(encounter);
    });
    render(
      <MonsterCard
        campaignId="camp-test"
        monster={encounter.combatants[0] as EncounterMonster}
        isCurrent={false}
        apply={apply}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ogre Brute", expanded: false }));
    fireEvent.click(
      screen
        .getAllByLabelText("Ogre Brute")
        .find((el) => el.classList.contains("vital-hp")) as HTMLElement
    );
    fireEvent.change(screen.getByLabelText(/amount of damage/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Heal$/ }));

    expect(apply).toHaveBeenCalledTimes(1);
    const ogre = encounter.combatants[0] as EncounterMonster;
    expect(ogre.hp).toEqual({ current: 44, temp: 0, max: 59 });
    expect(encounter.events?.[0]).toMatchObject({
      kind: "hp-heal",
      amount: 5,
      current: 44,
      targetId: "monster-1",
    });
    expect(encounter.events?.[0]?.engineActionId).toBeDefined();
    expect(encounter.world).toBeDefined();
  });
});
