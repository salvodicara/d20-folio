/**
 * ActionRiders — the shared on-hit rider strip component (#87 rider-render).
 *
 * Thin render coverage for the WIRING (the strip reflects its VM): a display-only
 * rider renders a static info token, a consumable rider with `onSpend` renders a
 * tappable SPEND button that calls the handler with the rider, a depleted
 * consumable falls back to the info token (read-only), and an empty list renders
 * nothing. The pure token-composition facts are pinned in `rider-view.test.ts`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@/i18n";
import { ActionRiders, RiderSummary } from "@/components/shared/ActionRiders";
import type { RiderVM } from "@/lib/views/rider-view";

const display: RiderVM = {
  id: "damage:0",
  kind: "damage",
  source: "Frenzy",
  sourceLoc: { lit: { en: "Frenzy", it: "Frenzy" } },
  oncePerTurn: true,
  spend: null,
  dice: "2d6",
  damageTypeId: "slashing",
};

const consumable: RiderVM = {
  id: "damage:1",
  kind: "damage",
  source: "Psionic Strike",
  sourceLoc: { lit: { en: "Psionic Strike", it: "Psionic Strike" } },
  oncePerTurn: true,
  spend: { kind: "tracker", trackerId: "fighter-psi-warrior-psionic-power" },
  dice: "1d8+3",
  damageTypeId: "force",
};

describe("ActionRiders", () => {
  it("renders nothing for an empty rider list", () => {
    const { container } = render(<ActionRiders riders={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a display-only rider as a static token (no spend handler given)", () => {
    render(<ActionRiders riders={[display]} />);
    // The chip shows the evaluated dice (the damage word resolves via i18n).
    expect(screen.getByText(/\+2d6/)).toBeInTheDocument();
    // No spend cue — it's an info token, not a spend button.
    expect(screen.queryByText(/^Spend$/i)).not.toBeInTheDocument();
  });

  it("renders a consumable rider as a SPEND button that calls onSpend with the rider", () => {
    const onSpend = vi.fn();
    render(<ActionRiders riders={[consumable]} onSpend={onSpend} />);
    const cue = screen.getByText(/^Spend$/i);
    expect(cue).toBeInTheDocument();
    fireEvent.click(cue);
    expect(onSpend).toHaveBeenCalledTimes(1);
    expect(onSpend).toHaveBeenCalledWith(consumable);
  });

  it("a depleted consumable falls back to the read-only info token (no spend)", () => {
    const onSpend = vi.fn();
    render(
      <ActionRiders
        riders={[consumable]}
        onSpend={onSpend}
        depletedTrackers={new Set(["fighter-psi-warrior-psionic-power"])}
      />
    );
    // The chip still shows (the player sees the rider exists)…
    expect(screen.getByText(/\+1d8\+3/)).toBeInTheDocument();
    // …but there is no spend cue — it can't be spent.
    expect(screen.queryByText(/^Spend$/i)).not.toBeInTheDocument();
  });

  it("with no onSpend, even a consumable rider is read-only (the inventory surface)", () => {
    render(<ActionRiders riders={[consumable]} />);
    expect(screen.queryByText(/^Spend$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/\+1d8\+3/)).toBeInTheDocument();
  });

  it("labels a marked-target rider (Hunter's Mark) 'vs marked target' on the chip", () => {
    const marked: RiderVM = {
      id: "damage:hm",
      kind: "damage",
      source: "Hunter's Mark",
      sourceLoc: { lit: { en: "Hunter's Mark", it: "Segno del Cacciatore" } },
      oncePerTurn: false,
      spend: null,
      dice: "1d6",
      damageTypeId: "force",
      vsMarkedTarget: "marked",
      whileActive: true,
    };
    render(<ActionRiders riders={[marked]} />);
    // The chip reads as conditional on hitting the MARKED creature (never every
    // attack) — the label the marked-target model adds atop the +1d6 Force chip.
    expect(screen.getByText(/\+1d6 Force vs marked target/)).toBeInTheDocument();
  });

  it("labels a cursed-target rider (Hex) 'vs cursed target' on the chip", () => {
    const cursed: RiderVM = {
      id: "damage:hex",
      kind: "damage",
      source: "Hex",
      sourceLoc: { lit: { en: "Hex", it: "Sortilegio" } },
      oncePerTurn: false,
      spend: null,
      dice: "1d6",
      damageTypeId: "necrotic",
      vsMarkedTarget: "cursed",
      whileActive: true,
    };
    render(<ActionRiders riders={[cursed]} />);
    expect(screen.getByText(/\+1d6 Necrotic vs cursed target/)).toBeInTheDocument();
  });
});

describe("RiderSummary — the always-visible collapsed-face damage cluster (#87)", () => {
  it("renders nothing when the action carries no rider", () => {
    const { container } = render(<RiderSummary riders={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ONE rider → the compact dice chip, chromatically keyed to its damage type", () => {
    const { container } = render(<RiderSummary riders={[display]} />);
    expect(screen.getByText("+2d6")).toBeInTheDocument();
    const pill = container.querySelector(".uc-rider-pill");
    expect(pill).not.toBeNull();
    // The chromatic outcome rides the SAME `.uc-verdict[data-o]` recipe the chip
    // uses (a slashing rider → the physical outcome), and it is NOT the overflow.
    expect(pill?.getAttribute("data-o")).toBe("physical");
    expect(pill?.hasAttribute("data-more")).toBe(false);
  });

  it("TWO riders → two dice chips, each its OWN hue — never an opaque count", () => {
    const second: RiderVM = {
      ...consumable,
      id: "damage:9",
      dice: "1d8",
      damageTypeId: "fire",
    };
    const { container } = render(<RiderSummary riders={[display, second]} />);
    // BOTH dice are shown (grouped damage cluster, not collapsed to a count).
    expect(screen.getByText("+2d6")).toBeInTheDocument();
    expect(screen.getByText("+1d8")).toBeInTheDocument();
    const pills = container.querySelectorAll(".uc-rider-pill");
    expect(pills.length).toBe(2);
    // Each chip carries its own damage hue (slashing→physical, fire→fire).
    expect(pills[0]?.getAttribute("data-o")).toBe("physical");
    expect(pills[1]?.getAttribute("data-o")).toBe("fire");
    expect(container.querySelector(".uc-rider-pill[data-more]")).toBeNull();
  });

  it("a CONDITIONAL vs-marked rider → the bare +die gets a crosshair MARKER + the full label in aria/title", () => {
    const marked: RiderVM = {
      id: "damage:hm",
      kind: "damage",
      source: "Hunter's Mark",
      sourceLoc: { lit: { en: "Hunter's Mark", it: "Segno del Cacciatore" } },
      oncePerTurn: false,
      spend: null,
      dice: "1d6",
      damageTypeId: "force",
      vsMarkedTarget: "marked",
      whileActive: true,
    };
    const { container } = render(<RiderSummary riders={[marked]} />);
    const pill = container.querySelector(".uc-rider-pill");
    // The chip still shows the bare dice (space stays tight)…
    expect(pill?.textContent).toContain("+1d6");
    // …but now carries the crosshair marker so it can't read as unconditional.
    expect(pill?.hasAttribute("data-cond")).toBe(true);
    expect(pill?.querySelector(".uc-rider-mark")).not.toBeNull();
    // The full "vs marked target" label stays available on the cluster aria/title.
    const cluster = container.querySelector(".uc-rider-cluster");
    expect(cluster?.getAttribute("aria-label")).toContain("vs marked target");
    expect(cluster?.getAttribute("title")).toContain("vs marked target");
  });

  it("an UNCONDITIONAL rider stays BARE — no crosshair marker, no data-cond", () => {
    const { container } = render(<RiderSummary riders={[display]} />);
    const pill = container.querySelector(".uc-rider-pill");
    expect(pill?.hasAttribute("data-cond")).toBe(false);
    expect(pill?.querySelector(".uc-rider-mark")).toBeNull();
  });

  it("MANY riders → 2 dice chips + ONE gold '+N more' overflow — bounded, never per-rider", () => {
    const eight: RiderVM[] = Array.from({ length: 8 }, (_, i) => ({
      ...display,
      id: `damage:${i}`,
    }));
    const { container } = render(<RiderSummary riders={eight} />);
    // Exactly 2 dice chips + 1 overflow = 3 chips (worst-case readability gate: no
    // clutter even at max density × IT × 390px). NOT eight separate dice tokens.
    const pills = container.querySelectorAll(".uc-rider-pill");
    expect(pills.length).toBe(3);
    // The overflow reads "+6 more" (8 − 2 shown) in the gold register — a stacked
    // glyph + "+N more" so it can never read as a flat damage bonus.
    expect(screen.getByText("+6 more")).toBeInTheDocument();
    const more = container.querySelector(".uc-rider-pill[data-more]");
    expect(more).not.toBeNull();
    expect(more?.querySelector(".uc-rider-stack")).not.toBeNull();
  });
});
