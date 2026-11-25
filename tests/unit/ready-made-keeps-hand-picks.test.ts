/**
 * The ready-made fill (entering Equipment on the new creation, «Quick build») tops up
 * only what is missing: a pick the player made by hand is never replaced (E4 item 3,
 * the Roll20 / DDB builders keep the player's choices). This guards it before the new
 * UI's hand-pickers arrive.
 */
import { describe, expect, it } from "vitest";

import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { ORIGIN_LANGUAGE_SLOT_ID } from "@/lib/creation-choices";

const apply = (d: CreationDraft, ...a: CreationDraftAction[]) =>
  a.reduce(creationDraftReducer, d);

describe("the ready-made fill keeps every hand pick", () => {
  it("a Wizard's hand-picked skill, cantrip, spell and language stay; only gaps fill", () => {
    const picked = apply(
      initialCreationDraft(),
      { type: "selectClass", classId: "wizard" },
      { type: "selectBackground", backgroundId: "sage" },
      { type: "selectRace", raceId: "dwarf" },
      { type: "toggleClassSkill", skillId: "medicine" },
      { type: "toggleClassSpell", list: "cantrips", spellId: "fire-bolt", limit: 3 },
      { type: "toggleClassSpell", list: "spells", spellId: "grease", limit: 6 },
      { type: "setLanguagePicks", picks: { [ORIGIN_LANGUAGE_SLOT_ID]: ["giant"] } }
    );
    const filled = apply(picked, { type: "fillReadyMade" });
    expect(filled.classSkills).toContain("medicine");
    expect(filled.cantrips).toContain("fire-bolt");
    expect(filled.spells).toContain("grease");
    expect(filled.languagePicks[ORIGIN_LANGUAGE_SLOT_ID]).toContain("giant");
    const facts = creationFacts(filled);
    expect(facts.skillsComplete).toBe(true);
    expect(facts.cantripsComplete).toBe(true);
    expect(facts.spellsComplete).toBe(true);
    expect(facts.languagesComplete).toBe(true);
  });

  it("a complete hand-made draft is left exactly as it is", () => {
    const done = apply(
      initialCreationDraft(),
      { type: "selectClass", classId: "fighter" },
      { type: "selectRace", raceId: "dwarf" },
      { type: "fillReadyMade" }
    );
    expect(apply(done, { type: "fillReadyMade" })).toBe(done);
  });
});
