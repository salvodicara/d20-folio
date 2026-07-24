import { describe, it, expect } from "vitest";
import {
  DEATH_FAIL_LIMIT,
  DEATH_SUCCESS_LIMIT,
  EXHAUSTION_DEATH_LEVEL,
  diedInPlay,
  diedOfExhaustion,
  stabilisedInPlay,
  isCharacterDead,
} from "@/lib/character-status";

describe("character-status — the single source of truth for 'is this hero fallen?'", () => {
  it("pins the PHB 2024 thresholds at 3", () => {
    expect(DEATH_FAIL_LIMIT).toBe(3);
    expect(DEATH_SUCCESS_LIMIT).toBe(3);
  });

  it("pins the SRD Exhaustion death level at 6", () => {
    expect(EXHAUSTION_DEATH_LEVEL).toBe(6);
  });

  it("diedInPlay only at three failed saves", () => {
    expect(diedInPlay({ deathFail: 0 })).toBe(false);
    expect(diedInPlay({ deathFail: 2 })).toBe(false);
    expect(diedInPlay({ deathFail: 3 })).toBe(true);
  });

  it("diedOfExhaustion only at level 6", () => {
    expect(diedOfExhaustion({ exhaustion: 5 })).toBe(false);
    expect(diedOfExhaustion({ exhaustion: 6 })).toBe(true);
  });

  it("stabilisedInPlay only at three successes", () => {
    expect(stabilisedInPlay({ deathSucc: 2 })).toBe(false);
    expect(stabilisedInPlay({ deathSucc: 3 })).toBe(true);
  });

  it("isCharacterDead is true when the roster lifecycle says dead", () => {
    expect(isCharacterDead("dead", { deathFail: 0, exhaustion: 0 })).toBe(true);
  });

  it("isCharacterDead is true when the character died IN PLAY but status lags at active", () => {
    // The exact bug: a real death lives in the session, not the status field.
    expect(isCharacterDead("active", { deathFail: 3, exhaustion: 0 })).toBe(true);
  });

  it("RA-21 — isCharacterDead is true at Exhaustion 6 even with no failed saves and status active", () => {
    expect(isCharacterDead("active", { deathFail: 0, exhaustion: 6 })).toBe(true);
  });

  it("RA-21 — isCharacterDead is false at Exhaustion 5 (merely exhausted, not dead)", () => {
    expect(isCharacterDead("active", { deathFail: 0, exhaustion: 5 })).toBe(false);
  });

  it("isCharacterDead is false for a living character (no death saves, not flagged)", () => {
    expect(isCharacterDead("active", { deathFail: 0, exhaustion: 0 })).toBe(false);
    expect(isCharacterDead("retired", { deathFail: 1, exhaustion: 0 })).toBe(false);
    expect(isCharacterDead("archived", { deathFail: 2, exhaustion: 0 })).toBe(false);
  });
});
