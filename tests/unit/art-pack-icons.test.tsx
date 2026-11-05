/**
 * A painted icon comes from the private pack when the pack has it (`@pack/icon-art`,
 * keyed "<kind>/<id>"), else from the public /assets/art; a file that fails to load
 * shows the glyph.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// In the public build the alias resolves to the shared empty pack: keep its other exports.
vi.mock("@pack/icon-art", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  packIconArt: { "class/artificer": "https://pack.example/artificer.webp" },
}));

import { Art } from "@/ui/Art";

describe("Art", () => {
  it("draws a pack entry's icon from the pack", async () => {
    const { container } = render(<Art kind="class" id="artificer" fallback="G" />);
    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "https://pack.example/artificer.webp"
      )
    );
  });

  it("draws an SRD entry's icon from /assets/art, and the glyph when it fails", async () => {
    const { container } = render(<Art kind="spell" id="fireball" fallback="GLYPH" />);
    await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/assets/art/spell/fireball.webp");
    if (img) fireEvent.error(img);
    expect(screen.getByText("GLYPH")).toBeTruthy();
  });
});
