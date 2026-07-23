/**
 * RA-16 — the SRD 2024 ±5 passive advantage/disadvantage step, end-to-end
 * through `deriveSavesAndChecks`. Uses the SRD Sentinel Shield (Advantage on
 * Wisdom (Perception) checks AND Initiative) + MOCK_CHARACTER, so this runs in
 * BOTH build modes. Pins the wiring the pure-function tests can't: the aggregate
 * → passive fold, per-passive scoping, the breakdown part, and override-first.
 */
import { describe, it, expect } from "vitest";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { MOCK_CHARACTER } from "@/lib/mock";

const session = MOCK_CHARACTER.session;
const passive = (
  res: ReturnType<typeof deriveSavesAndChecks>,
  id: "perception" | "insight" | "investigation"
) => {
  const row = res.passives.find((p) => p.id === id);
  if (!row) throw new Error(`missing passive ${id}`);
  return row;
};

describe("passive advantage step — RA-16 (Sentinel Shield)", () => {
  const base = deriveSavesAndChecks(MOCK_CHARACTER.character, session);
  const withShield = {
    ...MOCK_CHARACTER.character,
    equipment: [
      ...MOCK_CHARACTER.character.equipment,
      { srdId: "sentinel-shield", equipped: true },
    ],
  };
  const res = deriveSavesAndChecks(withShield, session);

  it("Advantage on Perception raises passive Perception by exactly +5", () => {
    expect(passive(res, "perception").computed).toBe(
      passive(base, "perception").computed + 5
    );
  });

  it("only Perception moves — Insight/Investigation are untouched (initiative doesn't leak)", () => {
    expect(passive(res, "insight").computed).toBe(passive(base, "insight").computed);
    expect(passive(res, "investigation").computed).toBe(
      passive(base, "investigation").computed
    );
  });

  it("the Perception breakdown carries an Advantage part worth +5", () => {
    expect(passive(res, "perception").breakdownParts).toContainEqual({
      label: { term: "common.advantage" },
      value: 5,
    });
  });

  it("override-first: the +5 lives in `computed`; a manual override still pins the shown value", () => {
    const overridden = { ...withShield, passivePerceptionOverride: 99 };
    const row = passive(deriveSavesAndChecks(overridden, session), "perception");
    expect(row.bonus).toBe(99);
    expect(row.computed).toBe(passive(base, "perception").computed + 5);
  });
});
