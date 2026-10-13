/**
 * SummonedMonstersPanel — Animate Dead's undead on the Companions rail: one
 * numbered row per creature ("Skeleton 1" … "Skeleton 4"), each with its own HP,
 * and a −1 on one row touches only that creature.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ensureSrdKind } from "@/i18n";
import { SummonedMonstersPanel } from "@/features/character/companions/SummonedMonstersPanel";
import { buildSummonedMonsterGroups } from "@/lib/views/companion-row-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

beforeAll(async () => {
  await ensureSrdKind("monster");
});

beforeEach(() => {
  useUIStore.setState({ sheetMode: "play" });
});

const doc: CharacterDoc = {
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    spells: [{ srdId: "animate-dead", prepared: true }],
  },
  session: {
    ...MOCK_CHARACTER.session,
    companionCount: { "animate-dead": 4 },
    companionHp: { "animate-dead#2": { current: 6 } },
  },
};

function mount() {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
  const [group] = buildSummonedMonsterGroups(doc);
  render(<ul>{group && <SummonedMonstersPanel group={group} />}</ul>);
}

describe("SummonedMonstersPanel — one row per creature", () => {
  it("numbers the Skeletons and gives each its own HP", () => {
    mount();
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByText(`Skeleton ${n}`)).toBeInTheDocument();
    }
    expect(screen.getAllByText("13 / 13")).toHaveLength(3);
    expect(screen.getByText("6 / 13")).toBeInTheDocument();
  });

  it("a −1 on Skeleton 3 changes only Skeleton 3", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "−1 HP Skeleton 3" }));
    expect(useCharacterStore.getState().character?.session.companionHp).toEqual({
      "animate-dead#2": { current: 6 },
      "animate-dead#3": { current: 12 },
    });
  });
});

describe("SummonedMonstersPanel — a creature the caster picks", () => {
  function mountPick(session: Partial<CharacterDoc["session"]>) {
    const d: CharacterDoc = {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        spells: [{ srdId: "planar-ally", prepared: true }],
      },
      session: { ...MOCK_CHARACTER.session, ...session },
    };
    useCharacterStore.setState({ character: d, loading: false, error: null });
    const [group] = buildSummonedMonsterGroups(d);
    render(<ul>{group && <SummonedMonstersPanel group={group} />}</ul>);
  }

  it("asks for a creature until one is chosen", () => {
    mountPick({});
    expect(screen.getByText("Planar Ally")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a creature" })).toBeInTheDocument();
  });

  it("a stored creature the spell does not allow reads as unpicked", () => {
    mountPick({ companionVariant: { "planar-ally": "wolf" } });
    expect(screen.queryByText("Wolf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a creature" })).toBeInTheDocument();
  });

  it("fields the chosen creature with its HP, and Release sends it away", () => {
    mountPick({ companionVariant: { "planar-ally": "planetar" } });
    expect(screen.getByText("Planetar")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Planetar"));
    fireEvent.click(screen.getByRole("button", { name: "Release" }));
    expect(useCharacterStore.getState().character?.session.companionVariant).toEqual({});
  });
});
