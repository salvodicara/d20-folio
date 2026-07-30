/**
 * The Create ceremony — WizardNav's commit-moment gold bloom.
 *
 * The final commit control (creation "Create Character" / level-up confirm) is the
 * ONE next-button that carries `commit`; both wizards pass the same flag. This pins
 * the wiring: `commit` marks the next button `.commit` (the CSS then arms the press
 * bloom), a non-commit step does NOT, and pressing a commit button arms the
 * one-shot `.blooming` class (the ::after animation).
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { WizardNav } from "@/features/wizard/chrome";

function nextButton(commit: boolean): HTMLElement {
  const { container } = render(
    <WizardNav
      backLabel="Back"
      nextLabel="Create Character"
      onBack={() => {}}
      onNext={vi.fn()}
      commit={commit}
    />
  );
  const next = container.querySelector<HTMLElement>(".wiz-pager-btn.next");
  if (!next) throw new Error("next pager button not found");
  return next;
}

describe("WizardNav commit ceremony", () => {
  it("crowns the commit next button with the .commit class", () => {
    expect(nextButton(true).classList.contains("commit")).toBe(true);
  });

  it("leaves a non-commit step's next button uncrowned", () => {
    const next = nextButton(false);
    expect(next.classList.contains("commit")).toBe(false);
    expect(next.classList.contains("blooming")).toBe(false);
  });

  it("arms the one-shot gold bloom on a commit press", () => {
    const next = nextButton(true);
    expect(next.classList.contains("blooming")).toBe(false);
    fireEvent.click(next);
    expect(next.classList.contains("blooming")).toBe(true);
  });
});
