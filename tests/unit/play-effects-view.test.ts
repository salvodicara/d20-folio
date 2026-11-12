/**
 * «Effetti» on Play (rehearsal 2026-11-06, #5): the list names every effect on the
 * character now — its own buffs, and what an ally put on it (Bless, Warding Bond),
 * with who cast it — so a changed number (AC 15) always has a visible cause.
 */
import { describe, expect, it } from "vitest";
import { playEffectsView } from "@/domains/play/play-effects-view";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const pc = (uid: string) => ({
  kind: "pc" as const,
  combatantId: `pc-${uid}`,
  memberUid: uid,
  characterId: `char-${uid}`,
});

const effect = (
  id: string,
  spell: string,
  actor: string,
  duration: ActiveCombatEffect["duration"]
) =>
  ({
    id,
    actor: pc(actor),
    target: pc("me"),
    source: { kind: "spell", id: spell, actionId: spell },
    payload: { kind: "grant-group", groupId: spell },
    duration,
  }) as unknown as ActiveCombatEffect;

function withEffects(effects: ActiveCombatEffect[]): CharacterDoc {
  const doc = makeCharacterDoc({ class: "Fighter" });
  doc.session.encounterEffects = effects;
  return doc;
}

const names: Record<string, string> = { "pc-ally": "Paladin", "pc-me": "Bard" };

describe("playEffectsView", () => {
  it("lists what an ally put on the character, with who cast it", () => {
    const doc = withEffects([
      effect("e1", "bless", "ally", {
        kind: "concentration",
        actorId: "pc-ally",
        sourceId: "bless",
      }),
      effect("e2", "warding-bond", "ally", { kind: "encounter" }),
    ]);
    const view = playEffectsView(doc, "it", (id) => names[id] ?? "");
    expect(view.rows.map((r) => [r.name, r.from])).toEqual([
      ["Benedizione", "Paladin"],
      ["Vincolo di Interdizione", "Paladin"],
    ]);
    expect(view.rows[0]?.concentration).toBe(true);
    expect(view.rows[0]?.spell).toEqual({ id: "bless", school: "enchantment" });
    expect(view.rows[0]?.gist).toBeTruthy();
    expect(view.count).toBe(2);
  });

  it("does not list again what the character cast on itself", () => {
    const doc = withEffects([effect("e1", "bless", "me", { kind: "encounter" })]);
    expect(playEffectsView(doc, "it", (id) => names[id] ?? "").rows).toEqual([]);
  });

  it("with nothing on the character, the list is empty", () => {
    expect(playEffectsView(withEffects([]), "it", () => "").count).toBe(0);
  });
});
