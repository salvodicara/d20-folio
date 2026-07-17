/**
 * chronicle-export — the campaign chronicle's portable `.md` download.
 *
 * Pins the pure filename derivation (the only computed value) table-style, plus a
 * thin wiring assertion that the download fires a `text/markdown` blob of the
 * VERBATIM chronicle text named after the campaign (the shared `triggerDownload`
 * primitive is mocked, so no DOM object-URL is needed).
 */

import { describe, it, expect, vi } from "vitest";

const { triggerDownload } = vi.hoisted(() => ({ triggerDownload: vi.fn() }));
vi.mock("@/lib/download", () => ({ triggerDownload }));

import {
  chronicleFilename,
  downloadChronicleMarkdown,
} from "@/features/campaigns/chronicle-export";

describe("chronicleFilename", () => {
  it.each([
    // The owner's real campaign — parens + spaces collapse to a clean slug.
    [
      "La Compagnia del Carretto (Siciliano)",
      "la-compagnia-del-carretto-siciliano-chronicle.md",
    ],
    ["Società Segreta", "societa-segreta-chronicle.md"], // diacritics stripped (à → a)
    ["Curse of the Keep!!", "curse-of-the-keep-chronicle.md"], // trailing punctuation trimmed
    ["  Spaced   Out  ", "spaced-out-chronicle.md"], // runs collapsed, ends trimmed
    ["", "chronicle.md"], // empty name → fallback
    ["✨🔥", "chronicle.md"], // symbol-only name → fallback
  ])("slugs %j → %j", (name, expected) => {
    expect(chronicleFilename(name)).toBe(expected);
  });
});

describe("downloadChronicleMarkdown", () => {
  it("downloads the verbatim text as a text/markdown file named after the campaign", async () => {
    triggerDownload.mockClear();
    const text = "# Session 1\nThe party set out.";
    downloadChronicleMarkdown(text, "My Campaign");
    expect(triggerDownload).toHaveBeenCalledTimes(1);
    const [blob, filename] = triggerDownload.mock.calls[0] as [Blob, string];
    expect(filename).toBe("my-campaign-chronicle.md");
    expect(blob.type).toBe("text/markdown");
    // The export is a faithful mirror — the bytes are exactly the chronicle text.
    expect(await blob.text()).toBe(text);
  });
});
