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
} from "@/features/campaigns/party-encounter";
import { addMonster, startEncounter } from "@/features/campaigns/encounter";
import type { EncounterMonster } from "@/types/campaign";

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

describe("AddMonsterForm — add() resets every field, not just name/count/notes (B25)", () => {
  it("clears the whole form (incl. ac/maxHp/initiative) back to its defaults on a successful add", () => {
    const onAdd = vi.fn();
    render(<AddMonsterForm onAdd={onAdd} />);

    fireEvent.change(screen.getByLabelText("Monster name"), {
      target: { value: "Ogre" },
    });
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

    expect(onAdd).toHaveBeenLastCalledWith({
      name: "Ogre",
      ac: 11,
      maxHp: 59,
      count: 3,
      initiative: 18,
      notes: "Tough boss",
    });

    // Every field is back to its empty/default state (B25) — not just name/count/notes.
    expect(screen.getByLabelText("Monster name")).toHaveValue("");
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
    expect(onAdd).toHaveBeenLastCalledWith({
      name: "Goblin",
      ac: 12,
      maxHp: 10,
      count: 1,
      initiative: 10,
      notes: "",
    });
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
    render(<MonsterCard monster={ogre()} isCurrent={false} apply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Initiative for Ogre" }));
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});

// ─── §C — the DM statblock disclosure + rename ──────────────────────────────────

describe("MonsterCard — DM statblock disclosure (§C.1/§C.2)", () => {
  it("a DM card with srdId shows the Statblock button", () => {
    render(<MonsterCard monster={goblinWithSrd()} isCurrent apply={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Statblock" })).toBeTruthy();
  });

  it("a DM card WITHOUT srdId shows no Statblock button (hand-typed monster)", () => {
    const noSrd = goblinWithSrd({ srdId: undefined });
    render(<MonsterCard monster={noSrd} isCurrent apply={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Statblock" })).toBeNull();
  });

  it("a PLAYER card (no apply) shows NO disclosure body even with srdId (byte-identical player card)", () => {
    render(<MonsterCard monster={goblinWithSrd()} isCurrent={false} />);
    // No DM affordances at all — no statblock, no rename, no remove.
    expect(screen.queryByRole("button", { name: "Statblock" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Monster name" })).toBeNull();
  });
});

describe("MonsterCard — DM rename-in-place routes through apply (§C.4)", () => {
  it("committing a new name calls apply (setMonsterName)", () => {
    const apply = vi.fn();
    render(<MonsterCard monster={goblinWithSrd()} isCurrent apply={apply} />);
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
        monster={goblinWithSrd({ initiative: null })}
        isCurrent={false}
        initLocked
        apply={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Initiative for Goblin A" })).toBeTruthy();
  });

  it("initLocked + a SET initiative renders the STATIC chip (locked like every frozen row)", () => {
    render(
      <MonsterCard
        monster={goblinWithSrd({ initiative: 12 })}
        isCurrent={false}
        initLocked
        apply={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Initiative for Goblin A" })).toBeNull();
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
