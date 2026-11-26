/**
 * The phone's slim strip (D&D Beyond's phone header strip): once the band has scrolled
 * up out of view, one row keeps the Hit Points, the Armor Class and «Danni» / «Cura» at
 * hand. The Hit Points open «Danni e cure»; a read-only sheet only shows the numbers.
 * The laptop has no strip (its band stays the header). The rests sit in the phone's
 * band, one tap away, no longer behind «Sezioni».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlaySheet } from "@/domains/play/ui/PlayScreen";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";
import { effectiveMaxHp } from "@/lib/aggregate-character";

let observed: ((entries: Partial<IntersectionObserverEntry>[]) => void)[] = [];
class FakeObserver {
  constructor(cb: (entries: Partial<IntersectionObserverEntry>[]) => void) {
    observed.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const realMatchMedia = window.matchMedia;
function asPhone(phone: boolean) {
  window.matchMedia = (query: string) => ({
    matches: phone && query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

const doc = makeCharacterDoc(
  { classId: "fighter", level: 3, name: "Brann" as never },
  { hp: { current: 17, temp: 0 } }
);

function renderSheet() {
  render(
    <MemoryRouter>
      <PlaySheet
        characterId={doc.id}
        campaign={null}
        back={{ to: "/characters", label: "Characters" }}
      />
    </MemoryRouter>
  );
}

/** The band scrolls up past the top of the screen. */
function scrollBandAway() {
  act(() => {
    for (const cb of observed)
      cb([{ isIntersecting: false, boundingClientRect: { bottom: -20 } as DOMRect }]);
  });
}

const STRIP = { name: "Hit points and AC" };

describe("the phone's Hit Points strip", () => {
  beforeEach(() => {
    observed = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.setState({ readonly: false, error: null } as never);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.matchMedia = realMatchMedia;
  });

  it("stays out of the way while the band is on screen", () => {
    asPhone(true);
    renderSheet();
    expect(screen.queryByRole("region", STRIP)).toBeNull();
  });

  it("shows the Hit Points and the AC once the band has scrolled away", () => {
    asPhone(true);
    renderSheet();
    scrollBandAway();
    const strip = screen.getByRole("region", STRIP);
    // #1334 — the max is derived at read (Fighter 3, CON 14: 28), not the fixture's stored 44.
    const max = String(effectiveMaxHp(doc.character, doc.session));
    expect(
      within(strip).getByRole("button", { name: `Hit points: 17 / ${max}` })
    ).toBeTruthy();
    expect(within(strip).getByRole("button", { name: /^AC \d+$/ })).toBeTruthy();
  });

  it("opens «Danni e cure» from its Hit Points, damage first", () => {
    asPhone(true);
    renderSheet();
    scrollBandAway();
    const strip = screen.getByRole("region", STRIP);
    fireEvent.click(within(strip).getByRole("button", { name: /^Hit points:/ }));
    const pane = screen.getByRole("dialog", { name: "Damage and healing" });
    expect(pane.getAttribute("data-c")).toBe("ini");
  });

  it("opens «Danni e cure» healing first from its «Cura»", () => {
    asPhone(true);
    renderSheet();
    scrollBandAway();
    const strip = screen.getByRole("region", STRIP);
    fireEvent.click(within(strip).getByRole("button", { name: "Heal" }));
    const pane = screen.getByRole("dialog", { name: "Damage and healing" });
    expect(pane.getAttribute("data-c")).toBe("cmp");
  });

  it("only shows the numbers on a read-only sheet", () => {
    useCharacterStore.setState({ readonly: true } as never);
    asPhone(true);
    renderSheet();
    scrollBandAway();
    const strip = screen.getByRole("region", STRIP);
    expect(within(strip).queryByRole("button", { name: /^Hit points:/ })).toBeNull();
    expect(within(strip).queryByRole("button", { name: "Damage" })).toBeNull();
    expect(within(strip).queryByRole("button", { name: "Heal" })).toBeNull();
    expect(strip.textContent).toContain("17");
  });

  it("is not on the laptop, where the band stays the header", () => {
    asPhone(false);
    renderSheet();
    scrollBandAway();
    expect(screen.queryByRole("region", STRIP)).toBeNull();
  });
});

describe("the phone's rests", () => {
  beforeEach(() => {
    observed = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.setState({ readonly: false, error: null } as never);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.matchMedia = realMatchMedia;
  });

  it("sit in the band once, not again behind «Sezioni»", () => {
    asPhone(true);
    renderSheet();
    const band = screen.getByRole("region", { name: "Brann" });
    expect(within(band).getByRole("button", { name: "Short rest" })).toBeTruthy();
    expect(within(band).getByRole("button", { name: "Long rest" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Short rest" })).toHaveLength(1);
  });
});
