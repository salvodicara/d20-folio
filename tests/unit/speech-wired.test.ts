/**
 * Where a creature can't speak (Silence, Incapacitated), a spell with a Verbal
 * component can't be cast and a command-word item can't be used: both are refused
 * with nothing spent (2024; edge-case M18).
 */
import { describe, expect, it, vi } from "vitest";
import { getSpellById } from "@/data/spells";
import { makeItemResourceIdentity } from "@/lib/resources";
import { itemResourceSpend } from "@/lib/item-resource-commands";
import { createItemResourceCommands } from "@/lib/item-resource-controller";
import { castNeedsSpeech, speechBlocksCast } from "@/lib/play/speech";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const stunned = (doc: CharacterDoc): CharacterDoc => ({
  ...doc,
  session: { ...doc.session, conditions: ["stunned"] },
});

describe("a cast that needs speech", () => {
  const bolt = { spellId: "fire-bolt", summary: {} };
  it("a Verbal spell needs it; Subtle Spell or a waiver removes the need", () => {
    expect(getSpellById("fire-bolt")?.components.v).toBe(true);
    expect(castNeedsSpeech(bolt)).toBe(true);
    expect(castNeedsSpeech(bolt, ["subtle-spell"])).toBe(false);
    expect(castNeedsSpeech({ ...bolt, summary: { componentsWaived: ["v"] } })).toBe(
      false
    );
  });

  it("is refused while the caster can't speak", () => {
    const doc = makeCharacterDoc({ classId: "wizard", level: 3 });
    expect(speechBlocksCast(doc, bolt)).toBe(false);
    expect(speechBlocksCast(stunned(doc), bolt)).toBe(true);
    expect(speechBlocksCast(stunned(doc), bolt, ["subtle-spell"])).toBe(false);
  });
});

describe("a command-word item", () => {
  it("can't be used while its user can't speak, and nothing is spent", async () => {
    const instanceId = "gem-1";
    const doc = stunned(
      makeCharacterDoc({
        equipment: [
          { srdId: "gem-of-brightness", instanceId, quantity: 1, equipped: true },
        ],
      })
    );
    const blocked = vi.fn();
    const api = createItemResourceCommands({
      character: () => doc,
      readonly: () => false,
      applyOperation: () => {
        throw new Error("nothing should be applied");
      },
      applyOperations: () => {
        throw new Error("nothing should be applied");
      },
      requestInput: () => Promise.resolve(new Map()),
      notifyConflict: () => {
        throw new Error("conflict");
      },
      notifySpeechBlocked: blocked,
      itemName: () => "Gem",
    });
    const identity = makeItemResourceIdentity("gem-of-brightness", instanceId, "charges");
    expect(await api.prepare(itemResourceSpend(identity, 1), "Gem")).toBeNull();
    expect(blocked).toHaveBeenCalledOnce();
  });
});
