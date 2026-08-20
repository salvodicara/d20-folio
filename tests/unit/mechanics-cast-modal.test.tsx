import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

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
    commit: vi.fn((): string | null => "action-1"),
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

  it("offers the pact slot beside the standard levels and answers its exact ref", () => {
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
        pactSlot={{ level: 2, remaining: 1 }}
        slotRemaining={{ 1: 2 }}
        spellName="Hex"
      />
    );
    expect(screen.getByText(/Level 1 slot/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Pact slot, level 2/));
    expect(answer).toHaveBeenCalledWith({
      inputId: "slot",
      kind: "resource",
      resource: { character: MATERIAL, kind: "pact-spell-slot" },
    });
  });

  it("enforces the selector's level floor on both pools", () => {
    render(
      <MechanicsCastModal
        cast={castState({
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
                level: { kind: "minimum", value: 2 },
                owner: "caster",
                pool: "either",
              },
            },
          },
        })}
        material={MATERIAL}
        onClose={vi.fn()}
        pactSlot={{ level: 1, remaining: 2 }}
        slotRemaining={{ 1: 2, 2: 1 }}
        spellName="Hold Person"
      />
    );
    // A level-1 slot (standard or pact) cannot pay a level-2 spell.
    expect(screen.queryByText(/Level 1 slot/)).toBeNull();
    expect(screen.queryByText(/Pact slot/)).toBeNull();
    expect(screen.getByText(/Level 2 slot/)).toBeTruthy();
  });

  it("answers a pool payment with one spend confirm", () => {
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
              inputId: "uses",
              kind: "resource",
              phaseId: "resolve",
              term: {
                amount: { kind: "fixed", value: 1 },
                selector: { kind: "pool", owner: "caster", resourceId: "monk-focus" },
              },
            },
          },
          answer
        )}
        material={MATERIAL}
        onClose={vi.fn()}
        slotRemaining={{}}
        spellName="Patient Defense"
      />
    );
    fireEvent.click(screen.getByText(/Spend 1/));
    expect(answer).toHaveBeenCalledWith({
      inputId: "uses",
      kind: "resource",
      resource: {
        kind: "pool",
        owner: { entityId: "self", material: MATERIAL },
        resourceId: "monk-focus",
      },
    });
  });

  it("answers a source-item quantity payment from the supplied instance", () => {
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
              inputId: "berry",
              kind: "resource",
              phaseId: "resolve",
              term: {
                amount: { kind: "fixed", value: 1 },
                selector: {
                  item: { kind: "source-item" },
                  kind: "item-quantity",
                  owner: "owner",
                },
              },
            },
          },
          answer
        )}
        material={MATERIAL}
        onClose={vi.fn()}
        slotRemaining={{}}
        sourceItem={{ instanceId: "goodberry-berry-1", instanceOrdinal: 1 }}
        spellName="Goodberry"
      />
    );
    fireEvent.click(screen.getByText(/Consume 1/));
    expect(answer).toHaveBeenCalledWith({
      inputId: "berry",
      kind: "resource",
      resource: {
        character: MATERIAL,
        instanceId: "goodberry-berry-1",
        instanceOrdinal: 1,
        kind: "item-quantity",
      },
    });
  });

  it("splits a per-target integer under the live total cap", () => {
    const answer = vi.fn();
    const identity = (ordinal: number) => ({
      binding: { entityId: "self" as const, material: MATERIAL },
      ordinal,
    });
    render(
      <MechanicsCastModal
        cast={castState(
          {
            kind: "collecting",
            requirement: {
              activation: "required",
              activeWhen: null,
              inputId: "portions",
              kind: "integer",
              maximum: 25,
              minimum: 1,
              pendingEntityInputId: null,
              phaseId: "resolve",
              requests: [{ identity: identity(1) }, { identity: identity(2) }],
              totalMaximum: 25,
            },
          },
          answer
        )}
        material={MATERIAL}
        onClose={vi.fn()}
        slotRemaining={{}}
        spellName="Mass Heal"
      />
    );
    expect(screen.getByText("Target 1")).toBeTruthy();
    expect(screen.getByText("Target 2")).toBeTruthy();
    const confirm = screen.getByText("Apply");
    expect(confirm.closest("button")?.disabled).toBe(true);
    const inputs = screen.getAllByRole("spinbutton");
    // 13 + 20 breaches the 25-point pool: the confirm stays disabled and the
    // live remaining line reads zero left.
    fireEvent.change(inputs[0] as Element, { target: { value: "13" } });
    fireEvent.change(inputs[1] as Element, { target: { value: "20" } });
    expect(confirm.closest("button")?.disabled).toBe(true);
    expect(screen.getByText(/0 of 25 points remaining/)).toBeTruthy();
    // 13 + 12 fits exactly; the answer carries one value per request identity.
    fireEvent.change(inputs[1] as Element, { target: { value: "12" } });
    expect(confirm.closest("button")?.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(answer).toHaveBeenCalledWith({
      inputId: "portions",
      kind: "integer",
      requests: [
        { identity: identity(1), value: 13 },
        { identity: identity(2), value: 12 },
      ],
    });
  });

  it("bounds the plain amount prompt by the live payable pool", () => {
    const answer = vi.fn();
    render(
      <MechanicsCastModal
        cast={castState(
          {
            kind: "collecting",
            requirement: {
              activation: "required",
              activeWhen: null,
              inputId: "amount",
              kind: "integer",
              // The transcription's domain cap — never the number to show: a
              // level-1 Paladin's Lay on Hands pool holds 5 points, so the
              // prompt must read "(0 to 5)".
              maximum: 1000,
              minimum: 0,
              phaseId: "resolve",
            },
          },
          answer
        )}
        material={MATERIAL}
        onClose={vi.fn()}
        poolRemaining={5}
        slotRemaining={{}}
        spellName="Lay on Hands"
      />
    );
    expect(screen.getByText(/\(0 to 5\)/)).toBeTruthy();
    const input = screen.getByRole("spinbutton");
    expect((input as HTMLInputElement).max).toBe("5");
    const confirm = screen.getByText("Apply");
    fireEvent.change(input, { target: { value: "6" } });
    expect(confirm.closest("button")?.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "5" } });
    expect(confirm.closest("button")?.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(answer).toHaveBeenCalledWith({ inputId: "amount", kind: "integer", value: 5 });
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
