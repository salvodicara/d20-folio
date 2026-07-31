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
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSharePath,
  parseOgImagePath,
  characterCard,
  campaignCard,
  characterImageUrl,
  campaignImageUrl,
  renderOgTags,
  injectOgTags,
  shellOrigin,
  SITE,
  CARD_GENERIC,
  CARD_CHARACTER,
  CARD_CAMPAIGN,
  OG_START,
  OG_END,
} from "./og-meta";

/** The real built-from shell — the artifact the function actually injects into. */
const SHELL = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const URL = "https://d20-folio.web.app/view/u1/c1";
/** The dynamic image URLs the two card families now point their `og:image` at. */
const CHAR_IMG = characterImageUrl("u1", "c1");
const CAMP_IMG = campaignImageUrl("ABC");

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
      URL,
      CHAR_IMG
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
      URL,
      CHAR_IMG
    );
    expect(card?.title).toBe("Lyra Voss — Level 11 Bard / Fighter · d20 Folio");
  });

  it("points og:image at the DYNAMIC per-link route, not the static card", () => {
    const card = characterCard({ name: "Mara", classes: [] }, URL, CHAR_IMG);
    expect(card?.image).toBe(CHAR_IMG);
    expect(CHAR_IMG).toBe(`${SITE}/og/character/u1/c1.png`);
  });

  it("degrades on a husk instead of inventing a level or a class", () => {
    expect(
      characterCard({ name: "Nameless One", classes: [] }, URL, CHAR_IMG)?.title
    ).toBe("Nameless One · d20 Folio");
    expect(
      characterCard({ name: "Husk", classes: [{ classId: "", level: 3 }] }, URL, CHAR_IMG)
        ?.title
    ).toBe("Husk — Level 3 · d20 Folio");
    // No usable name ⇒ no card at all; the caller then serves the shell as-built.
    expect(characterCard({ name: "   " }, URL, CHAR_IMG)).toBeNull();
    expect(characterCard({}, URL, CHAR_IMG)).toBeNull();
  });
});

describe("campaignCard", () => {
  it("exposes the campaign NAME and nothing else", () => {
    const card = campaignCard(
      { name: "Starless Keep" },
      "https://d20-folio.web.app/join/ABC",
      CAMP_IMG
    );
    expect(card?.title).toBe("Join Starless Keep on d20 Folio");
    expect(card?.description).toContain("Starless Keep");
    expect(card?.image).toBe(CAMP_IMG);
    expect(CAMP_IMG).toBe(`${SITE}/og/campaign/ABC.png`);
  });

  it("returns null for a code that resolved to nothing usable", () => {
    expect(campaignCard({}, URL, CAMP_IMG)).toBeNull();
    expect(campaignCard({ name: "" }, URL, CAMP_IMG)).toBeNull();
    expect(campaignCard({ name: 42 }, URL, CAMP_IMG)).toBeNull();
  });

  it("a LOCKED campaign unfurls as nothing — the leaked-link kill switch holds here too", () => {
    // The Admin SDK bypasses the rules that refuse the join, so the preview must
    // re-check the lock itself: locked reads exactly like a code that never existed.
    expect(
      campaignCard({ name: "Starless Keep", joinsLocked: true }, URL, CAMP_IMG)
    ).toBeNull();
    // Explicitly unlocked and legacy-absent both still unfurl.
    expect(
      campaignCard({ name: "Starless Keep", joinsLocked: false }, URL, CAMP_IMG)
    ).not.toBeNull();
  });
});

describe("owner-locale meta (the OWNER's stored locale, EN default + fallback)", () => {
  it("an IT owner gets IT title WORD + description; class label stays as-is", () => {
    const card = characterCard(
      { name: "Mara Quickfingers", classes: [{ classId: "rogue", level: 5 }] },
      URL,
      CHAR_IMG,
      "it"
    );
    // "Livello" localises; "Rogue" (the class label) is kept as-is by design.
    expect(card?.title).toBe("Mara Quickfingers — Livello 5 Rogue · d20 Folio");
    expect(card?.description).toBe(
      "Conosci Mara Quickfingers, una scheda vivente su d20 Folio. Lettura gratuita, nessun account. Un compagno per D&D 2024."
    );
  });

  it("EN owner (and the absent-locale default) render the English card", () => {
    const en = characterCard(
      { name: "Mara", classes: [{ classId: "rogue", level: 5 }] },
      URL,
      CHAR_IMG,
      "en"
    );
    const def = characterCard(
      { name: "Mara", classes: [{ classId: "rogue", level: 5 }] },
      URL,
      CHAR_IMG
    );
    expect(en?.title).toBe("Mara — Level 5 Rogue · d20 Folio");
    expect(def?.title).toBe(en?.title); // default === EN (the fallback on any read failure)
  });

  it("an IT owner gets the IT invite title + description", () => {
    const card = campaignCard({ name: "Starless Keep" }, URL, CAMP_IMG, "it");
    expect(card?.title).toBe("Unisciti a Starless Keep su d20 Folio");
    expect(card?.description).toBe(
      "Prendi posto al tavolo di Starless Keep su d20 Folio, un compagno gratuito e offline-first per D&D 2024."
    );
  });
});

describe("compatibility phrasing — the OG surface states compatibility, never branding", () => {
  // Owner-ratified (2026-07-31): "for D&D 2024", never a form that reads as an official
  // "D&D 2024 product". A guard so the nominative phrasing can't regress back.
  it("the EN static baseline in the REAL index.html reads FOR D&D 2024, not branded", () => {
    // The nominative/compatibility form is present…
    expect(SHELL).toContain("a living character sheet for D&D 2024");
    expect(SHELL).toContain("A modern character sheet manager for D&D 2024");
    // …and the branding forms are GONE.
    expect(SHELL).not.toContain("a living D&D 2024 character sheet");
    expect(SHELL).not.toContain("D&D 2024 character sheet manager");
    expect(SHELL).not.toContain("your D&D 2024 characters");
  });

  it("the campaign meta description states compatibility, not a D&D 2024 companion", () => {
    const card = campaignCard({ name: "Starless Keep" }, URL, CAMP_IMG);
    expect(card?.description).toContain("companion for D&D 2024");
    expect(card?.description).not.toContain("D&D 2024 companion");
  });
});

describe("renderOgTags", () => {
  it("escapes user text — a character name lands inside an HTML attribute", () => {
    const html = renderOgTags({
      title: 'Sir "Quote" <script>&',
      description: "d & d",
      url: URL,
      image: `${SITE}/og-card.jpg`,
    });
    expect(html).toContain("&quot;Quote&quot;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain("d &amp; d");
  });

  it("carries the DYNAMIC image URL, and never a portrait in the tag itself", () => {
    const html = renderOgTags(campaignCard({ name: "Starless Keep" }, URL, CAMP_IMG)!);
    expect(html).toContain(`content="${CAMP_IMG}"`);
    // The portrait, if any, is baked into the rendered PNG — never a tag value.
    expect(html).not.toContain("portrait");
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });
});

describe("the type routes — one dynamic image per family, static cards as the fallback", () => {
  const CHARACTER = characterCard({ name: "Mara", classes: [] }, URL, CHAR_IMG)!;
  const CAMPAIGN = campaignCard({ name: "Starless Keep" }, URL, CAMP_IMG)!;
  /** The baseline block in the real shell — the generic card, served card-less. */
  const BASELINE = SHELL.slice(SHELL.indexOf(OG_START), SHELL.indexOf(OG_END));

  it("a shared character points og:image at its dynamic PNG route", () => {
    expect(CHARACTER.image).toBe(CHAR_IMG);
    expect(renderOgTags(CHARACTER)).toContain(
      `<meta property="og:image" content="${CHAR_IMG}" />`
    );
  });

  it("a live invite points og:image at its dynamic PNG route", () => {
    expect(CAMPAIGN.image).toBe(CAMP_IMG);
    expect(renderOgTags(CAMPAIGN)).toContain(
      `<meta property="og:image" content="${CAMP_IMG}" />`
    );
  });

  it("the card-less path still keeps the GENERIC static card, and the three routes stay distinct", () => {
    // Unshared / locked / unknown is served the shell untouched, so the baseline block
    // IS the generic variant — indistinguishable from any other route.
    expect(BASELINE).toContain(CARD_GENERIC);
    expect(new Set([CHARACTER.image, CAMPAIGN.image, CARD_GENERIC]).size).toBe(3);
  });

  it("the three STATIC fallback cards are files that actually ship in public/", () => {
    // Each is what the ogImage route redirects to on an unshared / locked / errored
    // request; a renamed or unshipped card would break that fallback silently.
    for (const image of [CARD_CHARACTER, CARD_CAMPAIGN, CARD_GENERIC]) {
      const file = resolve(__dirname, "../../public", image.slice(SITE.length + 1));
      expect(existsSync(file), `missing ${file}`).toBe(true);
    }
  });
});

describe("parseOgImagePath — the dynamic image route's own path parser", () => {
  it("recognises the two image route families and strips the .png", () => {
    expect(parseOgImagePath("/og/character/uid-1/char-1.png")).toEqual({
      kind: "character",
      uid: "uid-1",
      charId: "char-1",
    });
    expect(parseOgImagePath("/og/campaign/ABC123.png")).toEqual({
      kind: "campaign",
      code: "ABC123",
    });
  });

  it("decodes percent-encoded ids (the URL builders encode them)", () => {
    expect(parseOgImagePath("/og/campaign/A%2FB.png")).toEqual({
      kind: "campaign",
      code: "A/B",
    });
  });

  it("refuses anything else, so a stray path serves the generic static card", () => {
    for (const path of [
      "/og",
      "/og/character",
      "/og/character/only-one.png",
      "/og/character/a/b/c.png",
      "/og/campaign",
      "/og/campaign/a/b.png",
      "/view/u/c",
    ]) {
      expect(parseOgImagePath(path)).toBeNull();
    }
  });
});

describe("shellOrigin", () => {
  // The cloud runtime has no FUNCTIONS_EMULATOR, so the default here is production.
  afterEach(() => vi.unstubAllEnvs());

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
    vi.stubEnv("FUNCTIONS_EMULATOR", "true");
    expect(shellOrigin({ host: "localhost:5000" })).toBe("http://localhost:5000");
    expect(shellOrigin({ host: "127.0.0.1:5000" })).toBe("http://127.0.0.1:5000");
  });

  it("REFUSES loopback in the cloud — it would be the function's own port (self-SSRF)", () => {
    // Deployed, `127.0.0.1:8080` IS this container: the shell fetch would re-enter
    // ogShell, which would fetch itself again — a chain of legs each hanging to
    // timeout, i.e. billed time on a zero-budget project. The carve-out is the
    // emulator's alone, so the env var (unset in the cloud runtime) is the gate.
    for (const host of ["127.0.0.1:8080", "localhost:8080", "[::1]:8080", "0.0.0.0"]) {
      expect(shellOrigin({ "x-forwarded-host": host, host: "x.run.app" })).toBe(SITE);
    }
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
      URL,
      CHAR_IMG
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

  it("NO card ⇒ the shell byte-for-byte, which IS the generic variant", () => {
    // The unshared / locked / unknown path. Not "a generic card rebuilt to look like
    // the baseline" — the baseline itself, so those links are indistinguishable from
    // every other route and the copy has nowhere to drift to.
    expect(injectOgTags(SHELL, null)).toBe(SHELL);
    expect(SHELL).toContain("a living character sheet for D&D 2024");
  });

  it("returns a marker-less shell untouched rather than serving a broken page", () => {
    const stripped = "<html><head></head><body>hi</body></html>";
    expect(
      injectOgTags(stripped, campaignCard({ name: "Starless Keep" }, URL, CAMP_IMG)!)
    ).toBe(stripped);
  });
});
