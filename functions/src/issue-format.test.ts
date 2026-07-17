/**
 * issue-format — the PURE GitHub-issue formatter for bug reports (OWN-37).
 * Importable without firebase-admin / Octokit, so it's tested in isolation.
 * Pins the PRIVACY CONTRACT: the issue lands on a PUBLIC tracker, so nothing
 * identifying (uid, character/campaign ids, routes, error logs, screenshots)
 * may reach the body.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_REPO,
  formatIssueTitle,
  formatIssueBody,
  formatLabels,
  normalizeType,
  normalizeSeverity,
  parseRepo,
  publicDebugContext,
  type ReportLike,
} from "./issue-format";

const REPORT_ID = "abc123report";

/** A report carrying every identifying field a real doc can hold. */
const base: ReportLike & { reporterUid: string; screenshotUrl: string } = {
  type: "bug",
  screen: "character-cockpit",
  severity: "high",
  title: "Spell DC is wrong",
  description: "The save DC shows 14 but should be 15.",
  reporterUid: "user-123",
  screenshotUrl: "https://firebasestorage.example/bug-reports%2Fuser-123%2Fshot.png",
  locale: "en",
  debugContext: {
    url: "/characters/char-777?tab=spells",
    pathname: "/characters/char-777",
    characterId: "char-777",
    campaignId: "camp-999",
    appVersion: "0.8.0",
    gitSha: "deadbee",
    mode: "production",
    userAgent: "Mozilla/5.0 (test)",
    viewport: "1280x720",
    dpr: 2,
    theme: "dark",
    locale: "en",
    online: true,
    serviceWorker: true,
    recentErrors: [{ message: "boom at users/user-123/characters/char-777" }],
    capturedAt: 1700000000000,
  },
};

describe("normalizeType / normalizeSeverity", () => {
  it("passes through known values", () => {
    expect(normalizeType("feature")).toBe("feature");
    expect(normalizeSeverity("low")).toBe("low");
  });
  it("clamps unknown values to safe defaults", () => {
    expect(normalizeType("garbage")).toBe("other");
    expect(normalizeType(undefined)).toBe("other");
    expect(normalizeSeverity("critical")).toBe("medium");
  });
});

describe("formatIssueTitle", () => {
  it("prefixes the type tag in upper case", () => {
    expect(formatIssueTitle(base)).toBe("[BUG] Spell DC is wrong");
  });
  it("falls back when there's no title", () => {
    expect(formatIssueTitle({ type: "feature" })).toBe("[FEATURE] (no title)");
  });
  it("caps very long titles", () => {
    const long = "x".repeat(400);
    const title = formatIssueTitle({ type: "bug", title: long });
    expect(title.length).toBeLessThan(220);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("formatLabels", () => {
  it("derives type/severity/screen labels", () => {
    expect(formatLabels(base)).toEqual([
      "type:bug",
      "severity:high",
      "screen:character-cockpit",
    ]);
  });
  it("omits the screen label when absent", () => {
    expect(formatLabels({ type: "feature", severity: "low" })).toEqual([
      "type:feature",
      "severity:low",
    ]);
  });
  it("caps the screen label at GitHub's 50-char limit (a hand-crafted doc can't 400 the create)", () => {
    const labels = formatLabels({
      type: "bug",
      severity: "low",
      screen: "x".repeat(100),
    });
    const screenLabel = labels.find((l) => l.startsWith("screen:"));
    expect(screenLabel).toHaveLength(50);
  });
});

describe("publicDebugContext", () => {
  it("keeps only the allowlisted app/build/browser keys", () => {
    const pub = publicDebugContext(base.debugContext);
    expect(pub).toEqual({
      appVersion: "0.8.0",
      gitSha: "deadbee",
      mode: "production",
      userAgent: "Mozilla/5.0 (test)",
      viewport: "1280x720",
      dpr: 2,
      theme: "dark",
      locale: "en",
      online: true,
      serviceWorker: true,
      capturedAt: 1700000000000,
    });
  });
  it("drops an unknown future field by default (allowlist, not blocklist)", () => {
    const pub = publicDebugContext({ appVersion: "1.0.0", surpriseNewField: "secret" });
    expect(pub).toEqual({ appVersion: "1.0.0" });
  });
  it("is undefined for a missing or fully-private context", () => {
    expect(publicDebugContext(undefined)).toBeUndefined();
    expect(publicDebugContext({ characterId: "char-1" })).toBeUndefined();
  });
});

describe("formatIssueBody", () => {
  const body = formatIssueBody(base, REPORT_ID);

  it("keeps the user-written description and coarse metadata", () => {
    expect(body).toContain("The save DC shows 14 but should be 15.");
    expect(body).toContain("**Type:** bug");
    expect(body).toContain("**Severity:** high");
    expect(body).toContain("**Screen:** character-cockpit");
    expect(body).toContain("**Locale:** en");
  });

  it("carries the non-identifying report ref + the private-retention note", () => {
    expect(body).toContain(`**Report ref:** \`${REPORT_ID}\``);
    expect(body).toContain("Reporter details are retained privately.");
  });

  it("keeps the allowlisted debug slice", () => {
    expect(body).toContain("```json");
    expect(body).toContain('"appVersion": "0.8.0"');
    expect(body).toContain('"userAgent": "Mozilla/5.0 (test)"');
  });

  it("NEVER leaks identifying fields (the privacy strip)", () => {
    expect(body).not.toContain("user-123"); // reporter uid — anywhere
    expect(body).not.toContain("Reporter:");
    expect(body).not.toContain("char-777"); // character id (route + explicit field)
    expect(body).not.toContain("camp-999"); // campaign id
    expect(body).not.toContain("/characters/"); // route paths
    expect(body).not.toContain("recentErrors"); // error ring can quote user data
    expect(body).not.toContain("boom at users/");
    expect(body).not.toContain("firebasestorage"); // screenshot URL embeds the uid
    expect(body).not.toContain("Screenshot");
  });

  it("handles a missing description", () => {
    const minimal = formatIssueBody({ type: "bug", title: "x" }, REPORT_ID);
    expect(minimal).toContain("_No description provided._");
  });

  it("omits the debug block when nothing public remains", () => {
    const noDebug = formatIssueBody({ type: "bug", title: "x" }, REPORT_ID);
    expect(noDebug).not.toContain("Debug context");
    const allPrivate = formatIssueBody(
      { type: "bug", title: "x", debugContext: { characterId: "char-1" } },
      REPORT_ID
    );
    expect(allPrivate).not.toContain("Debug context");
  });
});

describe("parseRepo", () => {
  it("splits owner/repo", () => {
    expect(parseRepo("octocat/hello")).toEqual({ owner: "octocat", repo: "hello" });
  });
  it("falls back to DEFAULT_REPO on a malformed value", () => {
    const [owner, repo] = DEFAULT_REPO.split("/");
    expect(parseRepo("nope")).toEqual({ owner, repo });
    expect(parseRepo("")).toEqual({ owner, repo });
  });
  it("pins the default tracker", () => {
    expect(DEFAULT_REPO).toBe("salvodicara/d20-folio");
  });
});
