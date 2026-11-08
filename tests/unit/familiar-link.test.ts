/**
 * The familiar's link and where the familiar is (edge-case M19, «Planes and
 * extradimensional spaces»): a dismissed familiar waits in its pocket dimension, on no
 * plane, so the link to its owner does not reach it; otherwise it is beside its owner.
 * Engine-ready: the case stays pending until a creature's location can be set.
 */
import { describe, expect, it } from "vitest";

import {
  FAMILIAR_POCKET_DIMENSION,
  familiarLinkHolds,
  familiarLocation,
} from "@/lib/familiar";

const familiar = { monsterId: "owl", creatureType: "fey" as const };

describe("the familiar's place and its link", () => {
  it("no familiar, no place and no link", () => {
    expect(familiarLocation({})).toBeUndefined();
    expect(familiarLinkHolds({})).toBe(false);
  });

  it("beside its owner, on the owner's plane, the link holds", () => {
    const session = { familiar, location: { plane: "material" } };
    expect(familiarLocation(session)).toEqual({ plane: "material" });
    expect(familiarLinkHolds(session)).toBe(true);
  });

  it("an untagged owner and a present familiar: the link holds", () => {
    expect(familiarLinkHolds({ familiar })).toBe(true);
  });

  it("dismissed to its pocket dimension, the link does not reach it", () => {
    const session = { familiar: { ...familiar, dismissed: true as const } };
    expect(familiarLocation(session)).toEqual({ inside: FAMILIAR_POCKET_DIMENSION });
    expect(familiarLinkHolds(session)).toBe(false);
  });
});
