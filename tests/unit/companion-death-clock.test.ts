/**
 * A fallen companion's time of death on the game clock (edge-case M6): it starts at
 * 0 when it falls, runs on with time passing, rests and rounds, and goes when it is
 * revived. The revive window comes from its catalogue's `lifecycle.revive`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/classes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/data/classes")>();
  const index = new Map(real.classFeatureIndex);
  index.set("test-beast", {
    id: "test-beast",
    class: "ranger",
    level: 3,
    companion: {
      lifecycle: {
        endsOn: ["0-hp:dies"],
        revive: {
          withinMinutes: 60,
          action: "magic",
          cost: { kind: "spell-slot", minLevel: 1 },
          returnsAfterMinutes: 1,
        },
      },
    },
  } as never);
  return { ...real, classFeatureIndex: index };
});

import {
  ageFallenSummons,
  companionReviveWindow,
  reviveCompanion,
  setCompanionHp,
} from "@/lib/play/companions";
import { advanceEffectTimers } from "@/lib/play/effect-timers";
import { longRestCharacter } from "@/lib/play/rests";
import { passTime } from "@/lib/play/time";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function fallen(): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "ranger", level: 3 });
  return { ...doc, session: setCompanionHp(doc.session, "test-beast", 0) };
}

describe("a fallen companion's clock", () => {
  it("starts at its fall and runs with time, rests and rounds", () => {
    const doc = fallen();
    expect(doc.session.summons?.["test-beast"]).toEqual({
      fallen: true,
      fallenMinutes: 0,
    });
    const later = passTime(doc, 30);
    expect(later?.session.summons?.["test-beast"]?.fallenMinutes).toBe(30);
    expect(longRestCharacter(doc).session.summons?.["test-beast"]?.fallenMinutes).toBe(
      480
    );
    expect(
      advanceEffectTimers(doc, 1).session.summons?.["test-beast"]?.fallenMinutes
    ).toBeCloseTo(0.1);
  });

  it("the revive window says within, then expired; revive clears it", () => {
    const doc = fallen();
    expect(companionReviveWindow(doc, "test-beast")).toEqual({
      fallenMinutes: 0,
      withinMinutes: 60,
      within: true,
    });
    const late = { ...doc, session: ageFallenSummons(doc.session, 61) };
    expect(companionReviveWindow(late, "test-beast")?.within).toBe(false);
    const back = reviveCompanion(doc.session, "test-beast");
    expect(back?.summons?.["test-beast"]).toEqual({});
    expect(
      companionReviveWindow({ session: back ?? doc.session }, "test-beast")
    ).toBeNull();
  });

  it("round-trips through the stored session", async () => {
    const { sessionToState, stateToSession } = await import("@/lib/session-state-codec");
    const doc = { ...fallen(), session: ageFallenSummons(fallen().session, 12.5) };
    const back = stateToSession(
      JSON.parse(JSON.stringify(sessionToState(doc.session))) as Record<string, unknown>
    );
    expect(back.summons?.["test-beast"]).toEqual({ fallen: true, fallenMinutes: 12.5 });
  });
});
