/**
 * Wizard-F ability cartouches — the ONE tile family across both wizards:
 *
 *  - C2: `WizardPointBuy` composes the BACKGROUND ASI into its tiles — base
 *    score on the stepper, the bonus as a gold annotation with the EFFECTIVE
 *    total, and the modifier derived from the EFFECTIVE score (one source,
 *    no dual state). Without boosts the quiet "background adds later" note
 *    shows instead.
 *  - B4: `WizardAsiCartouches` (the level-up +2/+1+1 picker + the creation
 *    bg-ASI picker) shows current score, the increase applied, the live
 *    effective modifier; capped tiles are unpickable.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardPointBuy, WizardAsiCartouches } from "@/features/wizard/point-buy";
import type { AbilityCode } from "@/data/types";

const BASE: Record<AbilityCode, number> = {
  STR: 10,
  DEX: 12,
  CON: 11,
  INT: 10,
  WIS: 10,
  CHA: 10,
};

describe("WizardPointBuy — background-ASI composition (C2)", () => {
  it("a boosted tile STARTS FROM base+bonus (reactive), with the gold note + effective modifier", () => {
    const onChange = vi.fn();
    render(
      <WizardPointBuy scores={BASE} boosts={{ DEX: 2, CON: 1 }} onChange={onChange} />
    );
    // DEX base 12 +2 background → the tile READS 14 (not 12), modifier +2.
    const dex = screen.getByRole("spinbutton", { name: "Dexterity" });
    expect(dex).toHaveValue("14");
    // CON base 11 +1 → reads 12, modifier +1 (never the base-score +0).
    expect(screen.getByRole("spinbutton", { name: "Constitution" })).toHaveValue("12");
    expect(screen.getByText("+2 from background")).toBeInTheDocument();
    expect(screen.getByText("+1 from background")).toBeInTheDocument();
    const mods = Array.from(document.querySelectorAll(".wiz-abil-mod")).map(
      (el) => el.textContent
    );
    expect(mods.some((m) => m.startsWith("+2"))).toBe(true); // DEX effective 14
    expect(mods.some((m) => m.startsWith("+1"))).toBe(true); // CON effective 12
    // Stepping edits the BASE underneath: 14 shown → +1 → base becomes 13.
    const dexTile = dex.closest(".wiz-abil") as HTMLElement;
    const inc = dexTile.querySelector('button[aria-label="Increase"]');
    fireEvent.click(inc as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ DEX: 13 }));
  });

  it("without boosts the tiles show base modifiers and the 'background adds later' note", () => {
    render(<WizardPointBuy scores={BASE} onChange={() => {}} />);
    expect(screen.queryByText(/from background/)).toBeNull();
    expect(
      screen.getByText(/background adds its ability increases afterwards/i)
    ).toBeInTheDocument();
  });
});

describe("WizardAsiCartouches — the boon/bg-ASI tile family (B4)", () => {
  it("selecting stamps the increase + effective modifier; capped tiles are unpickable", () => {
    const onPick = vi.fn();
    const scores = { ...BASE, STR: 17, CHA: 20 };
    render(
      <WizardAsiCartouches
        abilityScores={scores}
        bonusFor={() => 2}
        isSelected={(c) => c === "STR"}
        onPick={onPick}
      />
    );
    // STR 17 selected +2 → 19 (effective), modifier +4.
    expect(screen.getByText("→ 19")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    // CHA is at the 20 cap → its tile is disabled (invalid picks unreachable).
    const chaTile = screen
      .getAllByRole("button")
      .find((b) => /CHA|CAR/.test(b.textContent));
    expect(chaTile).toBeDisabled();
    // Picking an open tile emits its code.
    const dexTile = screen
      .getAllByRole("button")
      .find((b) => /DEX|DES/.test(b.textContent));
    fireEvent.click(dexTile as HTMLElement);
    expect(onPick).toHaveBeenCalledWith("DEX");
  });
});
