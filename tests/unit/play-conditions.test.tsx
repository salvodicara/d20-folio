/**
 * Play «Condizioni»: the chip opens the panel; a Frightened chip with no derivable
 * source asks «Non vedo la fonte», and pressing it stores the table's answer for that
 * instance (`set-sees-source`), pressing again clears it. «Rimuovi» takes it off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayConditions } from "@/domains/play/ui/PlayConditions";
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
  render(<PlayConditions doc={doc} locale="en" count={1} />);
  fireEvent.click(screen.getByRole("button", { name: /conditions/i }));
}

describe("Play conditions panel", () => {
  beforeEach(() => vi.restoreAllMocks());

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
});
