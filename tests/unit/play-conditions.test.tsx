/**
 * Play «Condizioni»: the chip opens the panel; a Frightened chip with no derivable
 * source asks «Non vedo la fonte», and pressing it stores the table's answer for that
 * instance (`set-sees-source`), pressing again clears it. «Rimuovi» takes it off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayConditions } from "@/domains/play/ui/PlayConditions";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

function frightened(answer?: boolean): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    session: {
      ...MOCK_CHARACTER.session,
      conditions: ["frightened"],
      ...(answer === undefined ? {} : { seesSource: { "condition:frightened": answer } }),
    },
  };
}

function open(doc: CharacterDoc) {
  useCharacterStore.setState({ character: doc, readonly: false });
  render(<PlayConditions doc={doc} locale="en" />);
  fireEvent.click(screen.getByRole("button", { name: /conditions/i }));
}

describe("Play conditions panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCombatStatusStore.setState({ status: null });
  });

  it("asks «can't see the source» for Frightened and stores the answer", () => {
    const dispatch = vi.fn(() => null);
    useCharacterStore.setState({ dispatch });
    open(frightened());
    expect(screen.getByRole("dialog")).toBeTruthy();
    const ask = screen.getByRole("button", { name: "I can't see the source" });
    expect(ask.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(ask);
    expect(dispatch).toHaveBeenCalledWith({
      kind: "set-sees-source",
      key: "condition:frightened",
      sees: false,
    });
  });

  it("pressing the answer again clears it", () => {
    const dispatch = vi.fn(() => null);
    useCharacterStore.setState({ dispatch });
    open(frightened(false));
    const ask = screen.getByRole("button", { name: "I can't see the source" });
    expect(ask.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(ask);
    expect(dispatch).toHaveBeenCalledWith({
      kind: "set-sees-source",
      key: "condition:frightened",
      sees: null,
    });
  });

  it("removes a condition", () => {
    const removeCondition = vi.fn();
    useCharacterStore.setState({ removeCondition });
    open(frightened());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeCondition).toHaveBeenCalledWith("frightened");
  });

  it("shows Exhaustion as a level stepped 1–6, and Remove clears it", () => {
    const setExhaustion = vi.fn();
    useCharacterStore.setState({ setExhaustion });
    open({ ...frightened(), session: { ...frightened().session, exhaustion: 2 } });
    expect(screen.getByText(/Level 2: −4 to D20 Tests · Speed −10 ft/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(setExhaustion).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0] as HTMLElement);
    expect(setExhaustion).toHaveBeenLastCalledWith(0);
  });

  it("adds Exhaustion at level 1", () => {
    const setExhaustion = vi.fn();
    useCharacterStore.setState({ setExhaustion });
    open(frightened());
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    fireEvent.click(screen.getByRole("button", { name: "Exhaustion" }));
    expect(setExhaustion).toHaveBeenCalledWith(1);
  });

  it("asks «by whom?» for Grappled in a fight, and keeps the source", () => {
    const addCondition = vi.fn();
    useCharacterStore.setState({ addCondition });
    const doc = frightened();
    useCombatStatusStore.setState({
      status: {
        characterId: doc.id,
        view: {
          rows: [
            { id: "pc-me", characterId: doc.id, name: "Me", conditions: [] },
            { id: "ogre-1", name: "Ogre", conditions: [] },
          ],
        },
      } as never,
    });
    open(doc);
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    fireEvent.click(screen.getByRole("button", { name: "Grappled" }));
    expect(screen.getByText("Grappled: by whom?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ogre" }));
    expect(addCondition).toHaveBeenCalledWith("grappled", { sourceId: "ogre-1" });
  });

  it("adds Grappled straight away outside a fight", () => {
    const addCondition = vi.fn();
    useCharacterStore.setState({ addCondition });
    open(frightened());
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    fireEvent.click(screen.getByRole("button", { name: "Grappled" }));
    expect(addCondition).toHaveBeenCalledWith("grappled", undefined);
  });
});
