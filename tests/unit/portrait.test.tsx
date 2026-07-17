/**
 * #92/#45 — the shared Portrait primitive + the deterministic avatar tint.
 * Pins: avatarTint is pure/stable (no RNG); Portrait renders a stored character
 * portrait, a remote (no-referrer, lazy) user avatar, and the per-seed tinted
 * initial fallback when there's no portrait.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { avatarTint, idToHue } from "@/lib/utils";
import { Portrait } from "@/components/shared/Portrait";

describe("avatarTint", () => {
  it("is deterministic — same seed always yields the same hue", () => {
    expect(avatarTint("char-1")).toEqual(avatarTint("char-1"));
    expect(avatarTint("char-1")["--av-hue"]).toBe(String(idToHue("char-1")));
  });

  it("spreads distinct seeds across hues", () => {
    const seeds = ["a", "b", "c", "lyra", "thorin", "x9z", "uid-42"];
    const hues = new Set(seeds.map((s) => avatarTint(s)["--av-hue"]));
    // Not all identical — the whole point is per-character variety.
    expect(hues.size).toBeGreaterThan(1);
  });

  it("tolerates an empty seed", () => {
    expect(avatarTint("")["--av-hue"]).toBe(String(idToHue("?")));
  });
});

describe("Portrait", () => {
  it("renders a stored character portrait image", () => {
    const { container } = render(
      <Portrait src="https://example.test/p.jpg" crop={null} name="Lyra" seed="c1" />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.test/p.jpg");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("renders a remote user avatar with no-referrer + lazy", () => {
    const { container } = render(
      <Portrait src="https://lh3.googleusercontent.com/a" remote name="Sam" seed="u1" />
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to the tinted initial when there is no portrait", () => {
    const { container } = render(<Portrait src={null} name="Thorin" seed="c2" />);
    expect(container.querySelector("img")).toBeNull();
    const fallback = container.querySelector<HTMLElement>(".av-fallback");
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toBe("T");
    // The deterministic tint is applied as the --av-hue custom property.
    expect(fallback?.style.getPropertyValue("--av-hue")).toBe(String(idToHue("c2")));
  });

  it("eager-loads only when asked (the above-the-fold hero)", () => {
    const { container } = render(
      <Portrait src="x.jpg" crop={null} name="A" seed="s" loading="eager" />
    );
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("eager");
  });

  // NON-NULLABILITY (owner 2026-06-15): a CHARACTER name is a branded
  // `NonEmptyString` upstream, so it always yields a real monogram. `Portrait.name`
  // is now a REQUIRED `string` — there is no implicit `?? ""` default smuggled inside
  // Portrait. A NON-character avatar (a Google account with no display name) resolves
  // its genuinely-optional value to a string AT THE CALL SITE; an empty / whitespace
  // result degrades to a "?" monogram via `initialOf`, never crashing on `name.trim()`
  // of undefined (the old campaign white-screen) and never inventing a word.
  it("a whitespace-only name renders '?' (no initial to take)", () => {
    const { container } = render(<Portrait src={null} name="   " seed="s" />);
    expect(container.querySelector<HTMLElement>(".av-fallback")?.textContent).toBe("?");
  });

  it("an EMPTY name (non-character avatar, the optional-name call site) renders '?'", () => {
    // The required-but-empty case: a player account with no display name passes "" at
    // the call site (`displayName ?? email ?? "?"` resolved to ""), never omitting the
    // prop. Portrait degrades it to the "?" monogram — no internal default needed.
    const { container } = render(<Portrait src={null} name="" seed="s" />);
    expect(container.querySelector<HTMLElement>(".av-fallback")?.textContent).toBe("?");
  });
});
