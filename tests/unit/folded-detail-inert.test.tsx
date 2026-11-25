/**
 * A folded section's detail is out of reach (#1222). The fold is a 0-px clip box, so
 * its content keeps real boxes: without `inert`, Tab walked into the hidden controls
 * (the older evenings' «Automatic report» buttons in the campaign Journal) and screen
 * readers announced them. Closed: `inert` (and, in CSS, not painted); open: back. The
 * real-browser proof (Tab, the accessibility tree) is in `tests/e2e/folded-detail.spec.ts`.
 * The guard below keeps every `.section-detail` in the app on the same rule.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { useCampaignStore } from "@/features/campaigns/campaignStore";

describe("a folded section's detail", () => {
  it("is inert and unreachable while closed, and back when opened", () => {
    useCampaignStore.setState({ campaign: { id: "c1" } as never });
    localStorage.clear();
    const { container } = render(
      <SectionPanel
        sectionId="older"
        title="Sessions"
        detail={<button type="button">Automatic report</button>}
        showLabel="Show older"
        hideLabel="Hide older"
      >
        <p>newest</p>
      </SectionPanel>
    );
    const detail = container.querySelector(".section-detail");
    // jsdom does not apply `inert` to queries; the browser check is the e2e below.
    expect(detail?.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Show older" }));
    expect(detail?.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("button", { name: "Automatic report" })).toBeInTheDocument();
  });
});

describe("every folded detail in the app", () => {
  it("carries inert while closed", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".tsx")) files.push(path);
      }
    };
    walk(join(__dirname, "../../src"));
    const missing = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      const details = text.match(/<div[^>]*className="section-detail"[^>]*>/g) ?? [];
      return details.some((tag) => !/\binert=/.test(tag));
    });
    expect(missing).toEqual([]);
  });
});
