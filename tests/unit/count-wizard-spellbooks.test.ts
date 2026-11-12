/**
 * The read-only wizard spellbook count: per wizard, the levelled Wizard spells on the
 * sheet that count toward the 2024 book (6, then 2 per Wizard level), the prepared ones,
 * grant picks on top, and the shortfall. Counts only: never a name or a spell.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { countWizardSpellbooks } from "../../scripts/count-wizard-spellbooks";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string) {
  const envelope = serializeCharacterEnvelope(doc);
  return { path, data: { schema: 3, build: envelope.build, state: {} } as RawMap };
}

// Wizard 5 as the app built one: 9 levelled spells (the Prepared column), all prepared,
// plus one grant pick and a cantrip.
const NINE = [
  "magic-missile",
  "shield",
  "mage-armor",
  "sleep",
  "detect-magic",
  "misty-step",
  "web",
  "fireball",
  "counterspell",
];
const wizard = makeCharacterDoc({
  name: assertNonEmptyString("Secret Wizard Name"),
  classes: [{ classId: "wizard", subclassId: "evoker", level: 5 }],
  spells: [
    { srdId: "fire-bolt", prepared: true },
    ...NINE.map((srdId) => ({ srdId, prepared: true })),
    { srdId: "identify", prepared: false, grantedBy: "some-feat" },
  ],
});
const fighter = makeCharacterDoc({ classes: [{ classId: "fighter", level: 5 }] });

describe("the wizard spellbook count", () => {
  it("counts a wizard's book, prepared spells and grant picks, and the shortfall", () => {
    const out = countWizardSpellbooks([
      parent(wizard, "users/u1/characters/c1"),
      parent(fighter, "users/u2/characters/c2"),
    ]);
    expect(out.wizards).toEqual([
      {
        wizardLevel: 5,
        book: 9,
        prepared: 9,
        granted: 1,
        custom: 0,
        target: 14,
        // An Evoker: Evocation Savant has given 3 to date (the envelope carries it).
        allotment: 3,
        shortfall: 8,
      },
    ]);
  });

  it("says nothing that names the character, the user or a spell", () => {
    const text = JSON.stringify(
      countWizardSpellbooks([parent(wizard, "users/u1/characters/c1")])
    );
    expect(text).not.toMatch(/Secret|u1|c1|fireball|identify/);
  });

  it("a Savant's unmarked picks: the allotment is added to the target", () => {
    // Evoker 5 with Evocation Savant (2 + 1 to date) and 15 unmarked Wizard spells.
    const evoker = makeCharacterDoc({
      classes: [{ classId: "wizard", subclassId: "evoker", level: 5 }],
      features: [{ srdId: "wizard-evoker-evocation-savant" }],
      spells: [
        ...NINE,
        "burning-hands",
        "thunderwave",
        "find-familiar",
        "scorching-ray",
        "lightning-bolt",
        "feather-fall",
      ].map((srdId) => ({ srdId, prepared: false })),
    });
    expect(
      countWizardSpellbooks([parent(evoker, "users/u3/characters/c3")]).wizards
    ).toEqual([
      {
        wizardLevel: 5,
        book: 15,
        prepared: 0,
        granted: 0,
        custom: 0,
        target: 14,
        allotment: 3,
        shortfall: 2,
      },
    ]);
  });
});
