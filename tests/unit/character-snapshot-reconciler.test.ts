import { describe, expect, it } from "vitest";
import { createCharacterSnapshotReconciler } from "@/lib/character-snapshot-reconciler";

type Parent = { name: string; equipment: string[] };
type Child = { focus: number };
const server = { hasPendingWrites: false };
const local = { hasPendingWrites: true };

describe("character snapshot reconciler", () => {
  it("publishes the remote pair in either arrival order", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveChild({ focus: 3 }, server);
    expect(r.current().parent).toBeUndefined();
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    expect(r.current()).toMatchObject({
      parent: { name: "Bo" },
      child: { focus: 3 },
      parentPending: false,
    });
  });

  it("a dirty parent keeps its local payload while the child snapshot interleaves", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    r.markParentPending({ name: "Bo", equipment: ["Bo's shoes"] });
    r.receiveChild({ focus: 2 }, server);
    expect(r.current().parent).toEqual({ name: "Bo", equipment: ["Bo's shoes"] });
    expect(r.current().parentPending).toBe(true);
  });

  it("a local echo never clears a pending write; a matching server snapshot acknowledges it", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    const pending = { name: "Bo", equipment: ["Bo's shoes"] };
    r.markParentPending(pending);
    r.receiveParent({ name: "Bo", equipment: ["Bo's shoes"] }, local);
    expect(r.current().parentPending).toBe(true);
    r.receiveParent({ name: "Bo", equipment: ["Bo's shoes"] }, server);
    expect(r.current()).toMatchObject({
      parentPending: false,
      parentConflict: false,
      parent: pending,
    });
  });

  it("a differing server snapshot marks a conflict but the local payload still shows until rejected", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    const pending = { name: "Bo", equipment: ["Bo's shoes"] };
    r.markParentPending(pending);
    r.receiveParent({ name: "Bo", equipment: ["other device"] }, server);
    expect(r.current()).toMatchObject({ parentConflict: true, parent: pending });
    r.rejectParentWrite(pending);
    expect(r.current()).toMatchObject({
      parentPending: false,
      parentConflict: false,
      parent: { equipment: ["other device"] },
    });
  });

  it("acknowledging or rejecting a superseded payload is a no-op for the newer pending one", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    const first = { name: "Bo", equipment: ["a"] };
    const second = { name: "Bo", equipment: ["a", "b"] };
    r.markParentPending(first);
    r.markParentPending(second);
    r.acknowledgeParentWrite(first);
    r.rejectParentWrite(first);
    expect(r.current()).toMatchObject({ parentPending: true, parent: second });
  });

  it("the child domain is symmetric and reset clears both", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveChild({ focus: 3 }, server);
    r.markChildPending({ focus: 2 });
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    expect(r.current().child).toEqual({ focus: 2 });
    r.acknowledgeChildWrite({ focus: 2 });
    expect(r.current().childPending).toBe(false);
    r.reset();
    expect(r.current()).toEqual({
      parent: undefined,
      child: undefined,
      parentPending: false,
      childPending: false,
      parentConflict: false,
      childConflict: false,
    });
  });
});
