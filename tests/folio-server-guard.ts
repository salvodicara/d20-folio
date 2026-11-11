/**
 * Refuse to run e2e against a server that is not Folio.
 *
 * Locally `reuseExistingServer` is on, so when another app already holds an e2e
 * port, Playwright skips booting Vite and silently tests THAT app. Every
 * playwright*.config.ts passes its servers through `folioServers()` and sets
 * `globalSetup: FOLIO_SERVER_GUARD`; the setup runs once the servers are up and
 * fails the run unless each one serves Folio's index.html (its `og:site_name`).
 */
import type { PlaywrightTestConfig } from "@playwright/test";

type WebServer = Extract<
  NonNullable<PlaywrightTestConfig["webServer"]>,
  { url?: string }
>;

/** The marker only Folio's index.html carries (dev server and preview alike). */
const FOLIO_MARKER = /<meta property="og:site_name" content="d20 Folio"/;
const URLS_ENV = "FOLIO_E2E_SERVER_GUARD";

export const FOLIO_SERVER_GUARD = "./tests/folio-server-guard.ts";

/**
 * Record which servers the guard must check. `portEnv` names the variable that
 * moves this config's port, for the error message.
 */
export function folioServers<T extends WebServer>(portEnv: string, servers: T[]): T[] {
  process.env[URLS_ENV] = JSON.stringify({
    portEnv,
    urls: servers.map((server) => server.url),
  });
  return servers;
}

/**
 * The page at `url`. «localhost» may name an IPv4 or an IPv6 address, and a server
 * may listen on only one of them (in the CI container Vite answers on one, Node's
 * fetch tries the other first). Like Playwright's own readiness check, try both.
 */
async function fetchPage(url: string): Promise<string> {
  const parsed = new URL(url);
  const hosts =
    parsed.hostname === "localhost"
      ? ["localhost", "127.0.0.1", "[::1]"]
      : [parsed.hostname];
  let lastError: unknown;
  for (const host of hosts) {
    try {
      const response = await fetch(url.replace(parsed.hostname, host));
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  // Unreachable is not "another app": say why, so the fix is the right one.
  const cause = (lastError as { cause?: { code?: string; message?: string } }).cause;
  throw new Error(
    `e2e: ${url} did not answer (${cause?.code ?? cause?.message ?? String(lastError)}).`
  );
}

export default async function guardFolioServers(): Promise<void> {
  const raw = process.env[URLS_ENV];
  if (!raw) throw new Error(`folio-server-guard: no servers recorded (${URLS_ENV}).`);
  const { portEnv, urls } = JSON.parse(raw) as { portEnv: string; urls: string[] };
  for (const url of urls) {
    const html = await fetchPage(url);
    if (!FOLIO_MARKER.test(html)) {
      const port = new URL(url).port;
      throw new Error(
        `e2e: port ${port} is held by another app (${url} is not d20 Folio); set ${portEnv} to a free port.`
      );
    }
  }
}
