/**
 * Invocation action-row seam (S10 — Gaze of Two Minds).
 *
 * Invocations previously carried ONLY `grants` — no `mechanics.actions` field
 * existed on `SrdEldritchInvocation`, and `resolveFeatureActions` (the ONE
 * consumer that turns `mechanics.actions` into Play-board rows) scanned
 * `character.features[]` and race traits only, never invocation sources. So
 * Gaze of Two Minds (2024 RAW, warlock:eldritch-invocation: "You can use a
 * Bonus Action to touch a willing creature and perceive through its senses…")
 * surfaced NOWHERE on the Play board even though a Warlock could take it.
 *
 * This suite proves the closed seam end-to-end through `resolveActions` (the
 * SAME pipeline every feature/race-trait/spell/weapon action flows through):
 * a Warlock who knows Gaze of Two Minds gets a bare Bonus-Action row (no slot,
 * no tracker — RAW carries no resource cost); a Warlock who doesn't know it
 * gets no such row (fail-before proven by the "without" case).
 */
import { describe, expect, it } from "vitest";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function warlock(invocations: string[]): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      classes: [{ classId: "warlock", level: 5, invocationChoices: invocations }],
      hitDieType: 8,
      features: [],
      weapons: [],
    },
    session: {
      ...MOCK_CHARACTER.session,
      exhaustion: 0,
      conditions: [],
      concentration: "",
    },
  };
}

describe("resolveActions — Gaze of Two Minds invocation action row", () => {
  it("a Warlock who knows Gaze of Two Minds gets a Bonus-Action row", () => {
    const row = resolveActions(warlock(["gaze-of-two-minds"])).find(
      (a) => a.id === "gaze-of-two-minds-bonus"
    );
    expect(row).toBeDefined();
    expect(row?.type).toBe("bonus");
    expect(row?.source).toBe("feature");
    // No resource cost per RAW — a bare economy row.
    expect(row?.costsSlot).toBe(false);
    expect(row?.costTracker).toBeUndefined();
    expect(row?.trackerCost).toBeUndefined();

    const view = row ? localizeAction(row, "en") : undefined;
    expect(view?.name).toBe("Gaze of Two Minds");
    expect(view?.summary.effect).toBe(
      "Touch a willing creature; perceive through its senses"
    );

    const viewIt = row ? localizeAction(row, "it") : undefined;
    expect(viewIt?.name).toBe("Sguardo delle Due Menti");
    expect(viewIt?.summary.effect).toBe(
      "Tocca una creatura consenziente e percepisci i suoi sensi"
    );
  });

  it("a Warlock WITHOUT Gaze of Two Minds gets no such row (fail-before proven)", () => {
    const actions = resolveActions(warlock(["armor-of-shadows"]));
    expect(actions.find((a) => a.id === "gaze-of-two-minds-bonus")).toBeUndefined();
  });

  it("a Warlock with no invocations at all gets no such row", () => {
    const actions = resolveActions(warlock([]));
    expect(actions.find((a) => a.id === "gaze-of-two-minds-bonus")).toBeUndefined();
  });

  it("an invocation with no mechanics.actions (e.g. Armor of Shadows) emits no invocation-action row", () => {
    // Armor of Shadows models its whole benefit via `grants` (an at-will cast) —
    // it must not spuriously surface an action row from the 1c invocation pass.
    const actions = resolveActions(warlock(["armor-of-shadows"]));
    expect(actions.find((a) => a.id === "armor-of-shadows-bonus")).toBeUndefined();
    expect(actions.find((a) => a.id === "armor-of-shadows-action")).toBeUndefined();
  });
});
