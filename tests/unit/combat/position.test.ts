import { describe, expect, it } from "vitest";
import {
  areaMembership,
  distanceFt,
  isAdjacent,
  rangeBand,
  type AreaShape,
} from "@/lib/combat/position";

describe("distanceFt — Chebyshev (chessboard) × 5 ft/cell", () => {
  it("orthogonal steps cost 5 ft each", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(15);
  });
  it("a diagonal step costs the same as an orthogonal one (2024 default)", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(15);
  });
  it("the larger axis wins when the steps differ", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 2, y: 5 })).toBe(25);
  });
  it("the same cell is zero distance", () => {
    expect(distanceFt({ x: 4, y: 4 }, { x: 4, y: 4 })).toBe(0);
  });
});

describe("isAdjacent", () => {
  it("is true within 5 ft (the default reach)", () => {
    expect(isAdjacent({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });
  it("is false beyond reach", () => {
    expect(isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });
  it("accepts a longer reach for reach weapons", () => {
    expect(isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 }, 10)).toBe(true);
  });
});

describe("rangeBand", () => {
  it("bands the four thresholds", () => {
    expect(rangeBand(0)).toBe("reach");
    expect(rangeBand(5)).toBe("reach");
    expect(rangeBand(6)).toBe("near");
    expect(rangeBand(30)).toBe("near");
    expect(rangeBand(31)).toBe("far");
    expect(rangeBand(120)).toBe("far");
    expect(rangeBand(121)).toBe("out");
  });
});

describe("areaMembership", () => {
  const at = (id: string, x: number, y: number) => ({ id, position: { x, y } });

  it("sphere/cylinder: within radius of the origin", () => {
    const shape: AreaShape = { kind: "sphere", origin: { x: 0, y: 0 }, radiusFt: 20 };
    // a: 0 ft, b: 4*5=20 ft (boundary, included), c: 5*5=25 ft (excluded), d: 6*5=30 ft (excluded)
    const candidates = [at("a", 0, 0), at("b", 4, 0), at("c", 5, 0), at("d", 0, 6)];
    expect(areaMembership(shape, candidates)).toEqual(["a", "b"]);
  });

  it("cylinder behaves identically to sphere in the 2D footprint", () => {
    const shape: AreaShape = { kind: "cylinder", origin: { x: 0, y: 0 }, radiusFt: 10 };
    expect(areaMembership(shape, [at("in", 2, 0), at("out", 3, 0)])).toEqual(["in"]);
  });

  it("cube: an axis-aligned square from the origin corner", () => {
    const shape: AreaShape = { kind: "cube", origin: { x: 0, y: 0 }, sizeFt: 15 };
    const candidates = [
      at("in", 2, 2),
      at("edge", 3, 0),
      at("out", 4, 0),
      at("behind", -1, 0),
    ];
    expect(areaMembership(shape, candidates)).toEqual(["in", "edge"]);
  });

  it("cone: within length and within 45° of the aim direction", () => {
    const shape: AreaShape = {
      kind: "cone",
      origin: { x: 0, y: 0 },
      aim: { x: 4, y: 0 },
      lengthFt: 30,
    };
    const candidates = [
      at("ahead", 3, 0),
      at("edge", 3, 3),
      at("wide", 1, 3),
      at("behind", -2, 0),
      at("apex", 0, 0),
    ];
    expect(areaMembership(shape, candidates)).toEqual(["ahead", "edge", "apex"]);
  });

  it("line: within length along the aim and within half-width across it", () => {
    const shape: AreaShape = {
      kind: "line",
      origin: { x: 0, y: 0 },
      aim: { x: 6, y: 0 },
      lengthFt: 30,
      widthFt: 10,
    };
    // in: across=0 ft, edge: across=5 ft (== widthFt/2, boundary, included), wide: across=10 ft
    // (excluded), far: along=40 ft (beyond lengthFt, excluded)
    const candidates = [
      at("in", 3, 0),
      at("edge", 3, 1),
      at("wide", 3, 2),
      at("far", 8, 0),
    ];
    expect(areaMembership(shape, candidates)).toEqual(["in", "edge"]);
  });

  it("candidates with no position never match", () => {
    const shape: AreaShape = { kind: "sphere", origin: { x: 0, y: 0 }, radiusFt: 100 };
    expect(areaMembership(shape, [{ id: "ghost", position: null }])).toEqual([]);
  });
});
