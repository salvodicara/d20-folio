/**
 * The DM's monster uses on its line (board A1): a tap spends a use through the DM's
 * edit log; a spent Recharge asks the d6 face, and a 5 gives the breath back.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
const edits: Array<(fight: EncounterState) => EncounterState> = [];
vi.mock("@/features/campaigns/encounter-edit-sync", () => ({
  editEncounter: (_id: string, apply: (fight: EncounterState) => EncounterState) =>
    edits.push(apply),
}));

import { MonsterUses } from "@/domains/combat/ui/MonsterUses";
import { ensureSrdKind } from "@/i18n";
import type { EncounterState } from "@/types/campaign";

const fight = (spent: Record<string, number>) =>
  ({
    combatants: [
      {
        id: "m1",
        kind: "monster",
        srdId: "young-red-dragon",
        name: "Drago",
        spent,
      },
    ],
  }) as unknown as EncounterState;

function mount(spent: Record<string, number>) {
  render(
    <MonsterUses
      campaignId="c"
      encounter={fight(spent)}
      ids={["m1"]}
      locale="en"
      onToast={() => {}}
    />
  );
}

describe("MonsterUses", () => {
  beforeAll(async () => {
    await ensureSrdKind("monster");
  });

  it("a ready breath spends with one tap", () => {
    edits.length = 0;
    mount({});
    fireEvent.click(screen.getByRole("button", { name: /^Fire Breath · Recharge 5–6$/ }));
    const after = edits[0]?.(fight({}));
    const dragon = after?.combatants[0] as { spent?: Record<string, number> };
    expect(Object.values(dragon.spent ?? {})).toEqual([1]);
  });

  it("a spent breath asks the d6; a 5 gives it back", () => {
    edits.length = 0;
    mount({ "actions:fire-breath": 1 });
    fireEvent.click(screen.getByRole("button", { name: /roll the d6/ }));
    fireEvent.click(screen.getByRole("button", { name: "The d6 shows 5" }));
    const after = edits[0]?.(fight({ "actions:fire-breath": 1 }));
    const dragon = after?.combatants[0] as { spent?: Record<string, number> };
    expect(dragon.spent?.["actions:fire-breath"] ?? 0).toBe(0);
  });
});
