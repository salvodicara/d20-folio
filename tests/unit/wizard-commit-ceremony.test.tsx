/**
 * The commit moment — WizardNav's final forward coin — plus the frame's realm
 * backdrop.
 *
 * The final commit control (creation "Create Character" / level-up confirm) is the
 * ONE next-button that carries `commit`; both wizards pass the same flag. The
 * ceremony it marks is the REGISTER LADDER, not an effect of its own: the coin steps
 * from the quiet seat to the earned one.
 *
 * WHY THE ASSERTION READS THE STYLESHEET. This spec used to assert only that the
 * button carried `.commit` and, on press, `.blooming` — and it stayed GREEN for the
 * whole life of a chrome reset that had DELETED the `pager-bloom` keyframes those
 * classes existed to trigger. A class name is not a treatment; the wiring test has
 * to reach the artifact the wiring is FOR, so it also checks that `.commit` still
 * resolves to something in `folio.css`.
 *
 * WHAT IT CANNOT SEE: whether the earned seat is VISIBLY different from the quiet
 * one at the coin's size — that is a rendered question, and the pair of tier tokens
 * is pinned in `chrome-system.guard.test.ts`.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { render } from "@testing-library/react";
import { WizardFrame, WizardNav } from "@/features/wizard/chrome";

const folio = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../src/styles/folio.css"),
  "utf8"
);

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

describe("WizardNav commit moment", () => {
  it("crowns the commit next button with the .commit class", () => {
    expect(nextButton(true).classList.contains("commit")).toBe(true);
  });

  it("leaves a non-commit step's next button uncrowned", () => {
    expect(nextButton(false).classList.contains("commit")).toBe(false);
  });

  it("…and `.commit` resolves to a real treatment — the EARNED seat", () => {
    const rule =
      /\.wiz-pager-btn\.commit \.wiz-pager-seal \{([^}]*)\}/.exec(folio)?.[1] ?? "";
    expect(
      rule,
      "`.commit` is emitted by WizardNav but nothing in folio.css answers it — the " +
        "class marks the app's single most important moment and paints nothing."
    ).not.toBe("");
    expect(rule).toContain("var(--edge-seat-earned)");
  });

  it("emits no bloom: the ceremony is the tier, never a halo", () => {
    expect(folio).not.toMatch(/pager-bloom|\.blooming/);
  });
});

describe("WizardFrame realm backdrop", () => {
  it("mounts the wizards' realm scene (--app-bg-art → the Ritual of Making plate) and clears it on unmount", () => {
    // The frame is the ONE chrome both wizards (creation + level-up) share, so
    // the realm mounts here once and covers both surfaces (DESIGN.md §13).
    const { unmount } = render(<WizardFrame>step</WizardFrame>);
    expect(document.documentElement.style.getPropertyValue("--app-bg-art")).toBe(
      "var(--asset-creation-scene)"
    );
    unmount();
    expect(document.documentElement.style.getPropertyValue("--app-bg-art")).toBe("");
  });
});
