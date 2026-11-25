/**
 * «Gestisci incantesimi» also adds spells (#1230, D&D Beyond's «Manage Spells»: one
 * window to learn and to prepare). The «Add» tab lists the Compendium's spells for the
 * character's own class (add mode); one tap adds the spell, a spell already on the
 * sheet says so, and undo takes the add back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayAddSpell } from "@/domains/play/ui/PlayAddSpell";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const live = () => useCharacterStore.getState().character as CharacterDoc;
const ids = () => live().character.spells.map((s) => ("srdId" in s ? s.srdId : "custom"));

beforeEach(() => {
  useUndoStore.getState().clear();
  const doc = makeCharacterDoc({ classId: "wizard", level: 3 });
  doc.character.spells = [{ srdId: "magic-missile", prepared: true }];
  doc.character.spellSlots = [
    { level: 1, total: 4 },
    { level: 2, total: 2 },
  ];
  useCharacterStore.setState({ character: doc, loading: false, error: null });
});

const search = (q: string) =>
  fireEvent.change(screen.getByRole("searchbox", { name: "Search spells" }), {
    target: { value: q },
  });

describe("adding a spell from «Manage spells»", () => {
  it("adds a spell from the class list, and undo takes it back", () => {
    render(<PlayAddSpell />);
    search("shield");
    fireEvent.click(screen.getByRole("button", { name: "Add: Shield" }));
    expect(ids()).toEqual(["magic-missile", "shield"]);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(ids()).toEqual(["magic-missile"]);
  });

  it("a spell already on the sheet cannot be added twice", () => {
    render(<PlayAddSpell />);
    search("magic missile");
    expect(screen.queryByRole("button", { name: "Add: Magic Missile" })).toBeNull();
    expect(screen.getByText("Already yours")).toBeTruthy();
  });

  it("offers only the levels the character can cast, and says so", () => {
    render(<PlayAddSpell />);
    search("fireball");
    expect(screen.queryByRole("button", { name: "Add: Fireball" })).toBeNull();
    expect(screen.getByText("Up to level 2: the spells you can cast.")).toBeTruthy();
    search("misty step");
    expect(screen.getByRole("button", { name: "Add: Misty Step" })).toBeTruthy();
  });
});
