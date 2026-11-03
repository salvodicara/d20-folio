/**
 * Every catalogue spell whose outcome hangs on the target's Hit Points (Power Word
 * Kill and Stun, the pack's Wail of the Banshee) or that revives (Revivify, Raise
 * Dead, Resurrection, True Resurrection) opens the tray from its REAL resolved
 * action, at the targets it may pick (Lane A found the hand-built plans hid that
 * Stun and Revivify never opened it). A revive picks an ally, the dead included.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { damageTrayPlan } from "@/lib/play/damage-tray";
import { localizeActions } from "@/lib/views/combat-action-view";

import { makeCharacterDoc } from "./_helpers";

const subjects = spells.filter((spell) => spell.hitPointThreshold || spell.revives);

function actionOf(spellId: string, classId: string) {
  const doc = makeCharacterDoc({
    classId,
    level: 17,
    spells: [{ srdId: spellId, prepared: true }],
  });
  // A spell cast over an hour (Raise Dead) is a spellbook use, not a combat one.
  const action = [
    ...localizeActions(doc, "en"),
    ...localizeActions(doc, "en", "spellbook"),
  ].find((a) => a.spellId === spellId);
  if (!action) throw new Error(`no action for ${spellId}`);
  return action;
}

describe("threshold and revive spells open the tray from their real action", () => {
  it("there are some", () => {
    expect(subjects.map((s) => s.id)).toEqual(
      expect.arrayContaining(["power-word-kill", "power-word-stun", "revivify"])
    );
  });

  it.each(subjects.map((spell) => [spell.id, spell.classes[0] ?? "wizard"] as const))(
    "%s",
    (id, classId) => {
      const action = actionOf(id, classId);
      const plan = damageTrayPlan(action, ["target-1"], "me");
      expect(plan).not.toBeNull();
      const spell = spells.find((s) => s.id === id);
      if (spell?.revives) {
        expect(plan?.revive).toEqual(spell.revives);
        // An ally, the dead among them.
        expect(spell.targeting).toMatchObject({ affinity: "ally", includesDead: true });
      }
      if (spell?.hitPointThreshold) {
        expect(plan?.hitPointThreshold).toEqual(spell.hitPointThreshold);
      }
    }
  );
});
