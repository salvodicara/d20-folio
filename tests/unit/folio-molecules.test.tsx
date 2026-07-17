/**
 * Folio content-molecule tests (M4).
 *
 * RTL render + interaction + a11y assertions for the three highest-leverage
 * molecules: UniversalCard, StatCard, Tracker. Locks the load-bearing folio
 * specs — progressive disclosure (accordion `aria-expanded`), honest blanks
 * (omit at zero), the three card modes, the carved-base math disclosure, and
 * the pips-vs-pool tracker threshold + variable-cost spend popover.
 *
 * The coverage gate is logic-only (lib/data/stores), so these do not move the
 * threshold — they exist to lock the molecules' behaviour per CLAUDE rule 2.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  UniversalCard,
  UniversalCardFacts,
  UniversalCardDesc,
  UniversalCardFoot,
  StatCard,
  Tracker,
} from "@/components/shared/molecules";

// ─── UniversalCard ────────────────────────────────────────────────────────────

describe("UniversalCard", () => {
  it("renders the lemma, gloss, and ONE verdict chip when provided", () => {
    render(
      <UniversalCard
        kind="spell"
        spellLevel={1}
        name="Faerie Fire"
        slot="action"
        gloss="Evocation · 60 ft · DEX save"
        verdict="Advantage"
        verdictOutcome="buff"
      />
    );
    expect(screen.getByText("Faerie Fire")).toBeInTheDocument();
    expect(screen.getByText("Evocation · 60 ft · DEX save")).toBeInTheDocument();
    const verdict = screen.getByText("Advantage");
    expect(verdict).toHaveClass("uc-verdict");
    expect(verdict).toHaveAttribute("data-o", "buff");
    // The verdict is a dice/formula token — selectively opted out of machine
    // translation (translation is allowed app-wide; see dom-resilience).
    expect(verdict).toHaveAttribute("translate", "no");
    expect(screen.getByText("Faerie Fire")).not.toHaveAttribute("translate", "no");
  });

  it("colours the left border by action slot via data-slot", () => {
    const { container, rerender } = render(
      <UniversalCard kind="feature" name="X" slot="bonus" />
    );
    expect(container.querySelector(".uc")).toHaveAttribute("data-slot", "bonus");
    // "free" maps to the "nothing" border color.
    rerender(<UniversalCard kind="feature" name="X" slot="free" />);
    expect(container.querySelector(".uc")).toHaveAttribute("data-slot", "nothing");
  });

  it("honest blank: omits verdict, gloss, ritual, and quantity ≤1 at zero", () => {
    const { container } = render(<UniversalCard kind="gear" name="Rope" quantity={1} />);
    expect(container.querySelector(".uc-verdict")).toBeNull();
    expect(container.querySelector(".uc-gloss")).toBeNull();
    expect(container.querySelector(".uc-rit")).toBeNull();
    expect(container.querySelector(".uc-qty")).toBeNull();
  });

  it("shows the quantity marker only when owning more than one", () => {
    const { container } = render(
      <UniversalCard kind="gear" name="Dagger" quantity={3} />
    );
    expect(container.querySelector(".uc-qty")).toHaveTextContent("×3");
  });

  it("progressive disclosure: chevron toggles the accordion via aria-expanded", () => {
    render(
      <UniversalCard kind="feature" name="Bardic Inspiration" slot="bonus">
        <UniversalCardDesc>Grant a d8 to an ally.</UniversalCardDesc>
      </UniversalCard>
    );
    // The chevron's accessible name folds in the expand verb + the card name
    // (its hit area is the whole row — the DDB/BG3 whole-row standard).
    const chevron = screen.getByRole("button", { name: /Bardic Inspiration/ });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    // Collapsed: the detail region is `inert` (kept in the DOM so the collapse
    // animates, but removed from focus + the a11y tree) — not `hidden`, which
    // snapped it shut with nothing for the height transition to run on.
    const region = screen.getByRole("region", { hidden: true });
    expect(region).toHaveAttribute("inert");
    fireEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region")).not.toHaveAttribute("inert");
  });

  it("renders no chevron toggle when there is no detail content", () => {
    render(<UniversalCard kind="weapon" name="Rapier" />);
    expect(screen.queryByRole("button", { name: /Rapier/ })).not.toBeInTheDocument();
  });

  it("supports controlled open state", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <UniversalCard
        kind="feature"
        name="Open Me"
        open={false}
        onOpenChange={onOpenChange}
      >
        <UniversalCardDesc>Body</UniversalCardDesc>
      </UniversalCard>
    );
    const chevron = screen.getByRole("button", { name: /Open Me/ });
    fireEvent.click(chevron);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // Controlled: still closed until the parent flips `open`.
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    rerender(
      <UniversalCard kind="feature" name="Open Me" open onOpenChange={onOpenChange}>
        <UniversalCardDesc>Body</UniversalCardDesc>
      </UniversalCard>
    );
    expect(screen.getByRole("button", { name: /Open Me/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("with-prep mode: surfaces a prepared toggle and dims unprepared spells", () => {
    const onToggle = vi.fn();
    const { container, rerender } = render(
      <UniversalCard
        kind="spell"
        spellLevel={1}
        name="Charm Person"
        mode="with-prep"
        unprepared
        ariaPreparedLabel="Toggle prepared"
        onTogglePrepared={onToggle}
      />
    );
    expect(container.querySelector(".uc")).toHaveClass("with-prep", "unprepared");
    const prep = screen.getByRole("button", { name: "Toggle prepared" });
    expect(prep).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(prep);
    expect(onToggle).toHaveBeenCalledTimes(1);
    // Prepared state flips aria-pressed and clears the dim.
    rerender(
      <UniversalCard
        kind="spell"
        spellLevel={1}
        name="Charm Person"
        mode="with-prep"
        prepared
        ariaPreparedLabel="Toggle prepared"
        onTogglePrepared={onToggle}
      />
    );
    expect(screen.getByRole("button", { name: "Toggle prepared" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(container.querySelector(".uc")).not.toHaveClass("unprepared");
  });

  it("edit mode: surfaces an inline delete action in the collapsed head", () => {
    const onDelete = vi.fn();
    render(
      <UniversalCard
        kind="spell"
        spellLevel={2}
        name="Misty Step"
        mode="with-prep"
        editAction={
          <button type="button" onClick={onDelete}>
            Del
          </button>
        }
      />
    );
    // The delete is reachable without expanding the card (collapsed-row).
    const del = screen.getByRole("button", { name: "Del" });
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("with-prep mode: locks the toggle for always-prepared / cantrips", () => {
    render(
      <UniversalCard
        kind="spell"
        spellLevel={0}
        name="Vicious Mockery"
        mode="with-prep"
        prepared
        prepLocked
        ariaPreparedLabel="Always prepared"
      />
    );
    const prep = screen.getByRole("button", { name: "Always prepared" });
    expect(prep).toBeDisabled();
    expect(prep).toHaveAttribute("data-locked", "true");
  });

  it("renders the cantrip seal for spell level 0", () => {
    const { container } = render(
      <UniversalCard kind="spell" spellLevel={0} name="Mage Hand" />
    );
    const seal = container.querySelector(".uc-seal.lvl");
    expect(seal).toHaveClass("cantrip");
    expect(seal).toHaveTextContent("CAN");
  });

  it("combat-CTA mode: fires immediate-commit on the CTA and shows slot pips", () => {
    const onCommit = vi.fn();
    const { container } = render(
      <UniversalCard
        kind="spell"
        spellLevel={3}
        name="Counterspell"
        slot="reaction"
        mode="combat-CTA"
        ctaLabel="React"
        onCommit={onCommit}
        slotPips={{ level: 3, total: 3, used: 1 }}
      />
    );
    const cta = screen.getByRole("button", { name: "React" });
    expect(cta).toHaveClass("cc-btn");
    fireEvent.click(cta);
    expect(onCommit).toHaveBeenCalledTimes(1);
    // 3 pips, the last (used) one carries the .used class; label "L3".
    const pips = container.querySelectorAll(".uc-slotpips .sp");
    expect(pips).toHaveLength(3);
    expect(pips[2]).toHaveClass("used");
    expect(container.querySelector(".sp-lbl")).toHaveTextContent("L3");
  });

  it("combat-CTA mode: disables the CTA when the economy is spent", () => {
    render(
      <UniversalCard
        kind="weapon"
        name="Rapier"
        slot="action"
        mode="combat-CTA"
        ctaLabel="Attack"
        ctaDisabled
        onCommit={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Attack" })).toBeDisabled();
  });

  it("combat-CTA mode: ctaCommitted renders the recessed, DISABLED spent state (no toggle semantics)", () => {
    render(
      <UniversalCard
        kind="weapon"
        name="Rapier"
        slot="action"
        mode="combat-CTA"
        ctaLabel="Used"
        ctaCommitted
        ctaDisabled
        ctaAriaLabel="Used: Rapier"
        active
        onCommit={vi.fn()}
      />
    );
    const cta = screen.getByRole("button", { name: "Used: Rapier" });
    expect(cta).toHaveClass("cc-btn", "is-committed");
    expect(cta).toBeDisabled();
    // The CTA grammar: the CTA is a pure availability read, never a toggle —
    // no aria-pressed (reversal lives on the undo system).
    expect(cta).not.toHaveAttribute("aria-pressed");
  });

  it("combat-CTA mode: the whole row toggles the description (progressive disclosure)", () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <UniversalCard
        kind="feature"
        name="Second Wind"
        slot="bonus"
        mode="combat-CTA"
        ctaLabel="Use"
        onCommit={vi.fn()}
        open={false}
        onOpenChange={onOpenChange}
      >
        <UniversalCardDesc>Regain 1d10 + level HP.</UniversalCardDesc>
      </UniversalCard>
    );
    // The combat row-stretch toggle exists alongside the CTA (no chevron), and
    // tapping it expands the card WITHOUT firing the commit.
    const rowToggle = container.querySelector(".uc-row-toggle");
    expect(rowToggle).not.toBeNull();
    fireEvent.click(rowToggle as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("detail sub-components omit empty facts / foot (honest blanks)", () => {
    const { container } = render(
      <UniversalCard kind="feature" name="Expertise" open>
        <UniversalCardFacts
          facts={[
            { label: "Skills", value: "4" },
            { label: "Empty", value: "" },
          ]}
        />
        <UniversalCardFoot tags={["Passive"]} />
      </UniversalCard>
    );
    const facts = container.querySelectorAll(".uc-facts dd");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toHaveTextContent("4");
    expect(
      within(container.querySelector(".uc-detail-foot") as HTMLElement).getByText(
        "Passive"
      )
    ).toHaveClass("uc-tag");
  });
});

// ─── StatCard ─────────────────────────────────────────────────────────────────

describe("StatCard", () => {
  it("renders the engraved modifier, carved gem score, and proficient save", () => {
    const { container } = render(
      <StatCard
        label="DEX"
        modifier={3}
        score={16}
        saveBonus={7}
        saveProficient
        proficiencyBonus={4}
      />
    );
    expect(screen.getByText("DEX")).toHaveClass("sc-label");
    // Stat abbreviation + save-math line are formula tokens — selectively opted
    // out of machine translation (the card's prose copy stays translatable).
    expect(screen.getByText("DEX")).toHaveAttribute("translate", "no");
    expect(container.querySelector(".sc-base-math")).toHaveAttribute("translate", "no");
    expect(container.querySelector(".sc-mod")).toHaveTextContent("+3");
    expect(container.querySelector(".sc-gem")).toHaveTextContent("16");
    // Proficient: the rest-state save bonus is shown (not the "Save" label).
    expect(container.querySelector(".sc-save-rest")).toHaveClass("on");
    expect(container.querySelector(".sc-save-rest")).toHaveTextContent("+7");
  });

  it("formats a negative modifier with the folio minus glyph", () => {
    const { container } = render(
      <StatCard
        label="STR"
        modifier={-1}
        score={8}
        saveBonus={-1}
        saveProficient={false}
      />
    );
    expect(container.querySelector(".sc-mod")).toHaveTextContent("−1");
  });

  it("honest blank: shows the neutral Save label when not proficient", () => {
    const { container } = render(
      <StatCard
        label="CON"
        modifier={2}
        score={14}
        saveBonus={2}
        saveProficient={false}
        saveLabel="Save"
      />
    );
    const rest = container.querySelector(".sc-save-rest");
    expect(rest).toHaveTextContent("Save");
    expect(rest).not.toHaveClass("on");
  });

  it("progressive disclosure: the carved base discloses the save math on tap", () => {
    render(
      <StatCard
        label="DEX"
        modifier={3}
        score={16}
        saveBonus={7}
        saveProficient
        proficiencyBonus={4}
        baseHead="Saving Throw"
        ariaLabel="DEX ability"
      />
    );
    const card = screen.getByRole("button", { name: "DEX ability" });
    expect(card).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-expanded", "true");
    // Math line names the override-applied terms: "+7 = +3 mod +4 PB".
    const math = document.querySelector(".sc-base-math");
    expect(math).toHaveTextContent("+7 = +3 mod +4 PB");
  });

  it("non-proficient save math omits the PB term", () => {
    render(
      <StatCard
        label="INT"
        modifier={0}
        score={10}
        saveBonus={0}
        saveProficient={false}
      />
    );
    const math = document.querySelector(".sc-base-math");
    expect(math).toHaveTextContent("+0 = +0 mod");
    expect(math).not.toHaveTextContent("PB");
  });

  it("caster ability: highlights the face and renders the caster rubric", () => {
    const { container } = render(
      <StatCard
        label="CHA"
        modifier={5}
        score={20}
        saveBonus={9}
        saveProficient
        proficiencyBonus={4}
        caster
        casterLabel="Spellcasting"
      />
    );
    expect(container.querySelector(".statcard")).toHaveClass("caster");
    expect(screen.getByText("Spellcasting")).toHaveClass("sc-caster-rubric");
  });
});

// ─── Tracker ──────────────────────────────────────────────────────────────────

describe("Tracker", () => {
  it("uses pips for max ≤ 5 and reflects remaining uses", () => {
    const { container } = render(
      <Tracker
        name="Bardic Inspiration"
        total={4}
        used={1}
        color="amethyst"
        die="d8"
        recovery="SR"
      />
    );
    expect(container.querySelector(".tr-row")).toHaveAttribute("data-color", "amethyst");
    expect(screen.getByText("d8")).toHaveClass("tr-die");
    const pips = container.querySelectorAll(".tr-pip");
    expect(pips).toHaveLength(4);
    // 3 remaining → 3 "on", 1 spent.
    expect(container.querySelectorAll(".tr-pip.on")).toHaveLength(3);
    // No pool bar for pip trackers.
    expect(container.querySelector(".tr-pool")).toBeNull();
  });

  it("uses a pool bar for max > 5 and sizes the fill to the remaining ratio", () => {
    const { container } = render(
      <Tracker name="Lay on Hands" total={25} used={7} color="lapis" unit="hp" />
    );
    // No pips for pools.
    expect(container.querySelector(".tr-pip")).toBeNull();
    const fill = container.querySelector<HTMLElement>(".tr-pool-fill");
    expect(fill).not.toBeNull();
    expect(fill?.style.getPropertyValue("--w")).toBe("72%"); // (25-7)/25
    // The "hp" TOKEN is localized at the render boundary → "HP" in EN (golden
    // rule 7): the molecule never renders the raw token.
    expect(screen.getByText("HP", { exact: false })).toBeInTheDocument();
  });

  it("forces the pool representation when isPool is set even for small totals", () => {
    const { container } = render(
      <Tracker name="Channel" total={3} used={0} isPool unit="hp" />
    );
    expect(container.querySelector(".tr-pip")).toBeNull();
    expect(container.querySelector(".tr-pool")).not.toBeNull();
  });

  it("honest blank: a passive tracker shows the passive label and no controls", () => {
    const { container } = render(
      <Tracker name="Song of Rest" total={0} used={0} passiveLabel="passive" />
    );
    expect(screen.getByText("passive")).toHaveClass("tr-numeric");
    expect(container.querySelector(".tr-ctrl")).toBeNull();
    expect(container.querySelector(".tr-pip")).toBeNull();
  });

  it("honest blank: omits the source line, die, and recovery chip when absent", () => {
    const { container } = render(<Tracker name="Plain" total={3} used={0} />);
    expect(container.querySelector(".tr-source")).toBeNull();
    expect(container.querySelector(".tr-die")).toBeNull();
    expect(container.querySelector(".tr-recovery")).toBeNull();
  });

  it("spend/restore controls call the store actions and respect bounds", () => {
    const onSpend = vi.fn();
    const onRestore = vi.fn();
    render(
      <Tracker
        name="Channel Divinity"
        total={3}
        used={3}
        onSpend={onSpend}
        onRestore={onRestore}
        ariaSpend="Spend Channel Divinity"
        ariaRestore="Restore Channel Divinity"
      />
    );
    // Fully spent: Spend disabled, Restore enabled.
    expect(screen.getByRole("button", { name: "Spend Channel Divinity" })).toBeDisabled();
    const restore = screen.getByRole("button", { name: "Restore Channel Divinity" });
    expect(restore).not.toBeDisabled();
    fireEvent.click(restore);
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it("variable-cost: opens a spend popover with a live after-preview and confirms", () => {
    const onSpend = vi.fn();
    render(
      <Tracker
        name="Sorcery Points"
        total={8}
        used={2}
        variableCost
        onSpend={onSpend}
        spendLabel="Spend"
        spendAmountLabel="Amount"
        afterLabel="After"
        confirmLabel="Spend"
        ariaSpend="Spend Sorcery Points"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Spend Sorcery Points" }));
    // Popover body: amount stepper + after-preview (6 remaining = 8-2, amount 1).
    const stepper = screen.getByRole("spinbutton", { name: "Amount" });
    // Digit-filtered text spinbutton now (so it can be cleared + retyped), so its
    // value is the string "1" rather than the number 1.
    expect(stepper).toHaveValue("1");
    expect(document.querySelector(".tr-spend-after")).toHaveTextContent("5"); // 6-1
    // Increase the amount → after-preview updates.
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(document.querySelector(".tr-spend-after")).toHaveTextContent("4"); // 6-2
    // Confirm commits the chosen amount. The confirm button's accessible name
    // is exactly "Spend" (the trigger is "Spend Sorcery Points").
    fireEvent.click(screen.getByRole("button", { name: "Spend" }));
    expect(onSpend).toHaveBeenCalledWith(2);
  });
});
