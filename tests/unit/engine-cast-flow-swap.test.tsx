/**
 * EngineCastFlow — the concentration-swap LEGACY MIRROR: when a committed
 * engine cast replaced the engine-held concentration (the kernel's ONE-action
 * replacement ends the old occurrence inside the same journal action), the
 * flow must surface the replacement as the undo toast's own label and log the
 * end/start story beats. The kernel-side replacement itself is proven by the
 * world-store e2e and the spells-page flow test; the replay hook is stubbed
 * here so the mirror closure is the unit under test.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

const commitSpy = vi.fn((): string | null => "cast-action-1");
vi.mock("@/features/character/useMechanicsCast", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/character/useMechanicsCast")>();
  return {
    ...original,
    useMechanicsCast: () => ({
      answer: vi.fn(),
      answers: [],
      commit: commitSpy,
      phase: { kind: "ready", outcome: {} },
      reset: vi.fn(),
      respond: vi.fn(),
    }),
  };
});

import { EngineCastFlow } from "@/features/character/center/tabs/spells/EngineCastFlow";
import { concentrationValue } from "@/lib/concentration";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { User } from "firebase/auth";

afterEach(() => {
  commitSpy.mockClear();
  useCharacterStore.setState({ character: null });
  useAuthStore.setState({ user: null });
});

describe("EngineCastFlow concentration-swap mirror", () => {
  it("toasts the replacement and logs the start beat on a swap commit", () => {
    useCharacterStore.setState({
      character: {
        ...structuredClone(MOCK_CHARACTER),
        session: {
          ...structuredClone(MOCK_CHARACTER.session),
          // The engine commit's own transition mirror has already stamped
          // the new spell by the time the flow's wrapper fires; the
          // player-facing replacement toast (now the undo affordance) and
          // the story beats are what remain.
          concentration: concentrationValue("moonbeam"),
          logEntries: [],
        },
      },
      loading: false,
      readonly: false,
    });
    useAuthStore.setState({ user: { uid: "test-uid" } as User });
    const toastSpy = vi.spyOn(useToastStore.getState(), "showToast");

    render(
      <EngineCastFlow
        concentrationSwap={{ heldSpellId: "bless" }}
        economy={null}
        hasAttack={false}
        onClose={vi.fn()}
        slots={[]}
        spellId="moonbeam"
        spellName="Moonbeam"
        summary={null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(commitSpy).toHaveBeenCalledTimes(1);

    const session = useCharacterStore.getState().character?.session;
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: { kind: "concentration-replaced", next: "moonbeam", previous: "bless" },
      })
    );
    const events = (session?.logEntries ?? []).map((entry) => entry.event);
    expect(events).toEqual(
      expect.arrayContaining([
        { kind: "concentration-end", spell: "bless" },
        { kind: "concentration-start", spell: "moonbeam" },
      ])
    );
    toastSpy.mockRestore();
  });

  it("leaves the session untouched when no swap rode the commit", () => {
    useCharacterStore.setState({
      character: {
        ...structuredClone(MOCK_CHARACTER),
        session: {
          ...structuredClone(MOCK_CHARACTER.session),
          activeFeatures: ["spell-bless"],
          logEntries: [],
        },
      },
      loading: false,
      readonly: false,
    });
    useAuthStore.setState({ user: { uid: "test-uid" } as User });
    render(
      <EngineCastFlow
        concentrationSwap={null}
        economy={null}
        hasAttack={false}
        onClose={vi.fn()}
        slots={[]}
        spellId="cure-wounds"
        spellName="Cure Wounds"
        summary={null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(commitSpy).toHaveBeenCalledTimes(1);
    const session = useCharacterStore.getState().character?.session;
    expect(session?.activeFeatures).toEqual(["spell-bless"]);
    expect(session?.logEntries ?? []).toHaveLength(0);
  });
});
