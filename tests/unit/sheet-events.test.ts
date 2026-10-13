/**
 * `applySheetEvent`: every play event runs exactly its `lib/play` transition. Each case
 * names the direct call the event must equal, so a miswired branch fails by name.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import {
  applySheetEvent,
  type SheetEvent,
  type SheetEventKind,
} from "@/lib/play/sheet-events";
import * as companions from "@/lib/play/companions";
import * as conditions from "@/lib/play/conditions";
import * as cover from "@/lib/play/cover";
import * as material from "@/lib/play/material-cost";
import * as fading from "@/lib/play/fading-penalties";
import * as forms from "@/lib/play/forms";
import * as pins from "@/lib/play/pins";
import * as ready from "@/lib/play/ready";
import * as rests from "@/lib/play/rests";
import * as states from "@/lib/play/states";
import * as surprise from "@/lib/play/surprise";
import * as vitals from "@/lib/play/vitals";
import type { CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function withWorld(doc: CharacterDoc): CharacterDoc {
  const world = characterWorldState(
    doc,
    "test-uid",
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) throw new Error("world fixture failed");
  return { ...doc, session: { ...doc.session, world: structuredClone(world) } };
}

const doc = withWorld(
  makeCharacterDoc(
    { classId: "wizard", level: 5, spellSlots: [{ level: 2, total: 3 }] },
    {
      hp: { current: 10, temp: 2 },
      conditions: ["prone"],
      deathSucc: 1,
      exhaustion: 1,
      familiar: { monsterId: "owl", creatureType: "fey" },
      companionHp: { "find-familiar": { current: 1 }, wolf: { current: 3 } },
      activeFeatures: ["rage"],
    }
  )
);

const at = (session: SessionState | null | undefined): CharacterDoc | null =>
  session ? { ...doc, session } : null;

/** One case per event kind: the event, and the direct transition it must equal. */
const CASES: {
  [K in SheetEventKind]: [Extract<SheetEvent, { kind: K }>, () => CharacterDoc | null];
} = {
  "set-hp": [{ kind: "set-hp", current: 4 }, () => at(vitals.setHp(doc, 4))],
  "set-temp-hp": [{ kind: "set-temp-hp", temp: 5 }, () => at(vitals.setTempHp(doc, 5))],
  "set-hp-max-reduction": [
    { kind: "set-hp-max-reduction", total: 6 },
    () => at(vitals.setHpMaxReduction(doc, 6)),
  ],
  "spend-slot": [
    { kind: "spend-slot", level: 2, pactMagic: false },
    () => at(vitals.spendSpellSlot(doc, 2, false)),
  ],
  "restore-slot": [
    { kind: "restore-slot", level: 2, pactMagic: false },
    () => at(vitals.restoreSpellSlot(doc, 2, false)),
  ],
  "spend-tracker": [
    { kind: "spend-tracker", trackerId: "arcane-recovery", amount: 1 },
    () => at(vitals.spendTracker(doc, "arcane-recovery", 1)),
  ],
  "restore-tracker": [
    { kind: "restore-tracker", trackerId: "arcane-recovery", amount: 1 },
    () => at(vitals.restoreTracker(doc, "arcane-recovery", 1)),
  ],
  "set-death-saves": [
    { kind: "set-death-saves", successes: 2, failures: 1 },
    () => at(vitals.setDeathSaves(doc, 2, 1)?.session),
  ],
  "set-exhaustion": [
    { kind: "set-exhaustion", level: 3 },
    () => at(vitals.setExhaustion(doc, 3)),
  ],
  "start-fading-penalty": [
    { kind: "start-fading-penalty", penaltyId: "raise-dead" },
    () => at(fading.startFadingPenalty(doc, "raise-dead")),
  ],
  "set-fading-penalty": [
    { kind: "set-fading-penalty", penaltyId: "raise-dead", amount: 2 },
    () => at(fading.setFadingPenalty(doc, "raise-dead", 2)),
  ],
  "add-condition": [
    { kind: "add-condition", condition: "poisoned" },
    () => at(conditions.addCondition(doc, "poisoned")),
  ],
  "remove-condition": [
    { kind: "remove-condition", condition: "prone" },
    () => at(conditions.removeCondition(doc, "prone")?.session),
  ],
  "set-active-state": [
    { kind: "set-active-state", key: "rage", isActive: false, litRound: 2 },
    () => at(states.setActiveState(doc, "rage", false, 2)),
  ],
  "set-active-cast-level": [
    { kind: "set-active-cast-level", key: "haste", level: 4 },
    () => at(states.setActiveSpellCastLevel(doc, "haste", 4)),
  ],
  "set-cover": [
    { kind: "set-cover", level: "half", until: { round: 3, phase: "turn-start" } },
    () => at(cover.setCover(doc, "half", { round: 3, phase: "turn-start" })),
  ],
  "set-surprised": [
    { kind: "set-surprised", surprised: true },
    () => at(surprise.setSurprised(doc, true)),
  ],
  "adjust-currency": [
    { kind: "adjust-currency", delta: { gp: 3 } },
    () => at(material.adjustCurrency(doc.session, { gp: 3 })),
  ],
  "drop-beast-form": [{ kind: "drop-beast-form" }, () => forms.dropBeastForm(doc)],
  "set-readied-spell": [
    { kind: "set-readied-spell", readied: { expiresRound: 2 } },
    () => at(ready.setReadiedSpell(doc.session, { expiresRound: 2 })),
  ],
  "set-companion-hp": [
    { kind: "set-companion-hp", featureId: "wolf", current: 2 },
    () => at(companions.setCompanionHp(doc.session, "wolf", 2)),
  ],
  "set-companion-variant": [
    { kind: "set-companion-variant", featureId: "wolf", variantId: "sea" },
    () => at(companions.setCompanionVariant(doc.session, "wolf", "sea")),
  ],
  "set-companion-count": [
    { kind: "set-companion-count", groupId: "animate-dead", count: 4 },
    () => at(companions.setCompanionCount(doc.session, "animate-dead", 4)),
  ],
  "summon-familiar": [
    { kind: "summon-familiar", monsterId: "cat", creatureType: "fiend", maxHp: 2 },
    () => at(companions.summonFamiliar(doc.session, "cat", "fiend", 2)),
  ],
  "set-familiar-dismissed": [
    { kind: "set-familiar-dismissed", dismissed: true },
    () => at(companions.setFamiliarDismissed(doc.session, true)),
  ],
  "dismiss-familiar": [
    { kind: "dismiss-familiar" },
    () => at(companions.dismissFamiliar(doc.session)),
  ],
  "toggle-pin": [
    { kind: "toggle-pin", actionId: "fireball", defaultPinned: false },
    () => at(pins.togglePinnedAction(doc.session, "fireball", false)),
  ],
  "long-rest": [{ kind: "long-rest" }, () => rests.longRestCharacter(doc)],
  "short-rest": [{ kind: "short-rest" }, () => rests.shortRestCharacter(doc)],
};

describe("applySheetEvent", () => {
  // World actions carry a fresh id; pin it so the two runs compare.
  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("0-0-0-0-0");
  });

  it.each(Object.entries(CASES))(
    "%s runs its own transition",
    (_kind, [event, direct]) => {
      expect(applySheetEvent(doc, event)).toEqual(direct());
    }
  );

  it("never mutates the character it reads", () => {
    const before = structuredClone(doc);
    for (const [event] of Object.values(CASES)) applySheetEvent(doc, event);
    expect(doc).toEqual(before);
  });

  it("an event that changes nothing returns null", () => {
    const plain = makeCharacterDoc({ classId: "wizard", level: 5 });
    expect(applySheetEvent(plain, { kind: "dismiss-familiar" })).toBeNull();
    expect(applySheetEvent(plain, { kind: "drop-beast-form" })).toBeNull();
  });
});
