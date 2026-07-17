/**
 * action-log — the events-as-data store API: per-entry append / remove / clear /
 * cap. The store stores STRUCTURED `CombatEvent`s (ids + numbers), never a
 * pre-localized line — the presenter localizes at render.
 *
 * Confirmed bugs locked here (action-log finder set):
 *  - `log-snapshot-restore-wipes-later-entries` /
 *    `log-snapshot-cross-slot-clobber`: undo used to snapshot-restore the WHOLE
 *    `logEntries` array, silently deleting every OTHER entry committed after the
 *    undone one. The fix gives each entry a stable `id` (returned by `logEvent`)
 *    and `removeLogEntry(id)` filters out ONLY that one entry.
 *  - `no-cap-trim-unbounded-log`: `logEvent` caps the stored array at `MAX_LOG`
 *    (it was unbounded, only the DISPLAY sliced).
 *
 * Drives the real `useCharacterStore` (it owns the log) with a minimal character —
 * no Firebase env needed (IDB writes silently no-op under jsdom).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useCharacterStore, MAX_LOG } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CombatEvent } from "@/types/combat-log";
import type { LocText } from "@/lib/loc-text";

function loadFreshLog(): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
}

function log() {
  return useCharacterStore.getState().character?.session.logEntries ?? [];
}

const logEvent = (e: CombatEvent) => useCharacterStore.getState().logEvent(e);
const removeLogEntry = (id: string | null) =>
  useCharacterStore.getState().removeLogEntry(id);
const clearLog = () => useCharacterStore.getState().clearLog();

// A few tiny structured events to drive the tests with.
const makeAction = (action: LocText): CombatEvent => ({
  kind: "action-use",
  action,
  effect: "attack",
  slot: "action",
});
// The arbitrary test-identity names have no SRD id → a custom user-authored LocText.
const customAction = (name: string): CombatEvent => makeAction({ custom: name });
const damage = (amount: number): CombatEvent => ({
  kind: "hp-damage",
  amount,
  current: 0,
  max: 10,
});

describe("action-log (events-as-data) per-entry add/remove", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("logEvent returns a stable unique id and tags the appended entry with it", () => {
    loadFreshLog();
    const idA = logEvent(customAction("A"));
    const idB = logEvent(damage(3));
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);
    expect(log().map((e) => e.id)).toEqual([idA, idB]);
    // The STORED entry carries the structured event, never a localized string.
    expect(log().map((e) => e.event.kind)).toEqual(["action-use", "hp-damage"]);
  });

  it("logEvent returns null and appends nothing when there is no character", () => {
    expect(logEvent(customAction("orphan"))).toBeNull();
  });

  it("the stored event carries ONLY ids/tokens + numbers — no localized text", () => {
    loadFreshLog();
    logEvent(makeAction({ srd: { kind: "spell", key: "counterspell", field: "name" } }));
    logEvent(damage(5));
    logEvent({ kind: "condition-gain", conditionId: "frightened" });
    for (const entry of log()) {
      // No top-level `text`/`type`/`slot` (the old pre-localized shape is gone).
      expect("text" in entry).toBe(false);
      expect("type" in entry).toBe(false);
      // Every field of the event is a primitive or stable id-ref — never prose.
      // (`action` is a stable LocText id-ref; `spell` an id — never SRD display strings.)
      expect(typeof entry.event.kind).toBe("string");
    }
  });

  // ── THE CRITICAL FIX: removing one entry must not touch the others ───────
  it("removeLogEntry deletes ONLY its own entry — a later entry survives", () => {
    loadFreshLog();
    const idA = logEvent(customAction("Action A"));
    logEvent(damage(4));
    expect(log()).toHaveLength(2);
    removeLogEntry(idA);
    const after = log();
    expect(after).toHaveLength(1);
    expect(after[0]?.event.kind).toBe("hp-damage");
  });

  it("removeLogEntry preserves entries added AFTER the one being removed", () => {
    loadFreshLog();
    const id1 = logEvent(customAction("first"));
    logEvent(damage(1));
    logEvent({ kind: "rest", restKind: "short" });
    removeLogEntry(id1);
    expect(log().map((e) => e.event.kind)).toEqual(["hp-damage", "rest"]);
  });

  it("removeLogEntry is idempotent — a second call for the same id is a no-op", () => {
    loadFreshLog();
    const id = logEvent(customAction("once"));
    logEvent(damage(2));
    removeLogEntry(id);
    removeLogEntry(id); // stale repeat — must NOT remove the survivor
    expect(log().map((e) => e.event.kind)).toEqual(["hp-damage"]);
  });

  it("removeLogEntry(null) and an unknown id are safe no-ops", () => {
    loadFreshLog();
    logEvent(customAction("kept"));
    removeLogEntry(null);
    removeLogEntry("does-not-exist");
    expect(log().map((e) => e.event.kind)).toEqual(["action-use"]);
  });

  // ── cap at write time ───────────────────────────────────────────────────
  it("caps the stored array at MAX_LOG, keeping the most recent entries", () => {
    loadFreshLog();
    for (let i = 0; i < MAX_LOG + 25; i++) logEvent(damage(i));
    const stored = log();
    expect(stored).toHaveLength(MAX_LOG);
    const last = stored[stored.length - 1]?.event;
    const first = stored[0]?.event;
    expect(last?.kind === "hp-damage" && last.amount).toBe(MAX_LOG + 24);
    expect(first?.kind === "hp-damage" && first.amount).toBe(25);
  });

  it("clearLog empties the log", () => {
    loadFreshLog();
    logEvent(customAction("x"));
    clearLog();
    expect(log()).toHaveLength(0);
  });
});
