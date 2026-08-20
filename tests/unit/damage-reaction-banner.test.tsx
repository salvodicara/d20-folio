/**
 * DamageReactionBanner — the damage-entry reaction prompt: the parked hit
 * lists every eligible reaction plus the plain-damage skip; a pick commits
 * the hit WITH the reduction through the kernel (one causal action, the
 * legacy Reaction flag mirrored); a skip applies the exact plain damage.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { DamageReactionBanner } from "@/features/character/DamageReactionBanner";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { PendingDamageReactionPrompt } from "@/lib/damage-reaction";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { User } from "firebase/auth";

function load(): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.hp = { current: 38, temp: 0 };
  doc.session.concentration = "";
  useCharacterStore.getState().setCharacter(doc);
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
}

function park(): PendingDamageReactionPrompt {
  const prompt: PendingDamageReactionPrompt = {
    characterId: MOCK_CHARACTER.id,
    crit: false,
    id: "prompt-1",
    netParts: [{ amount: 10, damageType: "slashing" }],
    netTotal: 10,
    optionRowIds: ["rogue-uncanny-dodge-reaction"],
    parts: [{ amount: 10, type: "slashing" }],
    rawTotal: 10,
  };
  act(() => {
    useCharacterStore.getState().queueDamageReactionPrompt(prompt);
  });
  return prompt;
}

afterEach(() => {
  useToastStore.getState().clearAll();
  useUndoStore.getState().clear(null);
  useCharacterStore.setState({
    character: null,
    combatPendingDamageReaction: null,
    combatPendingConcentrationSaves: [],
  });
  useAuthStore.setState({ user: null });
  useCombatStore.getState().endCombat();
});

describe("DamageReactionBanner", () => {
  it("renders nothing without a parked prompt", () => {
    load();
    const { container } = render(<DamageReactionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("lists the eligible reaction and the plain-damage skip", () => {
    load();
    park();
    render(<DamageReactionBanner />);
    expect(screen.getByText(/hit for 10 damage/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /uncanny dodge/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take 10 damage/i })).toBeInTheDocument();
  });

  it("a pick commits the halved hit and claims the round's Reaction", () => {
    load();
    park();
    render(<DamageReactionBanner />);
    fireEvent.click(screen.getByRole("button", { name: /uncanny dodge/i }));
    const state = useCharacterStore.getState();
    // 38 − ⌊10/2⌋ = 33 through ONE kernel causal action.
    expect(state.character?.session.hp.current).toBe(33);
    expect(state.combatPendingDamageReaction).toBeNull();
    // The legacy reaction economy mirror (the ReactionCards' "Used" truth).
    expect(useCombatStore.getState().reactionUsed).toBe(true);
    expect(useCombatStore.getState().reactionUsedId).toBe("rogue-uncanny-dodge-reaction");
  });

  it("a pick registers the turn-scoped undo whose reverse restores HP and the Reaction", () => {
    load();
    park();
    render(<DamageReactionBanner />);
    fireEvent.click(screen.getByRole("button", { name: /uncanny dodge/i }));
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(33);

    // The same stack grammar as every economy commit: a turn-scoped entry
    // advertised by the standard undo toast.
    const entry = useUndoStore.getState().past.at(-1);
    expect(entry?.turnScoped).toBe(true);
    const toast = useToastStore
      .getState()
      .toasts.find((candidate) => candidate.id === entry?.toastId);
    expect(toast?.message).toMatch(/uncanny dodge/i);
    expect(typeof toast?.onUndo).toBe("function");

    // Undo: the exact reverse restores the pre-hit HP and releases the
    // round's Reaction claim in the same motion.
    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(38);
    expect(useCombatStore.getState().reactionUsed).toBe(false);
    expect(useCombatStore.getState().reactionUsedId).toBeNull();
  });

  it("skip applies the exact plain damage and clears the prompt", () => {
    load();
    park();
    render(<DamageReactionBanner />);
    fireEvent.click(screen.getByRole("button", { name: /take 10 damage/i }));
    const state = useCharacterStore.getState();
    expect(state.character?.session.hp.current).toBe(28);
    expect(state.combatPendingDamageReaction).toBeNull();
    expect(useCombatStore.getState().reactionUsed).toBe(false);
  });
});
