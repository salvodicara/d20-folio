/**
 * The new sheet's markup after the design reset «BG3 craft» (slice 7):
 * - «Danni» and «Cura» are an equal pair in the markup (danger + heal), never a lit
 *   primary, on the header, on the phone strip and in «Danni e cure»;
 * - during a fight the rests leave the header (resting is out of combat in D&D Beyond and
 *   Foundry, and BG3 closes its camp; a dead button never holds a prime spot), and
 *   come back after it;
 * - the headings never skip a level, on a laptop and on a phone.
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
import { useCombatStore } from "@/stores/combatStore";
import { makeCharacterDoc } from "./_helpers";

class FakeObserver {
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

const band = () => screen.getByRole("region", { name: "Brann" });
const kind = (el: HTMLElement) => el.getAttribute("data-kind");

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  useCharacterStore.getState().setCharacter(doc);
  useCharacterStore.setState({ readonly: false, error: null } as never);
  useCombatStore.setState({ fightStarted: false, round: 1 } as never);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.matchMedia = realMatchMedia;
  useCombatStore.setState({ fightStarted: false, round: 1 } as never);
});

describe("«Danni» and «Cura» are an equal pair in the markup", () => {
  it("the header's pair is danger and heal", () => {
    asPhone(false);
    renderSheet();
    expect(kind(within(band()).getByRole("button", { name: "Damage" }))).toBe("danger");
    expect(kind(within(band()).getByRole("button", { name: "Heal" }))).toBe("heal");
  });

  it.each(["Damage", "Heal"])(
    "«Danni e cure» opened from «%s» keeps the same pair, neither lit",
    (opener) => {
      asPhone(false);
      renderSheet();
      fireEvent.click(within(band()).getByRole("button", { name: opener }));
      const pane = screen.getByRole("dialog", { name: "Damage and healing" });
      const kinds = ["Damage", "Heal"].map((n) =>
        kind(within(pane).getByRole("button", { name: n }))
      );
      expect(kinds).toEqual(["danger", "heal"]);
    }
  );
});

/** A fight of the character's own starts (the sheet is already open). */
const startFight = () =>
  act(() => {
    useCombatStore.setState({ fightStarted: true } as never);
  });

describe("the rests during a fight", () => {
  it.each([false, true])("sit in the header out of a fight (phone: %s)", (phone) => {
    asPhone(phone);
    renderSheet();
    expect(within(band()).getByRole("button", { name: "Short rest" })).toBeTruthy();
    expect(within(band()).getByRole("button", { name: "Long rest" })).toBeTruthy();
  });

  it.each([false, true])("leave the header during a fight (phone: %s)", (phone) => {
    asPhone(phone);
    renderSheet();
    startFight();
    expect(within(band()).queryByRole("button", { name: "Short rest" })).toBeNull();
    expect(within(band()).queryByRole("button", { name: "Long rest" })).toBeNull();
    expect(within(band()).queryByRole("button", { name: "Level up" })).toBeNull();
    // the row they leave is never drawn empty
    const row = band().querySelector(".f-char-acts");
    expect(row === null || row.children.length > 0).toBe(true);
  });

  it("come back when the fight ends", () => {
    asPhone(false);
    renderSheet();
    startFight();
    expect(within(band()).queryByRole("button", { name: "Short rest" })).toBeNull();
    act(() => {
      useCombatStore.setState({ fightStarted: false, round: 1 } as never);
    });
    expect(within(band()).getByRole("button", { name: "Short rest" })).toBeTruthy();
  });
});

describe("the sheet's headings never skip a level", () => {
  /** The headings under `root`, in document order, as «h2 Title». */
  const outline = (root: ParentNode) =>
    [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
      (h) => `${h.tagName.toLowerCase()} ${h.textContent.trim().slice(0, 24)}`
    );
  const level = (line: string) => Number(line[1]);
  const skips = (lines: string[], from: number) =>
    lines.filter((h, i) => level(h) > (i === 0 ? from : level(lines[i - 1] ?? "h9")) + 1);

  beforeEach(() => {
    // one line in the sheet's own log, so «Resoconto» shows its blocks
    useCharacterStore.getState().setCharacter({
      ...doc,
      session: {
        ...doc.session,
        logEntries: [
          {
            id: "l1",
            ts: Date.now(),
            event: { kind: "hp-damage", amount: 8, current: 9, max: 17 },
          },
        ],
      },
    } as never);
  });

  it.each([false, true])("from the name down (phone: %s)", (phone) => {
    asPhone(phone);
    renderSheet();
    const all = outline(document);
    expect(all[0]).toBe("h1 Brann");
    expect(skips(all, 0)).toEqual([]);
  });

  // The phone shows one panel at a time (the others are hidden by the stylesheet), so
  // each panel must read on its own: it opens on an h2 and steps down one level at a time.
  it.each([false, true])("inside every panel (phone: %s)", (phone) => {
    asPhone(phone);
    renderSheet();
    const panels = [...document.querySelectorAll("main section.f-pn")];
    expect(panels.length).toBeGreaterThan(2);
    const bad = panels.flatMap((panel) => {
      const lines = outline(panel);
      return lines.length === 0 || lines[0]?.startsWith("h2")
        ? skips(lines, 1)
        : [`opens on ${String(lines[0])}`];
    });
    expect(bad).toEqual([]);
    expect(screen.getByRole("heading", { level: 2, name: "Report" })).toBeTruthy();
  });
});
