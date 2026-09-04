/**
 * MapCanvas render + interaction proofs (jsdom). What jsdom cannot show — pixels, motion — is
 * the screenshot gate's job; this file pins the semantics: who sees what, and which event a drop
 * emits. Pointer geometry is faked through `getBoundingClientRect`: the SVG is a 1,000 × 1,000
 * box and the viewport is fitted to it, so a cell's centre has a known screen position.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MapCanvas } from "@/features/play/map/MapCanvas";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState, MapBackground } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./combat/__helpers__/entities";
import {
  emptyState,
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./combat/__helpers__/state";
import { cellCenterPx, fitViewport, groundOf } from "@/features/play/map/geometry";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

const BACKGROUND: MapBackground = {
  path: "campaigns/c/maps/m.jpeg",
  url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
  width: 1000,
  height: 1000,
  cellPx: 100,
  origin: { x: 0, y: 0 },
  bytes: 1,
};

function run(state: FoldedState, actions: readonly Action[]): FoldedState {
  let current = state;
  for (const action of actions) {
    const result = resolve(current, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    current = result.state;
  }
  return current;
}

/** Hero (p1) at (1,1), the DM's goblin at (5,5), a hidden wolf at (8,8); fog covers all but
 *  the hero's corner. Turns running, hero first. */
function table(): FoldedState {
  const seq = seqFactory("dm");
  const hero = testEntity({
    id: "hero",
    kind: "pc",
    controllerUid: "p1",
    hp: 30,
    mechanics: ["core:move"],
    position: { x: 1, y: 1 },
  });
  const goblin = testEntity({
    id: "goblin",
    hp: 7,
    mechanics: ["core:move"],
    position: { x: 5, y: 5 },
  });
  const wolf = testEntity({ id: "wolf", hp: 11, position: { x: 8, y: 8 }, hidden: true });
  return run(emptyState(), [
    ...openingActions("dm", seq, [hero, goblin, wolf], { hero: 15, goblin: 5, wolf: 1 }, [
      "hero",
      "goblin",
      "wolf",
    ]),
    tableAction("dm", seq(), { op: "map", background: BACKGROUND }),
    tableAction("dm", seq(), { op: "fog", change: { kind: "cover", covered: true } }),
    tableAction("dm", seq(), {
      op: "fog",
      change: { kind: "reveal", rect: { x: 0, y: 0, w: 3, h: 3 } },
    }),
  ]);
}

const ground = groundOf(BACKGROUND);
const VIEW = fitViewport(ground, 1000, 1000); // scale 1, offset 0: screen px = image px

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  // jsdom has no pointer capture.
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
});

function mount(overrides: Partial<Parameters<typeof MapCanvas>[0]> = {}) {
  const handlers = {
    onMove: vi.fn(),
    onPlace: vi.fn(),
    onRefused: vi.fn(),
    onFog: vi.fn(),
    onSelect: vi.fn(),
  };
  const utils = render(
    <MapCanvas
      state={table()}
      actor={{ uid: "p1", dm: false }}
      tool="select"
      labelOf={(token) => token.id}
      {...handlers}
      {...overrides}
    />
  );
  return { ...utils, ...handlers };
}

function centreOf(cell: { x: number; y: number }) {
  const px = cellCenterPx(ground, cell);
  return {
    clientX: px.x * VIEW.scale + VIEW.offset.x,
    clientY: px.y * VIEW.scale + VIEW.offset.y,
  };
}

function dragToken(id: string, to: { x: number; y: number }) {
  const token = screen.getByTestId(`map-token-${id}`);
  const from = centreOf({ x: 1, y: 1 });
  fireEvent.pointerDown(token, { ...from, button: 0, pointerId: 1 });
  const svg = screen.getByRole("application");
  fireEvent.pointerMove(svg, { ...centreOf(to), pointerId: 1 });
  fireEvent.pointerUp(svg, { ...centreOf(to), pointerId: 1 });
}

describe("MapCanvas — who sees what", () => {
  it("a player sees their own token, not the hidden wolf nor the goblin under fog; the fog is drawn", () => {
    mount();
    expect(screen.getByTestId("map-token-hero")).toBeTruthy();
    expect(screen.queryByTestId("map-token-goblin")).toBeNull();
    expect(screen.queryByTestId("map-token-wolf")).toBeNull();
    expect(screen.getByTestId("map-fog")).toBeTruthy();
  });

  it("the DM sees every token, the hidden wolf dashed, and the fog dimmed", () => {
    mount({ actor: { uid: "dm", dm: true } });
    expect(screen.getByTestId("map-token-goblin")).toBeTruthy();
    expect(screen.getByTestId("map-token-wolf").getAttribute("data-hidden")).toBe("true");
    expect(screen.getByTestId("map-fog").getAttribute("opacity")).toBe("0.6");
  });

  it("the DM's player view renders what a spectator sees", () => {
    mount({ actor: { uid: "dm", dm: true }, playerView: true });
    expect(screen.queryByTestId("map-token-wolf")).toBeNull();
    expect(screen.queryByTestId("map-token-goblin")).toBeNull();
    expect(screen.getByTestId("map-fog").getAttribute("opacity")).toBe("1");
  });
});

describe("MapCanvas — what a drop emits", () => {
  it("the controller dragging within the budget on their turn emits a move", () => {
    const { onMove, onPlace } = mount();
    dragToken("hero", { x: 4, y: 1 });
    expect(onMove).toHaveBeenCalledWith("hero", { x: 4, y: 1 });
    expect(onPlace).not.toHaveBeenCalled();
  });

  it("the controller dragging beyond the budget is refused and nothing is emitted", () => {
    const { onMove, onPlace, onRefused } = mount();
    dragToken("hero", { x: 9, y: 1 });
    expect(onMove).not.toHaveBeenCalled();
    expect(onPlace).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledWith("hero", "movement");
  });

  it("the DM dragging a player's token emits a placement", () => {
    const { onMove, onPlace } = mount({ actor: { uid: "dm", dm: true } });
    dragToken("hero", { x: 9, y: 1 });
    expect(onPlace).toHaveBeenCalledWith("hero", { x: 9, y: 1 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("the ruler appears while dragging, toned by the budget", () => {
    mount();
    const token = screen.getByTestId("map-token-hero");
    fireEvent.pointerDown(token, {
      ...centreOf({ x: 1, y: 1 }),
      button: 0,
      pointerId: 1,
    });
    const svg = screen.getByRole("application");
    fireEvent.pointerMove(svg, { ...centreOf({ x: 4, y: 1 }), pointerId: 1 });
    expect(screen.getByTestId("map-ruler").getAttribute("data-tone")).toBe("ok");
    fireEvent.pointerMove(svg, { ...centreOf({ x: 9, y: 1 }), pointerId: 1 });
    expect(screen.getByTestId("map-ruler").getAttribute("data-tone")).toBe("dash");
    fireEvent.pointerUp(svg, { ...centreOf({ x: 9, y: 1 }), pointerId: 1 });
    expect(screen.queryByTestId("map-ruler")).toBeNull();
  });
});

describe("MapCanvas — fog rectangles and hidden tokens (DM)", () => {
  it("the fog tool draws a rectangle of cells and emits reveal or hide", () => {
    const { onFog } = mount({ actor: { uid: "dm", dm: true }, tool: "fog-reveal" });
    const svg = screen.getByRole("application");
    fireEvent.pointerDown(svg, { ...centreOf({ x: 6, y: 6 }), button: 0, pointerId: 2 });
    fireEvent.pointerMove(svg, { ...centreOf({ x: 8, y: 7 }), pointerId: 2 });
    expect(screen.getByTestId("map-fog-preview")).toBeTruthy();
    fireEvent.pointerUp(svg, { ...centreOf({ x: 8, y: 7 }), pointerId: 2 });
    expect(onFog).toHaveBeenCalledWith({
      kind: "reveal",
      rect: { x: 6, y: 6, w: 3, h: 2 },
    });
  });

  it("a player cannot draw fog even with the tool set", () => {
    const { onFog } = mount({ tool: "fog-hide" });
    const svg = screen.getByRole("application");
    fireEvent.pointerDown(svg, { ...centreOf({ x: 6, y: 6 }), button: 0, pointerId: 2 });
    fireEvent.pointerUp(svg, { ...centreOf({ x: 8, y: 7 }), pointerId: 2 });
    expect(onFog).not.toHaveBeenCalled();
  });

  // Stage 6 moved everything the DM does TO a selected token into the play screen's token
  // pill (rule 34); the canvas only reports the selection.
  it("selecting a token reports it to the host", () => {
    const { onSelect } = mount({ actor: { uid: "dm", dm: true } });
    const wolf = screen.getByTestId("map-token-wolf");
    fireEvent.pointerDown(wolf, { ...centreOf({ x: 8, y: 8 }), button: 0, pointerId: 3 });
    const svg = screen.getByRole("application");
    fireEvent.pointerUp(svg, { ...centreOf({ x: 8, y: 8 }), pointerId: 3 });
    expect(onSelect).toHaveBeenCalledWith("wolf");
  });

  it("the ruler tool measures across the ground without moving anything", () => {
    const { onMove, onPlace } = mount({ tool: "ruler" });
    const svg = screen.getByRole("application");
    fireEvent.pointerDown(svg, { ...centreOf({ x: 2, y: 2 }), button: 0, pointerId: 9 });
    fireEvent.pointerMove(svg, { ...centreOf({ x: 6, y: 2 }), pointerId: 9 });
    expect(screen.getByTestId("map-ruler")).toBeTruthy();
    fireEvent.pointerUp(svg, { ...centreOf({ x: 6, y: 2 }), pointerId: 9 });
    expect(screen.queryByTestId("map-ruler")).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
    expect(onPlace).not.toHaveBeenCalled();
  });
});

it("stage-5 harness note: this suite runs in the slow lane (jsdom) — see tests/lanes.ts", () => {
  expect(nextActionId("n")).toMatch(/^n-/);
});
