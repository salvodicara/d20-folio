/**
 * «Da cosa?» (#1333): picking a condition adds it at once, as before; a condition a
 * spell imposes with an end-of-turn repeat save then shows an optional «from what?»
 * row under it while it is active. A chip names the spell (+1 tap), «Other» names
 * none, and removing the condition takes the row and the origin with it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({}));

import { PlayConditions } from "@/domains/play/ui/PlayConditions";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { ConditionEditor } from "@/features/character/molecules/ConditionEditor";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

const start: CharacterDoc = {
  ...MOCK_CHARACTER,
  session: { ...MOCK_CHARACTER.session, conditions: [] },
};

/** The panel over the live store, as the Play screen passes it. */
function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayConditions doc={doc} locale="en" /> : null;
}

const session = () => useCharacterStore.getState().character?.session;
const tap = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  useCombatStatusStore.setState({ status: null });
  useCharacterStore.setState({ readonly: false, loading: false, error: null });
  useCharacterStore.getState().setCharacter(structuredClone(start));
});

describe("Play: add at once, name the origin as an optional note", () => {
  it("Paralyzed: 3 taps to add, as before; naming Hold Person is +1", () => {
    render(<Live />);
    tap(/conditions/i);
    expect(screen.queryByText(/from what\?/)).toBeNull();
    tap("Add condition");
    tap("Paralyzed");
    expect(session()?.conditions).toContain("paralyzed");
    expect(session()?.conditionOrigins?.paralyzed).toBeUndefined();
    expect(screen.getByText("Paralyzed: from what?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Other" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    tap("Hold Person");
    expect(session()?.conditionOrigins).toEqual({ paralyzed: "hold-person" });
    expect(screen.getByRole("button", { name: "Hold Person" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Other" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("«Other» names nothing", () => {
    render(<Live />);
    tap(/conditions/i);
    tap("Add condition");
    tap("Paralyzed");
    tap("Hold Person");
    tap("Other");
    expect(session()?.conditionOrigins?.paralyzed).toBeUndefined();
  });

  it("Frightened in a fight: 4 taps with «by whom?», as before; naming Weird is +1", () => {
    useCombatStatusStore.setState({
      status: {
        characterId: start.id,
        view: {
          rows: [
            { id: "pc-me", characterId: start.id, name: "Me", conditions: [] },
            { id: "ogre-1", name: "Ogre", conditions: [] },
          ],
        },
      } as never,
    });
    render(<Live />);
    tap(/conditions/i);
    tap("Add condition");
    tap("Frightened");
    tap("Ogre");
    expect(session()?.conditions).toContain("frightened");
    expect(session()?.conditionSources).toEqual({ frightened: "ogre-1" });
    tap("Weird");
    expect(session()?.conditionOrigins).toEqual({ frightened: "weird" });
    expect(session()?.conditionSources).toEqual({ frightened: "ogre-1" });
  });

  it("removing the condition takes its row and its origin", () => {
    render(<Live />);
    tap(/conditions/i);
    tap("Add condition");
    tap("Paralyzed");
    tap("Hold Person");
    tap("Remove");
    expect(session()?.conditions).not.toContain("paralyzed");
    expect(session()?.conditionOrigins?.paralyzed).toBeUndefined();
    expect(screen.queryByText(/from what\?/)).toBeNull();
  });
});

describe("classic: the same note under the active chips", () => {
  const paralyzed = {
    conditionId: "paralyzed",
    label: "Paralyzed",
    options: [{ id: "hold-person", label: "Hold Person" }],
    chosen: null,
  };
  const origins = [paralyzed];

  it("shows only for an active condition; a chip names it, pressed as stored", () => {
    const onOrigin = vi.fn();
    const { rerender } = render(
      <ConditionEditor
        conditions={[]}
        onToggle={() => {}}
        origins={origins}
        onOrigin={onOrigin}
      />
    );
    expect(screen.queryByRole("group", { name: /from what/ })).toBeNull();
    rerender(
      <ConditionEditor
        conditions={["paralyzed"]}
        onToggle={() => {}}
        origins={[{ ...paralyzed, chosen: "hold-person" }]}
        onOrigin={onOrigin}
      />
    );
    expect(screen.getByRole("button", { name: "Hold Person" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Other" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    expect(onOrigin).toHaveBeenCalledWith("paralyzed", null);
  });

  it("picking a condition still adds it at once", () => {
    const onToggle = vi.fn();
    render(
      <ConditionEditor
        conditions={[]}
        onToggle={onToggle}
        origins={origins}
        onOrigin={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    fireEvent.click(screen.getByRole("option", { name: "Paralyzed" }));
    expect(onToggle).toHaveBeenCalledWith("paralyzed");
  });
});
