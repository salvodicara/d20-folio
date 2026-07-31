/**
 * og-image — the dynamic preview PNG builder behind the `ogImage` route.
 *
 * The SVG builders are PURE, so the exposure rule is asserted on the MARKUP (the name
 * landed, a 0 stat is omitted, a locked campaign is refused) without a rasteriser. A
 * second layer rasterises for real (resvg + the bundled fonts) to prove the pipeline
 * yields a valid 1200×630 PNG with and without a portrait — and that a render THROW
 * folds to `null` (the seam the route redirects to the static card on).
 *
 * BLIND SPOT, stated: the Firestore gate + the Storage portrait fetch live in
 * `index.ts` (`resolveImage`), so "unshared ⇒ no render" is asserted there by the same
 * `shared !== true` check the shell makes, and end-to-end by the emulator curl — not
 * here. This file owns everything downstream of the already-gated data.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  wrapText,
  characterImageData,
  campaignImageData,
  characterSvg,
  campaignSvg,
  renderSvg,
  tryRender,
  imageEtag,
  makeImageMemo,
  ogImageKey,
} from "./og-image";
import { parseOgImagePath } from "./og-meta";

/** Read a PNG's declared dimensions from its IHDR (bytes 16–24). */
function pngSize(buf: Buffer): { w: number; h: number } {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  expect([...buf.subarray(0, 8)]).toEqual(sig); // it really is a PNG
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe("wrapText", () => {
  it("keeps a short name on one line", () => {
    expect(wrapText("Mara", 15, 2)).toEqual(["Mara"]);
  });

  it("wraps a long name onto a second line at a word boundary", () => {
    expect(wrapText("Aurelia Silvermoon", 12, 2)).toEqual(["Aurelia", "Silvermoon"]);
  });

  it("hard-breaks a single word too long for the budget", () => {
    const [line] = wrapText("Silvermoonshadowbanescepter", 12, 1);
    expect(line.length).toBeLessThanOrEqual(12);
    expect(line.endsWith("…")).toBe(true);
  });

  it("clips an overflow past the last line with an ellipsis, never drops it silently", () => {
    const lines = wrapText("one two three four five six", 8, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
  });
});

describe("characterImageData — the gated cache → card inputs (never a recompute)", () => {
  it("carries name, TOTAL level and joined classes off the cache", () => {
    const data = characterImageData(
      {
        name: "Lyra Voss",
        classes: [
          { classId: "bard", level: 9 },
          { classId: "fighter", level: 2 },
        ],
        ac: 16,
        hpMax: 74,
      },
      null
    );
    expect(data).toMatchObject({
      name: "Lyra Voss",
      level: 11,
      classLine: "Bard / Fighter",
      ac: 16,
      hp: 74,
      portrait: null,
    });
  });

  it("omits an unstamped stat rather than showing AC 0 / HP 0", () => {
    const data = characterImageData(
      { name: "Husk", classes: [{ classId: "rogue", level: 3 }], ac: 0, hpMax: 0 },
      null
    );
    expect(data?.ac).toBe(0);
    expect(data?.hp).toBe(0);
    // …and the SVG must not print the lie.
    const svg = characterSvg(data!);
    expect(svg).not.toContain("AC 0");
    expect(svg).not.toContain("HP 0");
  });

  it("rejects a cache with no usable name (⇒ the route serves the static card)", () => {
    expect(characterImageData({ name: "   " }, null)).toBeNull();
    expect(characterImageData({}, null)).toBeNull();
  });

  it("passes the portrait through untouched", () => {
    const data = characterImageData({ name: "Mara" }, "data:image/jpeg;base64,AAAA");
    expect(data?.portrait).toBe("data:image/jpeg;base64,AAAA");
  });
});

describe("campaignImageData — name + party size, and the lock re-check", () => {
  it("carries the name and the members-array length", () => {
    expect(
      campaignImageData({ name: "Starless Keep", members: ["a", "b", "c"] })
    ).toEqual({ name: "Starless Keep", members: 3 });
  });

  it("a LOCKED campaign yields no data — the leaked-link kill switch holds here too", () => {
    expect(
      campaignImageData({ name: "Starless Keep", members: ["a"], joinsLocked: true })
    ).toBeNull();
  });

  it("rejects a nameless campaign", () => {
    expect(campaignImageData({ name: "", members: ["a"] })).toBeNull();
    expect(campaignImageData({ members: ["a"] })).toBeNull();
  });
});

describe("the SVG builders put the entity's own facts in the markup", () => {
  it("the character card carries the name, level/class and stat line", () => {
    const svg = characterSvg({
      name: "Mara Quickfingers",
      level: 5,
      classLine: "Rogue",
      ac: 15,
      hp: 42,
      portrait: null,
    });
    expect(svg).toContain("Quickfingers");
    expect(svg).toContain("Level 5 Rogue");
    expect(svg).toContain("AC 15");
    expect(svg).toContain("HP 42");
  });

  it("escapes a hostile name — it lands inside SVG text", () => {
    const svg = characterSvg({
      name: '<script>&"',
      level: 1,
      classLine: "",
      ac: 0,
      hp: 0,
      portrait: null,
    });
    expect(svg).not.toMatch(/<script>/);
    expect(svg).toContain("&lt;script&gt;");
  });

  it("draws the portrait medallion when a portrait is present, the tinted initial when not", () => {
    const withP = characterSvg({
      name: "Mara",
      level: 1,
      classLine: "",
      ac: 0,
      hp: 0,
      portrait: "data:image/jpeg;base64,AAAA",
    });
    expect(withP).toContain('clip-path="url(#pclip)"');
    expect(withP).toContain("data:image/jpeg;base64,AAAA");

    const noP = characterSvg({
      name: "Mara",
      level: 1,
      classLine: "",
      ac: 0,
      hp: 0,
      portrait: null,
    });
    expect(noP).toContain('fill="hsl('); // the per-seed tint
    expect(noP).toContain(">M<"); // the initial
    expect(noP).not.toContain('clip-path="url(#pclip)"');
  });

  it("the campaign card carries the name and the party line", () => {
    // A short name that does not wrap, so the contiguous string is assertable.
    const svg = campaignSvg({ name: "Ravenholt", members: 5 });
    expect(svg).toContain("Ravenholt");
    expect(svg).toContain("5 adventurers at the table");
    expect(campaignSvg({ name: "Solo", members: 1 })).toContain(
      "1 adventurer at the table"
    );
    // A long name wraps across two <text> elements — both words still present.
    const wrapped = campaignSvg({ name: "The Starless Keep", members: 3 });
    expect(wrapped).toContain("Starless");
    expect(wrapped).toContain("Keep");
  });
});

describe("renderSvg — the real rasteriser yields a valid 1200×630 PNG", () => {
  // A valid JPEG stand-in for a portrait: the bundled card art itself.
  const portrait =
    "data:image/jpeg;base64," +
    readFileSync(resolve(__dirname, "../cards/og-card-character.jpg")).toString("base64");

  it("renders a character card WITH a portrait", () => {
    const png = renderSvg(
      characterSvg({
        name: "Mara Quickfingers",
        level: 5,
        classLine: "Rogue",
        ac: 15,
        hp: 42,
        portrait,
      })
    );
    expect(pngSize(png)).toEqual({ w: 1200, h: 630 });
    expect(png.length).toBeGreaterThan(1000);
  });

  it("renders a character card WITHOUT a portrait (the tinted initial path)", () => {
    const png = renderSvg(
      characterSvg({
        name: "Thordak",
        level: 8,
        classLine: "Paladin",
        ac: 19,
        hp: 76,
        portrait: null,
      })
    );
    expect(pngSize(png)).toEqual({ w: 1200, h: 630 });
  });

  it("renders a campaign card", () => {
    const png = renderSvg(campaignSvg({ name: "The Starless Keep", members: 5 }));
    expect(pngSize(png)).toEqual({ w: 1200, h: 630 });
  });
});

describe("tryRender — the fallback seam (a render throw must NOT reach the route as a 500)", () => {
  it("returns the buffer on success", () => {
    const png = tryRender("<svg/>", () => Buffer.from([1, 2, 3]));
    expect(png).toEqual(Buffer.from([1, 2, 3]));
  });

  it("folds ANY render throw to null, so the route redirects to the static card", () => {
    const png = tryRender("<svg/>", () => {
      throw new Error("resvg exploded");
    });
    expect(png).toBeNull();
  });
});

describe("imageEtag — a stable strong ETag over the PNG bytes", () => {
  it("is deterministic per bytes and differs when the bytes differ", () => {
    const a = imageEtag(Buffer.from([1, 2, 3]));
    expect(a).toBe(imageEtag(Buffer.from([1, 2, 3])));
    expect(a).not.toBe(imageEtag(Buffer.from([1, 2, 4])));
    expect(a).toMatch(/^".+"$/); // a quoted strong ETag
  });
});

describe("makeImageMemo — the DoS belt: one render per path, re-served from memory", () => {
  const svg = characterSvg({
    name: "Mara",
    level: 1,
    classLine: "",
    ac: 0,
    hp: 0,
    portrait: null,
  });

  it("rasters ONCE for repeated hits on the same path; both serve a valid PNG + ETag", async () => {
    const render = vi.fn((s: string) => renderSvg(s));
    const memo = makeImageMemo(64, 900_000);
    const produce = () => Promise.resolve(tryRender(svg, render));

    const path = "/og/character/u/c.png"; // a `?i=1,2,3…` flood all keys to this path
    const a = await memo(path, produce);
    const b = await memo(path, produce);
    expect(render).toHaveBeenCalledTimes(1); // memoised — NOT re-rastered
    expect(a).toBe(b); // the same cached entry, byte-for-byte
    expect(pngSize(a!.png)).toEqual({ w: 1200, h: 630 });
    expect(a!.etag).toMatch(/^".+"$/);

    // MUTATION PROOF — the same producer WITHOUT the memo rasters on every call, so it
    // is the memo (not some incidental caching) that collapses the flood onto one render.
    render.mockClear();
    await produce();
    await produce();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("keys on parsed IDENTITY — path spellings of the same entity raster ONCE", async () => {
    const render = vi.fn((s: string) => renderSvg(s));
    const memo = makeImageMemo(64, 900_000);
    const produce = () => Promise.resolve(tryRender(svg, render));

    // Two DISTINCT raw paths that `parseOgImagePath` reduces to the SAME entity (empty
    // segments filtered), so the memo key (`ogImageKey` over the parse) is identical.
    const rawA = "/og/character/u/c.png";
    const rawB = "/og//character//u//c.png";
    const keyA = ogImageKey(parseOgImagePath(rawA)!);
    const keyB = ogImageKey(parseOgImagePath(rawB)!);
    expect(keyA).toBe(keyB); // both spellings collapse onto one identity key

    await memo(keyA, produce);
    await memo(keyB, produce);
    expect(render).toHaveBeenCalledTimes(1); // one raster for both path spellings

    // MUTATION PROOF — keying on the RAW path (the pre-fix behaviour) splits the two
    // spellings into two keys and rasters twice; it is the identity key that collapses them.
    render.mockClear();
    const memoRaw = makeImageMemo(64, 900_000);
    await memoRaw(rawA, produce);
    await memoRaw(rawB, produce);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("never caches a null produce (ungated/failed) — nothing costly to memo", async () => {
    const memo = makeImageMemo(64, 900_000);
    const produce = vi.fn<() => Promise<Buffer | null>>(() => Promise.resolve(null));
    expect(await memo("/og/x.png", produce)).toBeNull();
    expect(await memo("/og/x.png", produce)).toBeNull();
    expect(produce).toHaveBeenCalledTimes(2); // re-tried each hit, never stored
  });

  it("re-produces once an entry passes its TTL", async () => {
    const memo = makeImageMemo(64, 1000);
    const produce = vi.fn<() => Promise<Buffer | null>>(() =>
      Promise.resolve(Buffer.from([1, 2, 3]))
    );
    await memo("/og/c.png", produce, 0);
    await memo("/og/c.png", produce, 500); // within TTL → served from memo
    expect(produce).toHaveBeenCalledTimes(1);
    await memo("/og/c.png", produce, 2000); // past TTL → re-produced
    expect(produce).toHaveBeenCalledTimes(2);
  });

  it("is bounded — evicts the oldest key once past the cap", async () => {
    const memo = makeImageMemo(2, 900_000);
    const produce = vi.fn<() => Promise<Buffer | null>>(() =>
      Promise.resolve(Buffer.from([9]))
    );
    await memo("/a", produce);
    await memo("/b", produce);
    await memo("/c", produce); // over cap → evicts /a (oldest)
    expect(produce).toHaveBeenCalledTimes(3);

    await memo("/c", produce); // still cached → no re-produce
    expect(produce).toHaveBeenCalledTimes(3);
    await memo("/a", produce); // evicted → re-produced
    expect(produce).toHaveBeenCalledTimes(4);
  });
});

describe("the bundled render assets ship inside the function", () => {
  it("every font face the builders name is present", () => {
    for (const f of ["Cinzel-700", "Cinzel-600", "Alegreya-600", "Alegreya-500"]) {
      const file = resolve(__dirname, "../fonts", `${f}.ttf`);
      expect(existsSync(file), `missing ${file}`).toBe(true);
    }
  });

  it("the card art is a BYTE-COPY of the shipped public/ card (no drift)", () => {
    // The renderer embeds `cards/og-card-*.jpg`; those must stay identical to the
    // static fallback in `public/`, or the dynamic card and its fallback would diverge.
    for (const name of ["og-card-character.jpg", "og-card-campaign.jpg"]) {
      const bundled = readFileSync(resolve(__dirname, "../cards", name));
      const source = readFileSync(resolve(__dirname, "../../public", name));
      expect(bundled.equals(source), `${name} drifted from public/`).toBe(true);
    }
  });
});
