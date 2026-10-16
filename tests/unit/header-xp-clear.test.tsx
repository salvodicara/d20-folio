/**
 * Clearing the header XP total returns the table to milestone levelling: an empty
 * commit removes `character.experience` entirely (unset, not 0), so the XP line
 * disappears like on a character that never set it, and the stored build carries
 * no `experience` key. The store is the real Zustand store hydrated with MOCK.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeaderXp } from "@/features/character/center/HeaderXp";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { serializeCharacterEnvelope } from "@/lib/character-codec";

const XP = /^(experience points|punti esperienza)$/i;

function load(experience: number): void {
  const base = structuredClone(MOCK_CHARACTER);
  useCharacterStore.setState({
    character: { ...base, character: { ...base.character, experience } },
    loading: false,
    error: null,
    readonly: false,
  });
}

function stored() {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
}

function Line() {
  const doc = useCharacterStore((s) => s.character);
  return <HeaderXp experience={doc?.character.experience} level={9} editable />;
}

function commit(value: string): void {
  fireEvent.click(screen.getByRole("button", { name: XP }));
  const input = screen.getByRole("spinbutton", { name: XP });
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("HeaderXp — clearing the total", () => {
  it("an empty commit unsets experience and the XP line disappears", () => {
    load(2450);
    render(<Line />);
    commit("");
    expect("experience" in stored().character).toBe(false);
    expect(screen.queryByRole("button", { name: XP })).toBeNull();
    expect("experience" in serializeCharacterEnvelope(stored()).build).toBe(false);
  });

  it("a committed 0 still stores 0, never unset", () => {
    load(2450);
    render(<Line />);
    commit("0");
    expect(stored().character.experience).toBe(0);
    expect(screen.getByRole("button", { name: XP })).toBeInTheDocument();
  });
});
