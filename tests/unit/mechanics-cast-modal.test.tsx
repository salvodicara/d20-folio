import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MechanicsCastModal } from "@/components/sheet/MechanicsCastModal";
import type { MechanicsCastState } from "@/features/character/useMechanicsCast";

const MATERIAL = {
  characterId: "hero",
  kind: "character-play",
  uid: "uid",
} as const;

function castState(
  phase: MechanicsCastState["phase"],
  answer = vi.fn()
): MechanicsCastState {
  return {
    answer,
    answers: [],
    commit: vi.fn(() => true),
    phase,
    reset: vi.fn(),
    respond: vi.fn(),
  };
}

describe("MechanicsCastModal", () => {
  it("offers the available slot levels for the payment requirement", () => {
    const answer = vi.fn();
    render(
      <MechanicsCastModal
        cast={castState(
          {
            kind: "collecting",
            requirement: {
              activation: "required",
              activeWhen: null,
              amount: 1,
              inputId: "slot",
              kind: "resource",
              phaseId: "resolve",
              term: {
                amount: { kind: "fixed", value: 1 },
                selector: {
                  kind: "spell-slot",
                  level: { kind: "minimum", value: 1 },
                  owner: "caster",
                  pool: "either",
                },
              },
            },
          },
          answer
        )}
        material={MATERIAL}
        onClose={vi.fn()}
        slotRemaining={{ 1: 2, 2: 0, 3: 1 }}
        spellName="Cure Wounds"
      />
    );
    expect(screen.getByText(/Level 1 slot/)).toBeTruthy();
    expect(screen.queryByText(/Level 2 slot/)).toBeNull();
    fireEvent.click(screen.getByText(/Level 3 slot/));
    expect(answer).toHaveBeenCalledWith({
      inputId: "slot",
      kind: "resource",
      resource: { character: MATERIAL, kind: "standard-spell-slot", level: 3 },
    });
  });

  it("collects each die face before allowing the roll confirm", () => {
    const answer = vi.fn();
    render(
      <MechanicsCastModal
        cast={castState(
          {
            kind: "collecting",
            requirement: {
              activation: "required",
              activeWhen: null,
              inputId: "heal-roll",
              kind: "dice",
              pendingInputId: null,
              phaseId: "resolve",
              requests: [
                {
                  identity: {
                    binding: { entityId: "self", material: MATERIAL },
                    ordinal: 1,
                  },
                  payments: [],
                  replacementPolicy: [],
                  roll: {
                    acceptanceRules: [],
                    aggregates: [],
                    deterministicTerms: [],
                    maximumTotal: 16,
                    minimumTotal: 2,
                    trails: [
                      {
                        maximumFace: 8,
                        minimumFace: 1,
                        operation: "add",
                        sides: 8,
                        termId: "heal",
                        trailId: "t1",
                      },
                      {
                        maximumFace: 8,
                        minimumFace: 1,
                        operation: "add",
                        sides: 8,
                        termId: "heal",
                        trailId: "t2",
                      },
                    ],
                  },
                },
              ],
            },
          },
          answer
        )}
        material={MATERIAL}
        onClose={vi.fn()}
        slotRemaining={{}}
        spellName="Cure Wounds"
      />
    );
    const confirm = screen.getByText("Apply");
    expect(confirm.closest("button")?.disabled).toBe(true);
    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0] as Element, { target: { value: "5" } });
    fireEvent.change(inputs[1] as Element, { target: { value: "8" } });
    expect(confirm.closest("button")?.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(answer).toHaveBeenCalledTimes(1);
  });
});
