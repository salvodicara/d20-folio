/**
 * A companion's ±1 HP steppers are named in the player's language: in Italian the
 * Skeletons' buttons read "−1 PF Scheletro 2", not the English "−1 HP".
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { CompanionHpStepper } from "@/components/shared/CompanionHpStepper";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("CompanionHpStepper names its steppers in the player's language", () => {
  it("reads PF in Italian", async () => {
    await i18n.changeLanguage("it");
    render(
      <CompanionHpStepper label="Scheletro 2" current={7} max={13} onChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: "−1 PF Scheletro 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+1 PF Scheletro 2" })).toBeInTheDocument();
  });

  it("reads HP in English", async () => {
    await i18n.changeLanguage("en");
    render(
      <CompanionHpStepper label="Skeleton 2" current={7} max={13} onChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: "−1 HP Skeleton 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+1 HP Skeleton 2" })).toBeInTheDocument();
  });
});
