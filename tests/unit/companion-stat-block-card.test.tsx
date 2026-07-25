/**
 * CompanionStatBlockCard — the shared companion card (Features tab + Companions
 * rail modal). Thin render/wiring test over a SYNTHETIC localized view (no pack
 * data needed — the card is pure presentation): AC / HP / attacks render, the HP
 * steppers call `onHpChange` with the clamped delta, and the Beast Master variant
 * `Segmented` calls `onVariantChange`. Edit/readonly renders values, not controls.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompanionStatBlockCard } from "@/components/shared/CompanionStatBlockCard";
import type { CompanionCardView } from "@/lib/views/companion-row-view";

const VIEW: CompanionCardView = {
  featureId: "ranger-beast-master-primal-companion",
  label: "Beast of the Land",
  kind: "Medium Beast",
  ac: 13,
  speed: "40 ft",
  hpMax: 20,
  current: 12,
  attacks: [
    {
      id: "beasts-strike",
      name: "Beast's Strike",
      attackBonus: 5,
      damage: "1d8 + 3 Slashing",
      reachFt: 5,
      ranged: false,
    },
  ],
  variants: [
    { variantId: "beast-of-the-land", label: "Beast of the Land" },
    { variantId: "beast-of-the-sea", label: "Beast of the Sea" },
    { variantId: "beast-of-the-sky", label: "Beast of the Sky" },
  ],
  selectedVariantId: "beast-of-the-land",
};

describe("CompanionStatBlockCard", () => {
  it("renders the label, AC, HP, and attack row", () => {
    render(<CompanionStatBlockCard view={VIEW} interactive={false} />);
    // The label appears as the header AND (non-interactive) as the variant text.
    expect(screen.getAllByText("Beast of the Land").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("12 / 20")).toBeInTheDocument();
    expect(screen.getByText("Beast's Strike")).toBeInTheDocument();
    expect(screen.getByText("1d8 + 3 Slashing")).toBeInTheDocument();
  });

  it("wires the HP steppers to onHpChange (interactive)", () => {
    const onHpChange = vi.fn();
    render(<CompanionStatBlockCard view={VIEW} interactive onHpChange={onHpChange} />);
    fireEvent.click(screen.getByLabelText("+1 HP Beast of the Land"));
    expect(onHpChange).toHaveBeenCalledWith(VIEW.featureId, 13);
    fireEvent.click(screen.getByLabelText("−1 HP Beast of the Land"));
    expect(onHpChange).toHaveBeenCalledWith(VIEW.featureId, 11);
  });

  it("renders the variant Segmented and wires onVariantChange (interactive)", () => {
    const onVariantChange = vi.fn();
    render(
      <CompanionStatBlockCard view={VIEW} interactive onVariantChange={onVariantChange} />
    );
    // All three variant options render as pressable segments.
    fireEvent.click(screen.getByText("Beast of the Sky"));
    expect(onVariantChange).toHaveBeenCalledWith(VIEW.featureId, "beast-of-the-sky");
  });

  it("hides the HP steppers in non-interactive (edit/readonly) mode", () => {
    render(<CompanionStatBlockCard view={VIEW} interactive={false} />);
    expect(screen.queryByLabelText("+1 HP Beast of the Land")).not.toBeInTheDocument();
  });

  it("falls back to hpMax when no current HP is set", () => {
    render(
      <CompanionStatBlockCard
        view={{ ...VIEW, current: undefined }}
        interactive={false}
      />
    );
    expect(screen.getByText("20 / 20")).toBeInTheDocument();
  });
});
