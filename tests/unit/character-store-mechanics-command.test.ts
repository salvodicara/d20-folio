import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  planMechanicsRevert,
  prepareMechanicsCommand,
  type MechanicsCommand,
} from "@/lib/mechanics-command";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

function fixture() {
  return makeCharacterDoc(
    {
      classId: "sorcerer",
      level: 5,
      features: [{ srdId: "sorcerer-font-of-magic" }],
      spellSlots: [{ level: 2, total: 3 }],
    },
    { spellSlots: { "2": { used: 1 } } }
  );
}

function planned(doc = fixture()) {
  const command: MechanicsCommand = {
    kind: "resource-conversion",
    occurrenceId: "store-conversion-1",
    characterId: doc.id,
    sourceId: "sorcerer-font-of-magic",
    conversionId: "font-creating-spell-slots",
    selection: { kind: "create-slot", via: "cost-table", slotLevel: 2 },
  };
  const result = prepareMechanicsCommand(doc, command);
  if (result.status !== "planned") throw new Error(result.reason);
  return result.plan;
}

beforeEach(() => {
  useCharacterStore.getState().setCharacter(fixture());
  useCharacterStore.getState().setParentPersistenceFlush(null);
});

afterEach(() => {
  useCharacterStore.getState().setParentPersistenceFlush(null);
  vi.restoreAllMocks();
});

describe("characterStore.applyMechanicsPlan", () => {
  it("commits every leg in one notification and one persistence flush", async () => {
    const flush = vi.fn();
    useCharacterStore.getState().setParentPersistenceFlush(flush);
    const notifications = vi.fn();
    const unsubscribe = useCharacterStore.subscribe(notifications);

    const result = useCharacterStore.getState().applyMechanicsPlan(planned());
    expect(result.status).toBe("applied");
    expect(notifications).toHaveBeenCalledTimes(1);
    expect(
      useCharacterStore.getState().character?.session.trackers["sorcerer-font-of-magic"]
        ?.used
    ).toBe(3);
    expect(
      useCharacterStore.getState().character?.session.spellSlots["2"]
    ).toBeUndefined();
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("rejects a stale plan without partial state, notification, or flush", async () => {
    const plan = planned();
    const live = fixture();
    live.session.trackers["sorcerer-font-of-magic"] = { used: 1 };
    useCharacterStore.getState().setCharacter(live);
    const flush = vi.fn();
    useCharacterStore.getState().setParentPersistenceFlush(flush);
    const notifications = vi.fn();
    const unsubscribe = useCharacterStore.subscribe(notifications);

    expect(useCharacterStore.getState().applyMechanicsPlan(plan)).toMatchObject({
      status: "rejected",
      reason: "stale-plan",
    });
    expect(notifications).not.toHaveBeenCalled();
    expect(useCharacterStore.getState().character).toBe(live);
    await Promise.resolve();
    expect(flush).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("is idempotent by CAS and reverses only the exact receipt", () => {
    const plan = planned();
    const first = useCharacterStore.getState().applyMechanicsPlan(plan);
    expect(first.status).toBe("applied");
    expect(useCharacterStore.getState().applyMechanicsPlan(plan)).toMatchObject({
      status: "rejected",
      reason: "stale-plan",
    });
    if (first.status !== "applied") return;
    const reversed = useCharacterStore
      .getState()
      .applyMechanicsPlan(planMechanicsRevert(first.receipt));
    expect(reversed.status).toBe("applied");
    expect(useCharacterStore.getState().character?.session.spellSlots["2"]?.used).toBe(1);
    expect(
      useCharacterStore.getState().character?.session.trackers["sorcerer-font-of-magic"]
    ).toBeUndefined();
  });

  it("rejects readonly, missing-character, and mismatched-character plans", () => {
    const plan = planned();
    useCharacterStore.setState({ readonly: true });
    expect(useCharacterStore.getState().applyMechanicsPlan(plan)).toMatchObject({
      status: "rejected",
      reason: "readonly",
    });
    useCharacterStore.setState({ readonly: false, character: null });
    expect(useCharacterStore.getState().applyMechanicsPlan(plan)).toMatchObject({
      status: "rejected",
      reason: "character-missing",
    });
    const other = fixture();
    other.id = "other";
    useCharacterStore.getState().setCharacter(other);
    expect(useCharacterStore.getState().applyMechanicsPlan(plan)).toMatchObject({
      status: "rejected",
      reason: "character-mismatch",
    });
  });

  it("keeps a failed reverse retryable after an intervening resource edit", () => {
    const first = useCharacterStore.getState().applyMechanicsPlan(planned());
    expect(first.status).toBe("applied");
    if (first.status !== "applied") return;
    useCharacterStore.getState().useTracker("sorcerer-font-of-magic", 1);
    expect(
      useCharacterStore.getState().applyMechanicsPlan(planMechanicsRevert(first.receipt))
    ).toMatchObject({ status: "rejected", reason: "stale-plan" });
    expect(
      useCharacterStore.getState().character?.session.trackers["sorcerer-font-of-magic"]
        ?.used
    ).toBe(4);
  });
});
