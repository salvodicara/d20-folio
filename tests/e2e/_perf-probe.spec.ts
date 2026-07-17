/**
 * E2E: runtime web-vitals probe (P3 — NOT a regression test).
 *
 * Measures per-route Navigation Timing (TTFB · DOMContentLoaded · load) and the
 * core web-vitals the browser can report without a vendor SDK (FCP · LCP · CLS),
 * under a MOBILE throttling profile (4× CPU slowdown + a Slow-4G-ish network via
 * CDP), then prints a table. It adds ZERO bytes to the prod bundle: it lives in
 * the test tree and uses only the browser's own PerformanceObserver / Performance
 * Timeline + Playwright's CDP session — no `web-vitals` package, no analytics
 * vendor (zero-budget).
 *
 * It is `_`-prefixed (easy to glob/exclude) and GATED on PERF=1, so it NEVER runs
 * in `pnpm test:e2e` / CI — it is a measurement harness the perf author runs on
 * demand. The hard, CI-gating perf budget is the static one in
 * `tests/unit/bundle-budget.guard.test.ts` (eager bytes can't balloon); this probe
 * is the human-readable runtime companion that informs the ceilings.
 *
 * Run it (numbers land in stdout):
 *   PERF=1 E2E_PORT=5236 pnpm exec playwright test tests/e2e/_perf-probe.spec.ts --project=chromium
 *
 * ── A note on the bundle measured ────────────────────────────────────────────
 * The dev-bypass server (the only origin where auth is mocked) serves the DEV
 * bundle, so the absolute millisecond figures here are an UPPER bound — the prod
 * bundle (minified, split, brotli on the CDN) is materially faster. The honest
 * cold-TRANSFER weight a phone downloads is measured precisely from `dist/` (the
 * bundle inventory in docs/ARCHITECTURE.md "Performance budget (P3)") and pinned by
 * the budget guard; this probe captures the RELATIVE shape (which route paints
 * first, where layout shift hides) and the navigation-timing milestones.
 */
import { test, expect, type CDPSession, type Page } from "@playwright/test";

const PERF = process.env.PERF === "1";

type Vitals = {
  ttfb: number;
  domContentLoaded: number;
  load: number;
  fcp: number | null;
  lcp: number | null;
  cls: number;
  transferKB: number;
};

/** Apply a mobile-ish throttle: 4× CPU slowdown + Slow-4G network (CDP). */
async function throttle(client: CDPSession): Promise<void> {
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150, // ms RTT
    downloadThroughput: (1.6 * 1024 * 1024) / 8, // ~1.6 Mbps
    uploadThroughput: (750 * 1024) / 8,
  });
}

/** Navigate + collect navigation-timing + web-vitals for one route. */
async function measure(page: Page, route: string): Promise<Vitals> {
  // Install the web-vitals observers BEFORE navigation so we catch first paint.
  await page.addInitScript(() => {
    const w = window as unknown as {
      __vitals: { fcp: number | null; lcp: number | null; cls: number };
    };
    w.__vitals = { fcp: null, lcp: null, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === "first-contentful-paint") w.__vitals.fcp = e.startTime;
        }
      }).observe({ type: "paint", buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) w.__vitals.lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const ls = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!ls.hadRecentInput) w.__vitals.cls += ls.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      /* observer type unsupported — leave nulls */
    }
  });

  await page.goto(route, { waitUntil: "load" });
  // Let LCP/CLS settle a moment past load (lazy content, fonts).
  await page.waitForTimeout(1500);

  return page.evaluate(() => {
    const nav = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming;
    const w = window as unknown as {
      __vitals: { fcp: number | null; lcp: number | null; cls: number };
    };
    const resources = performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];
    const transfer = resources.reduce((s, r) => s + (r.transferSize || 0), 0);
    return {
      ttfb: Math.round(nav.responseStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      fcp: w.__vitals.fcp == null ? null : Math.round(w.__vitals.fcp),
      lcp: w.__vitals.lcp == null ? null : Math.round(w.__vitals.lcp),
      cls: Number(w.__vitals.cls.toFixed(3)),
      transferKB: Math.round(transfer / 1024),
    };
  });
}

test.describe("@perf runtime web-vitals probe (mobile throttle)", () => {
  test.skip(
    !PERF,
    "Set PERF=1 to run the runtime perf probe (it is a measurement harness)."
  );
  // Generous: throttled cold loads under CPU slowdown take a while.
  test.setTimeout(120_000);

  test("measure key routes", async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    await throttle(client);

    const routes: { name: string; path: string }[] = [
      { name: "roster (My Characters)", path: "/characters" },
      { name: "cockpit (character sheet)", path: "/characters/mock-1" },
      { name: "compendium (spells)", path: "/compendium" },
      { name: "creation wizard", path: "/characters/new" },
      { name: "campaigns", path: "/campaigns" },
    ];

    const rows: (Vitals & { route: string })[] = [];
    for (const r of routes) {
      const v = await measure(page, r.path);
      rows.push({ route: r.name, ...v });
    }

    // Print a readable table to stdout (the deliverable).
    const pad = (s: string | number, n: number) => String(s).padEnd(n);
    const padL = (s: string | number, n: number) => String(s).padStart(n);
    console.log(
      "\n──────── P3 runtime web-vitals (DEV bundle, mobile throttle 4×CPU/Slow-4G) ────────"
    );
    console.log(
      pad("route", 30) +
        padL("TTFB", 7) +
        padL("FCP", 7) +
        padL("LCP", 7) +
        padL("DCL", 7) +
        padL("load", 7) +
        padL("CLS", 7) +
        padL("xferKB", 8)
    );
    for (const r of rows) {
      console.log(
        pad(r.route, 30) +
          padL(`${r.ttfb}`, 7) +
          padL(`${r.fcp ?? "–"}`, 7) +
          padL(`${r.lcp ?? "–"}`, 7) +
          padL(`${r.domContentLoaded}`, 7) +
          padL(`${r.load}`, 7) +
          padL(`${r.cls}`, 7) +
          padL(`${r.transferKB}`, 8)
      );
    }
    console.log(
      "(ms; xferKB = uncompressed dev-server resource transfer, NOT the prod gz weight)\n"
    );

    // Sanity (not a budget): every route reached interactive with a paint.
    for (const r of rows) {
      expect(r.load, `${r.route} never fired load`).toBeGreaterThan(0);
    }
  });
});
