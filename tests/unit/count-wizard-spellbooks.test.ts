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
import { bookTarget, countWizardSpellbooks } from "../../scripts/count-wizard-spellbooks";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string) {
  const envelope = serializeCharacterEnvelope(doc);
  return { path, data: { schema: 3, build: envelope.build, state: {} } as RawMap };
}

// Wizard 5 as the app built one: 9 levelled spells (the Prepared column), all prepared,
// plus one grant pick and a cantrip.
const wizard = makeCharacterDoc({
  name: assertNonEmptyString("Secret Wizard Name"),
  classes: [{ classId: "wizard", subclassId: "evoker", level: 5 }],
  spells: [
    { srdId: "fire-bolt", prepared: true },
    ...[
      "magic-missile",
      "shield",
      "mage-armor",
      "sleep",
      "detect-magic",
      "misty-step",
      "web",
      "fireball",
      "counterspell",
    ].map((srdId) => ({ srdId, prepared: true })),
    { srdId: "identify", prepared: false, grantedBy: "some-feat" },
  ],
});
const fighter = makeCharacterDoc({ classes: [{ classId: "fighter", level: 5 }] });

describe("the wizard spellbook count", () => {
  it("the 2024 book: 6, then 2 per Wizard level", () => {
    expect(bookTarget(1)).toBe(6);
    expect(bookTarget(5)).toBe(14);
  });

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
        shortfall: 5,
      },
    ]);
  });

  it("says nothing that names the character, the user or a spell", () => {
    const text = JSON.stringify(
      countWizardSpellbooks([parent(wizard, "users/u1/characters/c1")])
    );
    expect(text).not.toMatch(/Secret|u1|c1|fireball|identify/);
  });
});
