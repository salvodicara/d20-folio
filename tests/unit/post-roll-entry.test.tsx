/**
 * A save's d20 entry shows its running total and verdict before «Conferma» (BG3's roll
 * result line): the face, the sheet's modifier and the added die, then the outcome.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { usePostRollEntry } from "@/domains/play/ui/PostRollEntry";
import type { CharacterEnteredD20Result } from "@/lib/character-d20-tests";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({}, { hp: { current: 0, temp: 0 } });

function Harness({ total, status }: { total: number; status: "success" | "failure" }) {
  const roll = usePostRollEntry(doc, 1, { face: "d20" }, (faces) => {
    const face = faces[0] ?? 0;
    return {
      effectiveFace: face,
      selectedNaturalFace: face,
      deterministicModifier: total - face,
      enteredModifierTotal: 0,
      total,
      reviewedOutcome: { status },
    } as unknown as CharacterEnteredD20Result;
  });
  return roll.fields;
}

describe("usePostRollEntry", () => {
  it("shows the total and Success before confirming", () => {
    render(<Harness total={10} status="success" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "8" } });
    expect(screen.getByRole("status")).toHaveTextContent("8 + 2 = 10 · Succeeded");
  });

  it("shows a negative modifier and Failed", () => {
    render(<Harness total={6} status="failure" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "8" } });
    expect(screen.getByRole("status")).toHaveTextContent("8 − 2 = 6 · Failed");
  });

  it("shows nothing until the face is valid", () => {
    render(<Harness total={10} status="success" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("with no modifier shows the total once", () => {
    render(<Harness total={8} status="failure" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "8" } });
    expect(screen.getByRole("status")).toHaveTextContent(/^8 · Failed$/);
  });
});
