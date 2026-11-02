/**
 * Condition immunity (edge-case family M3, docs/architecture/2026-11-edge-cases.md).
 * An immune creature is not affected by the condition: a condition it already has is
 * suppressed, not removed, so it applies again when the immunity ends (Heroism ends
 * while the dragon's Frightened still runs). An immune creature gains no Exhaustion.
 *
 * Corpus: Exhaustion immunity (FVTT#7492); Frightened and Heroism (SAC #12, #127).
 */
import { describe, expect, it } from "vitest";

import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import type { Grant } from "@/lib/grants";
import { setExhaustion } from "@/lib/play/vitals";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc, CustomFeature, SessionState } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

function withGrants(grants: Grant[], session: Partial<SessionState> = {}): CharacterDoc {
  const feature: CustomFeature = {
    custom: true,
    title: "Homebrew",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    grants,
    instanceId: customInstanceId("immunity"),
  };
  const doc = makeCharacterDoc({}, session);
  return { ...doc, character: { ...doc.character, features: [feature] } };
}

const immuneTo = (condition: string): Grant[] => [
  { type: "condition-immunity", condition } as Grant,
];

describe("a condition the creature is immune to is suppressed", () => {
  it("Frightened on an immune creature does not count, and is listed as suppressed", () => {
    const doc = withGrants(immuneTo("frightened"), { conditions: ["frightened"] });
    const view = deriveCharacter(doc);
    expect(view.conditions).not.toContain("frightened");
    expect(view.suppressedConditions).toEqual(["frightened"]);
    // The stored chip stays: it applies again once the immunity ends.
    expect(doc.session.conditions).toContain("frightened");
  });

  it("the rules read the effective list: no Disadvantage from a suppressed Frightened", () => {
    const immune = aggregateCharacterGrants(
      withGrants(immuneTo("frightened")).character,
      { ...withGrants(immuneTo("frightened")).session, conditions: ["frightened"] }
    );
    expect(immune.conditions).not.toContain("frightened");
    const plain = aggregateCharacterGrants(makeCharacterDoc({}).character, {
      ...makeCharacterDoc({}).session,
      conditions: ["frightened"],
    });
    expect(plain.conditions).toContain("frightened");
  });

  it("an immunity to Unconscious also suppresses the Incapacitated and Prone it implies", () => {
    const doc = withGrants(immuneTo("unconscious"), { conditions: ["unconscious"] });
    const view = deriveCharacter(doc);
    expect(view.conditions).not.toContain("unconscious");
    expect(view.conditions).not.toContain("incapacitated");
    expect(view.conditions).not.toContain("prone");
  });

  it("an implied condition another source still gives stays (Prone on its own)", () => {
    const doc = withGrants(immuneTo("unconscious"), {
      conditions: ["unconscious", "prone"],
    });
    expect(deriveCharacter(doc).conditions).toContain("prone");
  });
});

describe("Exhaustion immunity (corpus: Exhaustion immunity)", () => {
  it("an immune creature gains no Exhaustion level", () => {
    expect(setExhaustion(withGrants(immuneTo("exhaustion")), 1)).toBeNull();
  });

  it("it can still lose levels it already had", () => {
    const tired = withGrants(immuneTo("exhaustion"), { exhaustion: 2 });
    expect(setExhaustion(tired, 1)?.exhaustion).toBe(1);
  });

  it("a creature without the immunity gains it as before", () => {
    expect(setExhaustion(makeCharacterDoc({}), 1)?.exhaustion).toBe(1);
  });
});
