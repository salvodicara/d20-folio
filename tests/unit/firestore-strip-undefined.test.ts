/**
 * Regression — `stripUndefined` recursively removes undefined values
 * before any addDoc/updateDoc call.
 *
 * **Original bug (2026-05-28):** Creating a new character produced
 *   `FirebaseError: Function addDoc() called with invalid data.
 *    Unsupported field value: undefined (found in document
 *    users/{uid}/characters/{id})`
 * because `createCharacter` was writing the partial payload directly.
 * `updateCharacter` had been using `stripUndefined` since v0.2 — the new
 * `createCharacter` path now matches.
 *
 * Optional fields (`armorNote?`, the new `initiativeBonusOverride?`,
 * `spellcasting`, etc.) can legitimately be undefined when the wizard skips
 * them — those must be stripped, not written.
 */
import { describe, expect, it } from "vitest";
// Import from the pure module — NOT from @/lib/firestore, which
// transitively pulls in @/lib/firebase and crashes at module load in
// CI where VITE_FIREBASE_API_KEY is unset. The function is identical;
// firestore.ts re-exports it for runtime call sites.
import { stripUndefined } from "@/lib/strip-undefined";

describe("stripUndefined — Firestore write payload sanitizer", () => {
  it("removes top-level undefined values", () => {
    expect(stripUndefined({ a: 1, b: undefined, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("recurses into nested objects", () => {
    expect(
      stripUndefined({
        character: { name: "Lyra", subclass: undefined, level: 5 },
        session: { hp: { current: 12, temp: undefined } },
      })
    ).toEqual({
      character: { name: "Lyra", level: 5 },
      session: { hp: { current: 12 } },
    });
  });

  it("preserves explicit nulls (Firestore accepts null but not undefined)", () => {
    expect(
      stripUndefined({
        proficiencyBonusOverride: null,
        initiativeBonusOverride: null,
        shareId: null,
      })
    ).toEqual({
      proficiencyBonusOverride: null,
      initiativeBonusOverride: null,
      shareId: null,
    });
  });

  it("preserves arrays but cleans undefined inside their elements", () => {
    expect(
      stripUndefined({
        spells: [
          { srdId: "fireball", prepared: true },
          { srdId: "shield", prepared: undefined, alwaysPrepared: true },
        ],
      })
    ).toEqual({
      spells: [
        { srdId: "fireball", prepared: true },
        { srdId: "shield", alwaysPrepared: true },
      ],
    });
  });

  it("handles a realistic CharacterDoc-shaped payload with optional fields", () => {
    // Mirrors what create.tsx hands to createCharacter for a fresh L1 char.
    const payload = {
      portraitUrl: null,
      portraitCrop: null,
      status: "active",
      shareId: null,
      character: {
        name: "Lyra Voss",
        classes: [{ classId: "bard", level: 1 }], // L1 — no subclass yet
        proficiencyBonusOverride: null,
        initiativeBonusOverride: null, // new field, intentionally null
        armorNote: undefined, // never filled in the wizard
        spellcasting: undefined, // not a caster
      },
      session: { hp: { current: 8, temp: 0 } },
    };
    const cleaned = stripUndefined(payload) as typeof payload;
    expect(cleaned.character).toEqual({
      name: "Lyra Voss",
      classes: [{ classId: "bard", level: 1 }],
      proficiencyBonusOverride: null,
      initiativeBonusOverride: null,
    });
    expect(cleaned.session.hp).toEqual({ current: 8, temp: 0 });
  });

  it("null at the top level is normalized to null (not dropped — Firestore expects an object)", () => {
    // The function returns null for null/undefined leaves; not an empty
    // object. That's the historical contract used by every consumer
    // (the persistence read/serialize path + addDoc / updateDoc round-trips).
    expect(stripUndefined(undefined)).toBeNull();
    expect(stripUndefined(null)).toBeNull();
  });

  it("primitives pass through unchanged", () => {
    expect(stripUndefined(42)).toBe(42);
    expect(stripUndefined("hello")).toBe("hello");
    expect(stripUndefined(true)).toBe(true);
    expect(stripUndefined(false)).toBe(false);
  });
});
