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
import * as concentration from "@/lib/play/concentration";
import * as conditions from "@/lib/play/conditions";
import { concentrationValue } from "@/lib/concentration";
import * as damage from "@/lib/play/damage";
import * as defenses from "@/lib/play/defenses";
import * as cover from "@/lib/play/cover";
import * as material from "@/lib/play/material-cost";
import * as fading from "@/lib/play/fading-penalties";
import * as trackerRolls from "@/lib/play/tracker-rolls";
import * as forms from "@/lib/play/forms";
import * as light from "@/lib/play/light";
import * as pins from "@/lib/play/pins";
import * as ready from "@/lib/play/ready";
import * as rests from "@/lib/play/rests";
import * as states from "@/lib/play/states";
import * as situations from "@/lib/play/situations";
import * as suffocation from "@/lib/play/suffocation";
import * as surprise from "@/lib/play/surprise";
import * as time from "@/lib/play/time";
import * as vitals from "@/lib/play/vitals";
import * as wish from "@/lib/play/wish";
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
      breath: { roundsLeft: 0, gained: 1 },
      familiar: { monsterId: "owl", creatureType: "fey" },
      companionHp: { "find-familiar": { current: 1 }, wolf: { current: 3 } },
      activeFeatures: ["rage"],
      sessionDefenses: { resistance: ["fire"] },
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
  "take-damage": [
    { kind: "take-damage", amount: 7, crit: true },
    () => at(damage.takeDamage(doc, 7, { crit: true })?.session),
  ],
  heal: [{ kind: "heal", amount: 3 }, () => at(vitals.healBy(doc, 3))],
  "gain-temp-hp": [
    { kind: "gain-temp-hp", amount: 6 },
    () => at(vitals.gainTempHp(doc, 6)),
  ],
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
  "set-tracker-roll": [
    { kind: "set-tracker-roll", trackerId: "arcane-recovery", index: 0, value: 3 },
    () => at(trackerRolls.setTrackerRoll(doc, "arcane-recovery", 0, 3)),
  ],
  "spend-tracker-roll": [
    { kind: "spend-tracker-roll", trackerId: "arcane-recovery", index: 0 },
    () => at(trackerRolls.spendTrackerRoll(doc, "arcane-recovery", 0)),
  ],
  "top-up-tracker": [
    { kind: "top-up-tracker", trackerId: "arcane-recovery", upTo: "full" },
    () => at(trackerRolls.topUpTracker(doc, "arcane-recovery", "full")),
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
  "set-concentration": [
    {
      kind: "set-concentration",
      spell: concentrationValue("bless"),
      engineActionId: "concentration-break-1",
    },
    () =>
      concentration.setConcentration(
        doc,
        concentrationValue("bless"),
        "concentration-break-1"
      ),
  ],
  "add-condition": [
    { kind: "add-condition", condition: "poisoned" },
    () => at(conditions.addCondition(doc, "poisoned")),
  ],
  "remove-condition": [
    { kind: "remove-condition", condition: "prone" },
    () => at(conditions.removeCondition(doc, "prone")?.session),
  ],
  "add-session-defense": [
    { kind: "add-session-defense", defense: "immunity", id: "poison" },
    () => at(defenses.addSessionDefense(doc, "immunity", "poison")),
  ],
  "remove-session-defense": [
    { kind: "remove-session-defense", defense: "resistance", id: "fire" },
    () => at(defenses.removeSessionDefense(doc, "resistance", "fire")),
  ],
  "set-bundle-choices": [
    { kind: "set-bundle-choices", choices: { "spell-enlarge-reduce": "enlarge" } },
    () => at(states.setBundleChoices(doc, { "spell-enlarge-reduce": "enlarge" })),
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
  "set-wish-stress": [
    { kind: "set-wish-stress", stressed: true },
    () => at(wish.setWishStress(doc, true)),
  ],
  "set-situation": [
    {
      kind: "set-situation",
      situation: "long-range",
      lit: true,
      until: { round: 3, phase: "turn-end" },
    },
    () =>
      at(
        situations.setSituation(doc, "long-range", true, { round: 3, phase: "turn-end" })
      ),
  ],
  "end-fight-situations": [
    { kind: "end-fight-situations" },
    () => at(situations.endFightSituations(doc)),
  ],
  "set-light": [
    { kind: "set-light", level: "dim" },
    () => at(light.setLight(doc, "dim")),
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
  "release-companion": [
    { kind: "release-companion", featureId: "planar-ally" },
    () => at(companions.releaseCompanion(doc.session, "planar-ally")),
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
  "time-passes": [{ kind: "time-passes", minutes: 1 }, () => time.passTime(doc, 1)],
  "recover-per-turn-trackers": [
    { kind: "recover-per-turn-trackers" },
    () => at(states.recoverPerTurnTrackers(doc)?.session),
  ],
  "hold-breath": [
    { kind: "hold-breath", choking: true },
    () => at(suffocation.holdBreath(doc, { choking: true })),
  ],
  "breathe-again": [{ kind: "breathe-again" }, () => at(suffocation.breatheAgain(doc))],
  "breath-turn-end": [
    { kind: "breath-turn-end" },
    () => at(suffocation.passBreathRounds(doc, 1)),
  ],
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
