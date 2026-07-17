/**
 * G7/W4 — the background ability-score increase is on-rails.
 *
 * Each 2024 background grants its +2/+1 (or +1/+1/+1) to ONE OF THREE named
 * abilities (`bg.abilityOptions`). `BgAsiPicker` must DISABLE every ability
 * tile whose code is NOT one of those three, so a player can never assign the
 * increase to an ability the background does not grant — an invalid state is
 * UNREACHABLE, not validated-and-scolded after the fact (golden rule 20).
 *
 * The disable is a render result (the tile is a `<button disabled>`), so a thin
 * render test is the right pin (golden rule 13): mount the picker and assert
 * the eligible/ineligible tiles' `disabled` state. Tiles render in the fixed
 * `ABILITY_CODES` order STR·DEX·CON·INT·WIS·CHA, so we address them by index —
 * locale-independent.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BgAsiPicker } from "@/features/creation/steps/AbilitiesStep";
import type { AbilityCode } from "@/data/types";

const TILE_ORDER: AbilityCode[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/** Render the picker and return its 6 ability tiles keyed by code (tiles render
 *  in the fixed STR·DEX·CON·INT·WIS·CHA order, so index i ↔ TILE_ORDER[i]). */
function renderPicker(
  abilityOptions: readonly AbilityCode[]
): Record<AbilityCode, HTMLButtonElement> {
  const { container } = render(
    <BgAsiPicker
      baseScores={{ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }}
      mode="+2/+1"
      choices={{}}
      abilityOptions={abilityOptions}
      backgroundName="Acolyte"
      onSwitchMode={vi.fn()}
      onToggle={vi.fn()}
      isValid={false}
    />
  );
  const tiles = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button.wiz-asi-tile")
  );
  expect(tiles).toHaveLength(6);
  const byCode = {} as Record<AbilityCode, HTMLButtonElement>;
  TILE_ORDER.forEach((code, i) => {
    const tile = tiles[i];
    if (!tile) throw new Error(`missing tile ${i}`);
    byCode[code] = tile;
  });
  return byCode;
}

describe("BgAsiPicker — only the background's 3 eligible abilities are pickable", () => {
  it("DISABLES every tile whose code is NOT in abilityOptions, ENABLES the three that are (Soldier: STR/DEX/CON)", () => {
    const eligible: AbilityCode[] = ["STR", "DEX", "CON"];
    const tiles = renderPicker(eligible);
    for (const code of TILE_ORDER) {
      expect(tiles[code].disabled, code).toBe(!eligible.includes(code));
    }
  });

  it("a different eligible set (Acolyte: INT/WIS/CHA) flips exactly those tiles", () => {
    const eligible: AbilityCode[] = ["INT", "WIS", "CHA"];
    const tiles = renderPicker(eligible);
    for (const code of TILE_ORDER) {
      expect(tiles[code].disabled, code).toBe(!eligible.includes(code));
    }
  });

  it("an empty abilityOptions (no background resolved) disables ALL tiles — no ASI placeable", () => {
    const tiles = renderPicker([]);
    expect(TILE_ORDER.every((code) => tiles[code].disabled)).toBe(true);
  });
});
