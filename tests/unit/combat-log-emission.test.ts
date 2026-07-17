/**
 * Combat-log emission at the STATE-SEAM (events-as-data, COMBAT-LOG-EVENTS #96).
 *
 * The combat log records the deterministic session story events, not just action
 * commits. Each is emitted from the store action that ACTUALLY changes the state
 * (the single emission path), as a STRUCTURED `CombatEvent` (ids + numbers, never a
 * localized line). These tests pin that each state-seam appends the right event
 * with the right args, and — the locale-independence GUARD — that the stored log
 * carries NO localized strings (only ids/tokens + numbers), so the mixed-language
 * bug can never return.
 *
 * Drives the real `useCharacterStore` with the mock — no Firebase env (IDB no-ops
 * under jsdom).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CombatEvent } from "@/types/combat-log";
import { conc } from "./__helpers__/concentration";

function load(overrides?: Partial<(typeof MOCK_CHARACTER)["session"]>): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  doc.session.concentration = "";
  doc.session.conditions = [];
  doc.session.hp = { current: 30, temp: 0 };
  doc.character.hp = { ...doc.character.hp, max: 40 };
  doc.session.deathSucc = 0;
  doc.session.deathFail = 0;
  if (overrides) Object.assign(doc.session, overrides);
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
}

function events(): CombatEvent[] {
  return (useCharacterStore.getState().character?.session.logEntries ?? []).map(
    (e) => e.event
  );
}
const last = (): CombatEvent | undefined => events().at(-1);
const store = () => useCharacterStore.getState();

describe("combat-log emission at the state-seam", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("applyDamage emits hp-damage with the TOTAL amount + resulting current/max", () => {
    load({ hp: { current: 30, temp: 0 } });
    store().applyDamage(12);
    expect(last()).toEqual({ kind: "hp-damage", amount: 12, current: 18, max: 40 });
  });

  it("applyDamage counts the temp-absorbed slice in the logged amount (RAW)", () => {
    load({ hp: { current: 30, temp: 5 } });
    store().applyDamage(8); // 5 to temp, 3 to current → current 27
    expect(last()).toEqual({ kind: "hp-damage", amount: 8, current: 27, max: 40 });
  });

  it("applyHealing emits hp-heal with the amount + resulting current/max", () => {
    load({ hp: { current: 10, temp: 0 } });
    store().applyHealing(7);
    expect(last()).toEqual({ kind: "hp-heal", amount: 7, current: 17, max: 40 });
  });

  it("applyHealing clamps to max but logs the requested amount", () => {
    load({ hp: { current: 38, temp: 0 } });
    store().applyHealing(10); // clamps current to 40
    expect(last()).toEqual({ kind: "hp-heal", amount: 10, current: 40, max: 40 });
  });

  it("a no-op heal (already at max) logs nothing", () => {
    load({ hp: { current: 40, temp: 0 } });
    store().applyHealing(5);
    expect(events()).toHaveLength(0);
  });

  it("gainTempHp emits temp-hp-gain with the resulting pool (temp HP don't stack)", () => {
    load({ hp: { current: 30, temp: 3 } });
    store().gainTempHp(7); // 7 > 3 → pool becomes 7
    expect(last()).toEqual({ kind: "temp-hp-gain", amount: 7 });
  });

  it("a lower temp-HP grant doesn't replace the pool and logs nothing", () => {
    load({ hp: { current: 30, temp: 9 } });
    store().gainTempHp(4); // 4 < 9 → no change
    expect(events()).toHaveLength(0);
  });

  it("addCondition emits condition-gain with the stable condition id", () => {
    load();
    store().addCondition("frightened");
    expect(last()).toEqual({ kind: "condition-gain", conditionId: "frightened" });
  });

  it("removeCondition emits condition-loss with the condition id", () => {
    load({ conditions: ["frightened"] });
    store().removeCondition("frightened");
    expect(last()).toEqual({ kind: "condition-loss", conditionId: "frightened" });
  });

  it("setConcentration emits concentration-start when starting", () => {
    load();
    store().setConcentration(conc("bless"));
    expect(last()).toEqual({ kind: "concentration-start", spell: conc("bless") });
  });

  it("setConcentration on a SWAP logs the end of the old + start of the new", () => {
    load({ concentration: conc("hex") });
    store().setConcentration(conc("bless"));
    expect(events()).toEqual([
      { kind: "concentration-end", spell: conc("hex") },
      { kind: "concentration-start", spell: conc("bless") },
    ]);
  });

  it("setConcentration to empty emits concentration-end", () => {
    load({ concentration: conc("bless") });
    store().setConcentration("");
    expect(last()).toEqual({ kind: "concentration-end", spell: conc("bless") });
  });

  it("dropping to 0 HP while concentrating logs the auto-drop as concentration-end", () => {
    load({ hp: { current: 5, temp: 0 }, concentration: conc("bless") });
    store().applyDamage(10); // → 0 HP, concentration auto-drops
    expect(events()).toEqual([
      { kind: "hp-damage", amount: 10, current: 0, max: 40 },
      // RA-10 — the knockout auto-applies Unconscious (SRD "Falling Unconscious").
      { kind: "condition-gain", conditionId: "unconscious" },
      { kind: "concentration-end", spell: conc("bless") },
    ]);
  });

  it("setDeathSaves logs a death-save ONLY when a new mark is added", () => {
    load();
    store().setDeathSaves(1, 0);
    expect(last()).toEqual({
      kind: "death-save",
      outcome: "success",
      successes: 1,
      failures: 0,
    });
    store().setDeathSaves(1, 1);
    expect(last()).toEqual({
      kind: "death-save",
      outcome: "failure",
      successes: 1,
      failures: 1,
    });
    // Clearing a pip (count goes DOWN) is bookkeeping — it never logs.
    const before = events().length;
    store().setDeathSaves(0, 1);
    expect(events()).toHaveLength(before);
  });

  it("longRest + shortRest each emit a rest event (and the log survives the rest)", () => {
    load();
    store().logEvent({ kind: "hp-damage", amount: 1, current: 29, max: 40 });
    store().longRest();
    expect(last()).toEqual({ kind: "rest", restKind: "long" });
    // The pre-rest entry survives (the log is not wiped by a rest).
    expect(events().some((e) => e.kind === "hp-damage")).toBe(true);
    store().shortRest();
    expect(last()).toEqual({ kind: "rest", restKind: "short" });
  });
});

describe("locale-INDEPENDENCE guard — the stored log carries NO localized strings", () => {
  // The ONLY free-text fields a CombatEvent may carry are the documented stored
  // labels `actionName` / `spell` (a localized-at-use action/spell name, the same
  // exception the toast `spell` field uses) and a `legacy` event's frozen `text`.
  // EVERY other field must be a number or a stable id/token. This guard drives a
  // varied combat and asserts each stored event matches that contract — so a
  // future change that stores a localized sentence (the mixed-language bug) fails.
  const ALLOWED_STRING_FIELDS = new Set(["kind", "actionName", "spell", "text"]);
  // Fields that are stable ids/tokens (lowercase / enum tokens), not prose.
  const TOKEN_FIELDS = new Set([
    "conditionId",
    "effect",
    "slot",
    "outcome",
    "restKind",
    "legacyType",
  ]);

  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("every event emitted across a full combat is locale-independent", () => {
    load({ hp: { current: 30, temp: 0 }, concentration: conc("hex") });
    const s = store();
    s.applyDamage(8);
    s.applyHealing(4);
    s.gainTempHp(6);
    s.addCondition("frightened");
    s.removeCondition("frightened");
    s.setConcentration(conc("bless")); // swap: end hex + start bless
    s.setDeathSaves(1, 0);
    s.longRest();
    s.logEvent({ kind: "turn-end", round: 2 });

    const log = events();
    expect(log.length).toBeGreaterThan(5);
    for (const event of log) {
      for (const [key, value] of Object.entries(event)) {
        if (typeof value !== "string") continue; // numbers are always fine
        // A string field is allowed iff it is the discriminant, a documented
        // stored label, or a stable id/token — NEVER a localized sentence.
        const ok = ALLOWED_STRING_FIELDS.has(key) || TOKEN_FIELDS.has(key);
        expect(ok, `event "${event.kind}" stores a string under "${key}": ${value}`).toBe(
          true
        );
        // Token fields must look like ids (no spaces, lowercase tokens).
        if (TOKEN_FIELDS.has(key)) {
          expect(value, `${key} should be a token id`).not.toMatch(/\s/);
        }
      }
    }
  });
});
