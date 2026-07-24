/**
 * MonsterStatBlockCard render guards.
 *
 * The card is the bestiary's shared read surface; these pin the two rendering
 * traps a pure view-model test (compendium-spec-srd-coverage) can't see because
 * it never mounts the card:
 *   1. A no-defenses beast must NOT leak a bare numeric "0" ledger row — the
 *      `{ (a?.length || b.length) && <Line/> }` footgun (0 is a valid React child).
 *   2. The 2024 merged Immunities line renders damage runs + condition CHIPS.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ensureSrdKind } from "@/i18n";
import { getMonster } from "@/data/monsters";
import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";

// The monster catalogue is a LAZY SRD kind — load it (for every registered locale)
// before rendering, exactly as the compendium route factory / palette effect do at
// runtime (the load-before-render gate).
await ensureSrdKind("monster");

describe("MonsterStatBlockCard", () => {
  it("a beast with no vuln/resist/immunities renders no stray '0' ledger node", () => {
    const bear = getMonster("brown-bear");
    if (!bear) throw new Error("pilot monster 'brown-bear' missing");
    const { container } = render(<MonsterStatBlockCard monster={bear} locale="en" />);
    const ref = container.querySelector(".mon-ref");
    if (!ref) throw new Error("statblock plaque did not render");
    // The defence guards used `?.length || …` (a number), and React renders 0 as
    // text. Assert no direct "0" text child leaked between the ledger lines.
    const strayZero = Array.from(ref.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === "0"
    );
    expect(strayZero, "a bare '0' leaked into the statblock ledger").toBe(false);
    // Sanity: the statblock actually painted.
    expect(container.querySelector(".mon-abilities")).toBeTruthy();
  });

  it("merges damage + condition immunities into one chipped line (swarm)", () => {
    const swarm = getMonster("swarm-of-rats");
    if (!swarm) throw new Error("pilot monster 'swarm-of-rats' missing");
    const { container } = render(<MonsterStatBlockCard monster={swarm} locale="en" />);
    // The swarm has condition immunities but no damage immunities — the merged
    // Immunities line must still render its condition chips.
    expect(container.querySelectorAll(".co-chip").length).toBeGreaterThan(0);
  });

  it("renders a GM-variable resistance note line verbatim, no leading comma (half-dragon)", () => {
    const hd = getMonster("half-dragon");
    if (!hd) throw new Error("pilot monster 'half-dragon' missing");
    const { container } = render(<MonsterStatBlockCard monster={hd} locale="en" />);
    // The half-dragon prints a Resistances LINE whose type is a prose note (no
    // closed-set DamageType). It must render the sentence, without a stray comma
    // (nothing precedes it — no flat damageResistances).
    const line = Array.from(container.querySelectorAll(".mon-line")).find((el) =>
      el.textContent.includes("Draconic Origin")
    );
    if (!line) throw new Error("resistance note line did not render");
    expect(line.textContent).toContain(
      "Damage type chosen for the Draconic Origin trait"
    );
    expect(line.textContent).not.toMatch(/Resistances\s*,/);
  });

  it("renders the one-way-telepathy affix beside the distance (otyugh)", () => {
    const otyugh = getMonster("otyugh");
    if (!otyugh) throw new Error("pilot monster 'otyugh' missing");
    const { container } = render(<MonsterStatBlockCard monster={otyugh} locale="en" />);
    const line = Array.from(container.querySelectorAll(".mon-line")).find((el) =>
      el.textContent.includes("Telepathy")
    );
    if (!line) throw new Error("languages line did not render");
    expect(line.textContent).toContain("Telepathy 120 ft");
    expect(line.textContent).toContain("(recipients can't respond telepathically)");
  });
});
