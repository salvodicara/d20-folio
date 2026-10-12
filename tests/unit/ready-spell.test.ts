/**
 * `lib/play/ready`: readying a spell (2024 Ready action). Cast now with its slot,
 * held with Concentration until the Reaction releases it or the start of your next
 * turn; losing Concentration loses it.
 */
import { describe, expect, it } from "vitest";
import { spells } from "@/data/spells";
import {
  castReadiesSpell,
  readiedHold,
  setReadiedSpell,
  readiedSpellExpires,
  readiedTargets,
  READY_ACTION_ID,
  releaseKeepsConcentration,
} from "@/lib/play/ready";
import { changeConcentration } from "@/lib/play/concentration";
import { concentrationValue } from "@/lib/concentration";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { SelectedAction } from "@/stores/combatStore";
import type { SessionState } from "@/types/character";
import { sanitizeSession } from "@/lib/sanitize-session";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import { makeCharacterDoc } from "./_helpers";

const hold = (session: SessionState, round: number, logId: string | null) => ({
  ...session,
  readiedSpell: readiedHold(round, logId),
});
const READY: SelectedAction = { id: READY_ACTION_ID, name: "Ready", slot: "action" };
const spellAction = (castTiming: ResolvedAction["castTiming"]) =>
  ({ source: "spell", castTiming, spellId: "fireball" }) as ResolvedAction;

describe("which cast is readied", () => {
  const session = makeCharacterDoc().session;

  it("an action-time spell cast after Ready this turn", () => {
    expect(castReadiesSpell(spellAction("action"), [READY], session)).toBe(true);
  });

  it("not without Ready, not a bonus/reaction/extended spell, not a second spell", () => {
    expect(castReadiesSpell(spellAction("action"), [], session)).toBe(false);
    for (const timing of ["bonus", "reaction", "extended"] as const) {
      expect(castReadiesSpell(spellAction(timing), [READY], session)).toBe(false);
    }
    const holding = hold(session, 3, null);
    expect(castReadiesSpell(spellAction("action"), [READY], holding)).toBe(false);
    expect(
      castReadiesSpell({ source: "weapon" } as ResolvedAction, [READY], session)
    ).toBe(false);
  });
});

describe("holding and losing it", () => {
  it("lasts until the start of your next turn", () => {
    const held = hold(makeCharacterDoc().session, 3, "log-1");
    expect(held.readiedSpell).toEqual({ expiresRound: 4, castLogId: "log-1" });
    expect(readiedSpellExpires(held, 3)).toBe(false);
    expect(readiedSpellExpires(held, 4)).toBe(true);
    expect(readiedSpellExpires(makeCharacterDoc().session, 9)).toBe(false);
  });

  it("rides a concentration: no hold without one; dropping clears it", () => {
    const session = makeCharacterDoc().session;
    expect(setReadiedSpell(session, readiedHold(1, null))).toBeNull();
    const concentrating = { ...session, concentration: concentrationValue("fireball") };
    const held = setReadiedSpell(concentrating, readiedHold(1, null));
    expect(held?.readiedSpell).toEqual({ expiresRound: 2 });
    expect(setReadiedSpell(held ?? concentrating, undefined)).not.toHaveProperty(
      "readiedSpell"
    );
    expect(setReadiedSpell(concentrating, undefined)).toBeNull();
  });

  it("is lost whenever Concentration changes (broken, dropped or swapped)", () => {
    const doc = makeCharacterDoc();
    doc.session.concentration = concentrationValue("fireball");
    doc.session = hold(doc.session, 1, null);
    expect(changeConcentration(doc, "").doc.session.readiedSpell).toBeUndefined();
    expect(
      changeConcentration(doc, concentrationValue("bless")).doc.session.readiedSpell
    ).toBeUndefined();
    // Re-setting the same spell is not a change.
    expect(
      changeConcentration(doc, concentrationValue("fireball")).doc.session.readiedSpell
    ).toBeDefined();
  });
});

describe("releasing it", () => {
  it("keeps Concentration exactly for the spells that need it, from the catalogue", () => {
    for (const spell of spells.filter((s) => s.level >= 1)) {
      const session = {
        ...makeCharacterDoc().session,
        concentration: concentrationValue(spell.id),
      };
      expect(releaseKeepsConcentration(session)).toBe(spell.concentration);
    }
  });

  it("aims at the targets the readying cast picked", () => {
    const doc = makeCharacterDoc();
    doc.session.logEntries = [
      {
        id: "log-1",
        ts: 0,
        event: {
          kind: "action-use",
          action: { kind: "lit", en: "Fireball", it: "Palla di Fuoco" },
          effect: "spell-cast",
          slot: "action",
          targets: ["monster-1"],
        },
      },
    ] as typeof doc.session.logEntries;
    doc.session = hold(doc.session, 1, "log-1");
    expect(readiedTargets(doc)).toEqual(["monster-1"]);
    doc.session = hold(doc.session, 1, null);
    expect(readiedTargets(doc)).toEqual([]);
  });
});

describe("saving it", () => {
  it("survives the save round-trip with its concentration, never without", () => {
    const held = {
      ...hold(makeCharacterDoc().session, 2, "log-1"),
      concentration: concentrationValue("fireball"),
    };
    const state = sessionToState(held) as Record<string, unknown>;
    expect(stateToSession(state).readiedSpell).toEqual({
      expiresRound: 3,
      castLogId: "log-1",
    });
    expect(sanitizeSession(held).readiedSpell).toEqual(held.readiedSpell);
    const orphan = { ...held, concentration: "" as const };
    expect(sessionToState(orphan)).not.toHaveProperty("readiedSpell");
    expect(sanitizeSession(orphan)).not.toHaveProperty("readiedSpell");
    expect(
      stateToSession({ ...state, readiedSpell: { expiresRound: "x" } }).readiedSpell
    ).toBeUndefined();
  });
});
