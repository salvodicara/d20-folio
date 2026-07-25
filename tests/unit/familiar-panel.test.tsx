/**
 * FamiliarPanel — the Find Familiar rail row + the 2024 type-swap render (the
 * public familiar half; the grant-companion rows are pack-data tests). Pins:
 *  - the type swap `{ ...form, type, typeTags: undefined }` renders the CHOSEN type
 *    and NEVER the form's original type/tags — an Imp-as-Fey must read "Fey", never
 *    "Fiend (Devil)" (the load-bearing correction). Mutation: drop `typeTags:
 *    undefined` and the devil tag reappears.
 *  - the rail row shows the form name · AC · HP; hidden entirely with no familiar.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ensureSrdKind } from "@/i18n";
import { getMonster } from "@/data/monsters";
import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";
import { FamiliarPanel } from "@/features/character/companions/FamiliarPanel";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

beforeAll(async () => {
  await ensureSrdKind("monster");
});

beforeEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
  useUIStore.setState({ sheetMode: "play" });
});

function withFamiliar(monsterId: string, creatureType: "celestial" | "fey" | "fiend") {
  const doc: CharacterDoc = {
    ...MOCK_CHARACTER,
    session: { ...MOCK_CHARACTER.session, familiar: { monsterId, creatureType } },
  };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

describe("Find Familiar — the type swap (correction: never render the form's own type)", () => {
  it("renders an Imp-as-Fey as Fey, never Fiend/Devil", () => {
    const imp = getMonster("imp");
    if (!imp) throw new Error("imp is not in the corpus");
    // Sanity: the base Imp is a Fiend tagged Devil — the swap must erase both.
    expect(imp.type).toBe("fiend");
    expect(imp.typeTags).toContain("devil");
    render(
      <MonsterStatBlockCard
        monster={{ ...imp, type: "fey", typeTags: undefined }}
        locale="en"
        title="Imp"
      />
    );
    expect(screen.getByText(/Fey/)).toBeInTheDocument();
    expect(screen.queryByText(/Fiend/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Devil/)).not.toBeInTheDocument();
  });
});

describe("FamiliarPanel — the rail row", () => {
  it("renders the eyebrow, form name, AC and HP", () => {
    const bat = getMonster("bat");
    if (!bat) throw new Error("bat is not in the corpus");
    withFamiliar("bat", "fey");
    render(
      <ul>
        <FamiliarPanel />
      </ul>
    );
    expect(screen.getByText("Familiar")).toBeInTheDocument();
    // The bat's localized name resolves through the monster catalogue.
    expect(screen.getByText(/bat/i)).toBeInTheDocument();
    // HP cur/max = the form's printed average (full on summon).
    expect(screen.getByText(`${bat.hp.average} / ${bat.hp.average}`)).toBeInTheDocument();
  });

  it("renders nothing when there is no familiar", () => {
    useCharacterStore.setState({
      character: MOCK_CHARACTER,
      loading: false,
      error: null,
    });
    const { container } = render(
      <ul>
        <FamiliarPanel />
      </ul>
    );
    expect(container.querySelector("li")).toBeNull();
  });

  it("shows the unknown-form affordance for a stale/pack-only monster id", () => {
    withFamiliar("nonexistent-pack-form", "fiend");
    render(
      <ul>
        <FamiliarPanel />
      </ul>
    );
    expect(screen.getByText(/Unknown form/i)).toBeInTheDocument();
  });
});
