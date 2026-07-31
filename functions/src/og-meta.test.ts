/**
 * og-meta — the pure link-preview builder behind the `ogShell` HTTP function.
 *
 * The injection tests read the REPO'S OWN `index.html`, not a hand-written shell
 * fixture (golden rule 13: a guard derives its inputs from the artifact it guards).
 * That is the whole point here — the failure this guards against is someone editing
 * `index.html` and dropping the `og:start` / `og:end` markers, which a fixture-based
 * test would never see.
 *
 * BLIND SPOTS, stated: (1) this cannot see the deployed Hosting rewrite, so "a
 * crawler actually reaches this function" is verified by curl against the emulator,
 * not here; (2) it does not exercise Firestore — `index.ts` owns that edge, so the
 * character `shared !== true` re-check there is asserted by reading the same rule
 * twice (rules suite + the guard), not by this file. The campaign side of the
 * exposure rule (name + the joins lock) lives in `campaignCard`, so it IS covered.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseSharePath,
  characterCard,
  campaignCard,
  renderOgTags,
  injectOgTags,
  shellOrigin,
  SITE,
  OG_START,
  OG_END,
} from "./og-meta";

/** The real built-from shell — the artifact the function actually injects into. */
const SHELL = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const URL = "https://d20-folio.web.app/view/u1/c1";

describe("parseSharePath", () => {
  it("recognises the two shared route families", () => {
    expect(parseSharePath("/view/uid-1/char-1")).toEqual({
      kind: "character",
      uid: "uid-1",
      charId: "char-1",
    });
    expect(parseSharePath("/join/ABC123")).toEqual({ kind: "campaign", code: "ABC123" });
  });

  it("refuses anything else, so a stray path is served the shell untouched", () => {
    for (const path of [
      "/",
      "/view",
      "/view/only-one",
      "/view/a/b/c",
      "/join",
      "/join/a/b",
      "/characters/c1",
    ]) {
      expect(parseSharePath(path)).toBeNull();
    }
  });
});

describe("characterCard", () => {
  it("reads name, TOTAL level and class off the roster cache", () => {
    const card = characterCard(
      { name: "Mara Quickfingers", classes: [{ classId: "rogue", level: 5 }] },
      URL
    );
    expect(card?.title).toBe("Mara Quickfingers — Level 5 Rogue · d20 Folio");
  });

  it("sums a multiclass and names both classes", () => {
    const card = characterCard(
      {
        name: "Lyra Voss",
        classes: [
          { classId: "bard", level: 9 },
          { classId: "fighter", level: 2 },
        ],
      },
      URL
    );
    expect(card?.title).toBe("Lyra Voss — Level 11 Bard / Fighter · d20 Folio");
  });

  it("degrades on a husk instead of inventing a level or a class", () => {
    expect(characterCard({ name: "Nameless One", classes: [] }, URL)?.title).toBe(
      "Nameless One · d20 Folio"
    );
    expect(
      characterCard({ name: "Husk", classes: [{ classId: "", level: 3 }] }, URL)?.title
    ).toBe("Husk — Level 3 · d20 Folio");
    // No usable name ⇒ no card at all; the caller then serves the shell as-built.
    expect(characterCard({ name: "   " }, URL)).toBeNull();
    expect(characterCard({}, URL)).toBeNull();
  });
});

describe("campaignCard", () => {
  it("exposes the campaign NAME and nothing else", () => {
    const card = campaignCard(
      { name: "Starless Keep" },
      "https://d20-folio.web.app/join/ABC"
    );
    expect(card?.title).toBe("Join Starless Keep on d20 Folio");
    expect(card?.description).toContain("Starless Keep");
  });

  it("returns null for a code that resolved to nothing usable", () => {
    expect(campaignCard({}, URL)).toBeNull();
    expect(campaignCard({ name: "" }, URL)).toBeNull();
    expect(campaignCard({ name: 42 }, URL)).toBeNull();
  });

  it("a LOCKED campaign unfurls as nothing — the leaked-link kill switch holds here too", () => {
    // The Admin SDK bypasses the rules that refuse the join, so the preview must
    // re-check the lock itself: locked reads exactly like a code that never existed.
    expect(campaignCard({ name: "Starless Keep", joinsLocked: true }, URL)).toBeNull();
    // Explicitly unlocked and legacy-absent both still unfurl.
    expect(
      campaignCard({ name: "Starless Keep", joinsLocked: false }, URL)
    ).not.toBeNull();
  });
});

describe("renderOgTags", () => {
  it("escapes user text — a character name lands inside an HTML attribute", () => {
    const html = renderOgTags({
      title: 'Sir "Quote" <script>&',
      description: "d & d",
      url: URL,
    });
    expect(html).toContain("&quot;Quote&quot;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain("d &amp; d");
  });

  it("carries the branded card, never a portrait", () => {
    const html = renderOgTags(campaignCard({ name: "Starless Keep" }, URL)!);
    expect(html).toContain('content="https://d20-folio.web.app/og-card.jpg"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });
});

describe("shellOrigin", () => {
  it("reads the host that actually served the request", () => {
    expect(shellOrigin({ host: "d20-folio.web.app" })).toBe("https://d20-folio.web.app");
    expect(shellOrigin({ host: "d20-folio.firebaseapp.com" })).toBe(
      "https://d20-folio.firebaseapp.com"
    );
    expect(
      shellOrigin({
        "x-forwarded-host": "d20-folio--pr9-a1b2c3.web.app",
        host: "run.app",
      })
    ).toBe("https://d20-folio--pr9-a1b2c3.web.app");
  });

  it("REFUSES a forged host — the function is public, so the header is attacker input", () => {
    // Hitting the raw *.run.app URL directly with a forged X-Forwarded-Host would
    // otherwise make the shell fetch — and therefore the 200 we reflect with CDN
    // cache headers — come from the attacker's origin.
    for (const host of [
      "evil.example",
      "d20-folio.web.app.evil.example",
      "evil.example/d20-folio.web.app",
      "notd20-folio.web.app",
      "d20-folio.web.app@evil.example",
      "localhost.evil.example",
    ]) {
      expect(shellOrigin({ "x-forwarded-host": host, host: "x.run.app" })).toBe(SITE);
    }
  });

  it("speaks http to the local emulator, which is what makes the rewrite curl-able", () => {
    expect(shellOrigin({ host: "localhost:5000" })).toBe("http://localhost:5000");
    expect(shellOrigin({ host: "127.0.0.1:5000" })).toBe("http://127.0.0.1:5000");
  });

  it("falls back to the canonical origin when there is no host at all", () => {
    expect(shellOrigin({})).toBe(SITE);
  });
});

describe("injectOgTags against the REAL index.html", () => {
  it("the shell still carries the injection markers (the thing that silently rots)", () => {
    expect(SHELL).toContain(OG_START);
    expect(SHELL).toContain(OG_END);
    expect(SHELL.indexOf(OG_START)).toBeLessThan(SHELL.indexOf(OG_END));
  });

  it("the shell's BASELINE already carries a full card, for every other route", () => {
    const baseline = SHELL.slice(SHELL.indexOf(OG_START), SHELL.indexOf(OG_END));
    for (const tag of [
      "og:type",
      "og:site_name",
      "og:title",
      "og:description",
      "og:image",
      "og:url",
      "twitter:card",
    ]) {
      expect(baseline).toContain(tag);
    }
  });

  it("replaces the baseline block with the entity's tags", () => {
    const card = characterCard(
      { name: "Mara Quickfingers", classes: [{ classId: "rogue", level: 5 }] },
      URL
    );
    const out = injectOgTags(SHELL, card!);
    expect(out).toContain(
      '<meta property="og:title" content="Mara Quickfingers — Level 5 Rogue · d20 Folio" />'
    );
    expect(out).toContain(`<meta property="og:url" content="${URL}" />`);
    // The generic title is GONE — an unfurler must not see two of them.
    expect(out).not.toContain("a living D&D 2024 character sheet");
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out).toContain("<title>Mara Quickfingers — Level 5 Rogue · d20 Folio</title>");
    // Everything outside the block survives — it is still the real app shell.
    expect(out).toContain('<div id="root">');
    expect(out).toContain('<script type="module" src="/src/main.tsx">');
  });

  it("returns a marker-less shell untouched rather than serving a broken page", () => {
    const stripped = "<html><head></head><body>hi</body></html>";
    expect(injectOgTags(stripped, campaignCard({ name: "Starless Keep" }, URL)!)).toBe(
      stripped
    );
  });
});
