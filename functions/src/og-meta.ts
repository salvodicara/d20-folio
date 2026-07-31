/**
 * og-meta — the PURE half of the link-preview shell (`ogShell` in `index.ts`).
 *
 * A crawler (WhatsApp, Discord, Slack, iMessage, Telegram, X, Google) fetches a
 * shared URL once, with NO JavaScript, and reads whatever `<meta>` tags come back in
 * the HTML. A client-rendered SPA therefore cannot have per-link previews on its
 * own: every URL would unfurl as the same generic card. This module builds the tags
 * for one shared entity and splices them into the built `index.html` between its
 * `og:start` / `og:end` markers; `index.ts` owns the HTTP + Firestore edges.
 *
 * Everything here is a pure function so it is unit-tested without an emulator, the
 * convention every other function in this package follows.
 *
 * WHAT MAY BE EXPOSED — the rule this module enforces:
 *   · a character: ONLY when its document carries `shared: true`, and only its name,
 *     total level and class. An unshared, unknown or malformed id falls back to the
 *     generic branded card — never a leak, never a "not found" that confirms an id.
 *   · a campaign: ONLY its name, and only for an invite code that resolves AND whose
 *     joins are still open. The invite code IS the campaign's document id, i.e. the
 *     same secret the join flow already treats as the grant.
 * Nothing else from either document is ever read into a tag. Anything that fails the
 * rule yields NO card, and the caller then serves the shell untouched — the baseline
 * branded card every other route already gets.
 */

/** The canonical public origin — what `og:url` always points at, whichever host
 *  (production, a preview channel, the local emulator) actually served the page. */
export const SITE = "https://d20-folio.web.app";
const BRAND = "d20 Folio";
/** The branded 1200×630 card. Every preview uses it — portraits are not exposed. */
const CARD = `${SITE}/og-card.jpg`;

/** The two shared route families, as parsed off the request path. */
export type SharePath =
  | { kind: "character"; uid: string; charId: string }
  | { kind: "campaign"; code: string }
  | null;

/**
 * Which shared entity (if any) a request path names. Anything else — a deeper path,
 * a missing segment — is `null`, which the caller serves as the generic card rather
 * than an error: a preview must never be a 404 page.
 */
export function parseSharePath(pathname: string): SharePath {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "view" && parts.length === 3 && parts[1] && parts[2]) {
    return { kind: "character", uid: parts[1], charId: parts[2] };
  }
  if (parts[0] === "join" && parts.length === 2 && parts[1]) {
    return { kind: "campaign", code: parts[1] };
  }
  return null;
}

/** The tag values one preview card carries. */
export interface OgCard {
  title: string;
  description: string;
  url: string;
}

/** The `cache` projection a character document carries (see `character-cache.ts`). */
export interface CharacterCacheLike {
  name?: unknown;
  classes?: unknown;
}

/**
 * `classId` → an English label for the preview line. The SRD class ids ARE their
 * lowercased English names, so title-casing is the derivation, not a stored display
 * string (golden rule 7) — and the OG card is EN-only by the owner's decision, so
 * there is no locale to resolve against. BLIND SPOT: a hyphenated homebrew id
 * ("blood-hunter") renders as "Blood Hunter", which is right by luck rather than by
 * lookup; an id that is not its own English name would render wrong.
 */
function classLabel(classId: string): string {
  return classId
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * "Mara Quickfingers — Level 5 Rogue · d20 Folio" from the roster cache. Multiclass
 * sums the levels and joins the classes; a husk with no usable class degrades to the
 * bare level, and a cache with no usable name is rejected by the caller.
 */
export function characterCard(cache: CharacterCacheLike, url: string): OgCard | null {
  const name = typeof cache.name === "string" ? cache.name.trim() : "";
  if (!name) return null;
  const entries = Array.isArray(cache.classes) ? cache.classes : [];
  let level = 0;
  const labels: string[] = [];
  for (const raw of entries) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as { classId?: unknown; level?: unknown };
    if (typeof entry.level === "number" && Number.isFinite(entry.level)) {
      level += entry.level;
    }
    if (typeof entry.classId === "string" && entry.classId) {
      labels.push(classLabel(entry.classId));
    }
  }
  const classes = labels.join(" / ");
  const line = level > 0 ? `Level ${level}${classes ? ` ${classes}` : ""}` : classes;
  return {
    title: line ? `${name} — ${line} · ${BRAND}` : `${name} · ${BRAND}`,
    description: `${name}'s character sheet on ${BRAND}, shared read-only. No account needed.`,
    url,
  };
}

/** The fields an invite preview may look at on a campaign document. */
export interface CampaignDocLike {
  name?: unknown;
  joinsLocked?: unknown;
}

/**
 * "Join «Campaign» on d20 Folio" — the campaign's NAME and nothing else.
 *
 * `joinsLocked` is the DM's kill switch for a leaked invite link: once set, the link
 * admits nobody (`firestore.rules` refuses the self-join). The Admin SDK bypasses
 * those rules, so the lock is re-checked HERE — a locked campaign yields no card and
 * is therefore indistinguishable from a code that never existed, which is the same
 * rule the character branch follows.
 */
export function campaignCard(doc: CampaignDocLike, url: string): OgCard | null {
  if (doc.joinsLocked === true) return null;
  const clean = typeof doc.name === "string" ? doc.name.trim() : "";
  if (!clean) return null;
  return {
    title: `Join ${clean} on ${BRAND}`,
    description: `You have been invited to the ${clean} table on ${BRAND} — a free, offline-first D&D 2024 companion.`,
    url,
  };
}

/** HTML-attribute escaping — a character name is user input and lands in `content`. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The full `<meta>` block for one card, in the shell's own tag order. */
export function renderOgTags(card: OgCard): string {
  const title = esc(card.title);
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${esc(card.description)}" />`,
    `<meta property="og:image" content="${CARD}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${title}" />`,
    `<meta property="og:url" content="${esc(card.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    // The document title matters too: several unfurlers fall back to <title>.
    `<title>${title}</title>`,
  ].join("\n    ");
}

export const OG_START = "<!-- og:start -->";
export const OG_END = "<!-- og:end -->";

/**
 * Splice a card's tags into the built shell, replacing the baseline block between
 * the markers AND the shell's own `<title>` (the injected block carries its own, so
 * leaving the original would give the document two).
 *
 * A shell WITHOUT the markers is returned untouched — a build that lost them must
 * still serve a working page, just with the generic card (the deploy-time guard test
 * is what stops that shipping silently).
 */
export function injectOgTags(shell: string, card: OgCard): string {
  const start = shell.indexOf(OG_START);
  const end = shell.indexOf(OG_END);
  if (start === -1 || end === -1 || end < start) return shell;
  const head = shell.slice(0, start);
  const tail = shell.slice(end + OG_END.length);
  return (
    head +
    OG_START +
    "\n    " +
    renderOgTags(card) +
    "\n    " +
    OG_END +
    // The baseline shell's own <title> now lives AFTER the block; drop it so the
    // injected one is the only title in the document.
    tail.replace(/\n?\s*<title>[^<]*<\/title>/, "")
  );
}

/**
 * The hosts a shell may be fetched from: production, a Firebase preview channel
 * (`d20-folio--<channel>-<hash>.web.app`), and the local emulator.
 *
 * `ogShell` MUST allow unauthenticated invocation (the Hosting rewrite needs it), so
 * its raw `*.run.app` URL is reachable directly and `x-forwarded-host` is attacker-
 * settable there. Without this allowlist a forged host would make the function fetch
 * `https://evil.example/index.html` and reflect that attacker HTML back with 200 +
 * CDN cache headers. Anything unrecognised falls back to {@link SITE}.
 */
const ALLOWED_HOST =
  /^(?:d20-folio(?:--[a-z0-9-]+)?\.web\.app|d20-folio\.firebaseapp\.com|localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(?::\d+)?$/i;

/**
 * The origin to fetch the built shell FROM — the host that actually served this
 * request, so the emulator reads the emulator's `dist/` and a preview channel reads
 * its own. Distinct from {@link SITE}, which is what `og:url` advertises. Hosting
 * fronts the function, so the forwarded headers are the truth ONCE the host is one of
 * ours ({@link ALLOWED_HOST}); the localhost / loopback carve-out is what makes
 * `firebase emulators:start` verifiable with curl.
 */
export function shellOrigin(headers: Record<string, string | undefined>): string {
  const host = headers["x-forwarded-host"] ?? headers["host"];
  if (!host || !ALLOWED_HOST.test(host)) return SITE;
  const local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host);
  const proto = headers["x-forwarded-proto"] ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}
