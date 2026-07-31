/**
 * og-image — the DYNAMIC half of the link-preview: a 1200×630 PNG rendered per
 * shared link, which `index.ts`'s `ogImage` route serves and the `og:image` tag
 * (built in `og-meta.ts`) points at. The three STATIC cards in `public/` remain the
 * FALLBACK — an unshared / locked / unknown link never reaches a render, and ANY
 * render failure redirects to the static per-type card (`index.ts`), so a broken
 * font/lib can never 500 or leak.
 *
 * HOW IT REUSES THE FOLIO IDENTITY, without an art pipeline: each rendered card is
 * the SAME hand-painted art the static card ships (`cards/og-card-*.jpg`, byte-copies
 * of `public/`, drift-guarded in the test) used as the BACKGROUND, with the static
 * card's baked-in placeholder headline masked under an opaque left panel and the
 * live entity's own text (Cinzel + Alegreya, the app's titling + display faces)
 * painted on top. So the dynamic card is the static card with the real name/level/
 * portrait swapped in for the "A CHARACTER LIVES HERE." placeholder.
 *
 * WHAT MAY BE DRAWN — the SAME exposure rule `og-meta.ts` enforces for the text tags,
 * re-stated as pixels: a character's name / total level / class(es) / effective AC /
 * max HP (all already denormalized on the roster `cache` the gate read — NEVER
 * recomputed here, so a wrong number is structurally impossible), plus its portrait
 * (fetched by `index.ts` ONLY for a confirmed `shared:true` doc — the same grant the
 * sheet itself rides); a campaign's name + party size. Nothing else is ever read.
 *
 * The SVG builders are PURE (data → string) so a unit test asserts the name landed in
 * the markup without a rasteriser; `renderSvg` is the only impure edge (fonts + resvg).
 */

import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  summarizeClasses,
  type CharacterCacheLike,
  type CampaignDocLike,
  type SharePath,
} from "./og-meta";
import { ogStrings, type OgLocale } from "./og-i18n";

const W = 1200;
const H = 630;

/** The folio palette, lifted from `src/index.css` (the gilt + parchment tokens). */
const INK = "#08060c"; // near-black panel that masks the static placeholder headline
const GOLD = "#e7cf8f"; // --gold-300-ish: brand + stat gilt
const GOLD_DIM = "#b89a52"; // muted gold: eyebrows, rules
const PARCHMENT = "#f4ecd6"; // the display-white the big headline uses
const CREAM = "#d8c89f"; // secondary line (level / class)

/**
 * The static card art, read ONCE at cold start and embedded as a data URI (resvg has
 * no network + no `public/` at runtime, so the art must ship inside the function).
 * These files are byte-copies of `public/og-card-*.jpg`; the test guards them equal.
 */
const artCache = new Map<string, string>();
function artDataUri(file: string): string {
  let uri = artCache.get(file);
  if (!uri) {
    const bytes = readFileSync(resolve(__dirname, "../cards", file));
    uri = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    artCache.set(file, uri);
  }
  return uri;
}

/** The four static font faces the resvg store loads by path (bundled under
 *  `functions/fonts/`, so they ship inside the deployed function). */
const FONT_FILES = [
  "Cinzel-700.ttf",
  "Cinzel-600.ttf",
  "Alegreya-600.ttf",
  "Alegreya-500.ttf",
].map((f) => resolve(__dirname, "../fonts", f));
// resvg's fontdb keys the fontsource statics under the PLAIN typographic family
// ("Cinzel" / "Alegreya"), selecting the weight via `font-weight` — the weight-in-name
// forms ("Alegreya SemiBold") do NOT resolve and fall back to the first-loaded face.
// So each register is a family + weight PAIR, emitted as two attributes.
// Text style tokens: `font-family` + `font-weight`, spliced straight into a <text>.
const T_BRAND = `font-family="Cinzel" font-weight="600"`; // brand wordmark (caps)
const T_EYEBROW = `font-family="Cinzel" font-weight="600"`; // section eyebrow (caps)
const T_INITIAL = `font-family="Cinzel" font-weight="700"`; // medallion initial (one cap)
const T_NAME = `font-family="Alegreya" font-weight="600"`; // the headline name
const T_SUB = `font-family="Alegreya" font-weight="500"`; // level / class line
const T_STAT = `font-family="Alegreya" font-weight="600"`; // AC · HP stat line
const DEFAULT_FAMILY = "Alegreya";

/** HTML/XML-escape — a character or campaign name is user input landing in markup. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Greedy word-wrap into at most `maxLines`, budgeted by an approximate glyph advance
 * (resvg does not wrap, and we deliberately avoid a metrics pass — the names are
 * short). A word longer than the budget is hard-broken; an overflow past the last
 * line is clipped with an ellipsis so a pathological name can never blow the frame.
 */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const chunk = line ? `${line} ${word}` : word;
    if (chunk.length <= maxChars || !line) {
      // Hard-break a single over-long word so it can't overflow on its own.
      if (!line && word.length > maxChars) {
        lines.push(word.slice(0, maxChars - 1) + "…");
        line = "";
      } else {
        line = chunk;
      }
    } else {
      lines.push(line);
      line = word;
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  // Clip an overflow tail onto the last line rather than dropping words silently.
  if (lines.length === maxLines) {
    const consumed = lines.join(" ").split(/\s+/).length;
    if (consumed < words.length) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] =
        last.length > maxChars - 1 ? last.slice(0, maxChars - 1) + "…" : last + "…";
    }
  }
  return lines.length ? lines : [""];
}

/** A stable, muted tint for the portrait-less medallion — the app's per-seed initial
 *  colour. A name hash → hue, painted dark so the gold initial reads on top. */
function seedTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  const hue = h % 360;
  return `hsl(${hue}, 32%, 20%)`;
}

/** The gilt frame + the folio wordmark, shared by both cards. */
function chrome(): string {
  return `
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none"
          stroke="${GOLD_DIM}" stroke-opacity="0.55" stroke-width="2"/>
    <rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none"
          stroke="${GOLD_DIM}" stroke-opacity="0.22" stroke-width="1"/>
    <text x="72" y="92" ${T_BRAND} font-size="30"
          letter-spacing="1.5" fill="${GOLD}">d20 Folio</text>`;
}

/** The left-panel mask that hides the static card's baked placeholder headline: opaque
 *  ink from the left edge, fading out before the art so the painting still shows. */
function leftMask(fadeStart: number, fadeEnd: number): string {
  return `
    <linearGradient id="mask" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${INK}" stop-opacity="1"/>
      <stop offset="${fadeStart}" stop-color="${INK}" stop-opacity="1"/>
      <stop offset="${fadeEnd}" stop-color="${INK}" stop-opacity="0"/>
    </linearGradient>`;
}

/** The character-image inputs — EXACTLY the roster-cache fields the gate already read
 *  (never a recompute) plus the portrait bytes (fetched only for a shared doc). */
export interface CharacterImageData {
  name: string;
  /** Total level across classes; 0 ⇒ omitted (a husk shows name only). */
  level: number;
  /** Title-cased class label(s), e.g. "Bard / Fighter"; "" ⇒ omitted. */
  classLine: string;
  /** Effective AC; 0 ⇒ unknown, omitted (never the lie "AC 0"). */
  ac: number;
  /** Max HP; 0 ⇒ unknown, omitted. */
  hp: number;
  /** The portrait as a data URI, or null ⇒ the per-seed tinted initial medallion. */
  portrait: string | null;
}

/**
 * Map a roster `cache` (the SAME blob the gate read — NEVER a recompute) + the fetched
 * portrait to the character card inputs, or `null` when the cache has no usable name
 * (the caller then serves the static fallback). AC / HP that are absent or 0 in the
 * cache stay 0 here, and the SVG omits them — a stat is shown only when it was stamped.
 */
export function characterImageData(
  cache: CharacterCacheLike & { ac?: unknown; hpMax?: unknown },
  portrait: string | null
): CharacterImageData | null {
  const name = typeof cache.name === "string" ? cache.name.trim() : "";
  if (!name) return null;
  const { level, classLine } = summarizeClasses(cache);
  const ac =
    typeof cache.ac === "number" && Number.isFinite(cache.ac) && cache.ac > 0
      ? cache.ac
      : 0;
  const hp =
    typeof cache.hpMax === "number" && Number.isFinite(cache.hpMax) && cache.hpMax > 0
      ? cache.hpMax
      : 0;
  return { name, level, classLine, ac, hp, portrait };
}

/** Build the character card SVG. Pure — the name is escaped and appears verbatim, so
 *  a test asserts on the string without rasterising. */
export function characterSvg(data: CharacterImageData, locale: OgLocale = "en"): string {
  const s = ogStrings(locale);
  // The name is a CONTENT heading, so it takes Alegreya (real lowercase) — Cinzel is
  // the ceremonial ALL-CAPS titling face, reserved here for the brand + eyebrow + the
  // single-letter initial. A proper name in Cinzel would shout in full caps.
  const nameLines = wrapText(data.name, data.name.length > 22 ? 20 : 15, 2);
  const nameSize = nameLines.length > 1 || data.name.length > 15 ? 60 : 74;
  const nameTop = 250;
  const nameEls = nameLines
    .map(
      (ln, i) =>
        `<text x="72" y="${nameTop + i * (nameSize + 6)}" ${T_NAME}` +
        ` font-size="${nameSize}" fill="${PARCHMENT}">${esc(ln)}</text>`
    )
    .join("\n    ");
  const subTop = nameTop + nameLines.length * (nameSize + 6) + 12;

  // The level / class line, and the AC · HP stat line — each part omitted when unknown
  // so a number is NEVER guessed (a 0 in the cache means "not stamped").
  const levelBits: string[] = [];
  if (data.level > 0) levelBits.push(`${s.level} ${data.level}`);
  if (data.classLine) levelBits.push(data.classLine);
  const subLine = levelBits.join(" ");
  const statBits: string[] = [];
  if (data.ac > 0) statBits.push(`${s.ac} ${data.ac}`);
  if (data.hp > 0) statBits.push(`${s.hp} ${data.hp}`);
  const statLine = statBits.join("  ·  ");

  const subEl = subLine
    ? `<text x="72" y="${subTop + 30}" ${T_SUB} font-size="36"` +
      ` fill="${CREAM}">${esc(subLine)}</text>`
    : "";
  const ruleY = subTop + (subLine ? 66 : 20);
  const statEl = statLine
    ? `<line x1="72" y1="${ruleY}" x2="560" y2="${ruleY}" stroke="${GOLD_DIM}"` +
      ` stroke-opacity="0.4" stroke-width="1"/>` +
      `<text x="72" y="${ruleY + 52}" ${T_STAT} font-size="34"` +
      ` fill="${GOLD}">${esc(statLine)}</text>`
    : "";

  // The portrait / initial medallion on the right, over the darkened art.
  const cx = 930;
  const cy = 315;
  const r = 178;
  const medallion = data.portrait
    ? `<image href="${data.portrait}" x="${cx - r}" y="${cy - r}" width="${r * 2}"` +
      ` height="${r * 2}" clip-path="url(#pclip)"` +
      ` preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${seedTint(data.name)}"/>` +
      `<text x="${cx}" y="${cy + 62}" ${T_INITIAL} font-size="180"` +
      ` fill="${GOLD}" fill-opacity="0.85" text-anchor="middle">` +
      `${esc(data.name.charAt(0).toUpperCase())}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      ${leftMask(0.5, 0.74)}
      <clipPath id="pclip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <radialGradient id="veil" cx="0.78" cy="0.5" r="0.6">
        <stop offset="0" stop-color="${INK}" stop-opacity="0"/>
        <stop offset="1" stop-color="${INK}" stop-opacity="0.72"/>
      </radialGradient>
    </defs>
    <image href="${artDataUri("og-card-character.jpg")}" x="0" y="0" width="${W}" height="${H}"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#veil)"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#mask)"/>
    ${medallion}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${GOLD}" stroke-opacity="0.7" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="none" stroke="${GOLD_DIM}" stroke-opacity="0.35" stroke-width="1.5"/>
    ${chrome()}
    <text x="72" y="188" ${T_EYEBROW} font-size="22" letter-spacing="6" fill="${GOLD_DIM}">${esc(s.sharedCharacter)}</text>
    ${nameEls}
    ${subEl}
    ${statEl}
  </svg>`;
}

/** The campaign-image inputs — name + party size, the only two facts exposed. */
export interface CampaignImageData {
  name: string;
  /** Member count (`members.length`); 0 ⇒ the party line is omitted. */
  members: number;
}

/**
 * Map a campaign document to the invite card inputs, or `null` when its joins are
 * LOCKED (the DM's leaked-link kill switch — re-checked here, exactly as
 * `campaignCard` does for the tag) or it has no usable name. Party size is the live
 * `members` array length; nothing else is read.
 */
export function campaignImageData(
  doc: CampaignDocLike & { members?: unknown }
): CampaignImageData | null {
  if (doc.joinsLocked === true) return null;
  const name = typeof doc.name === "string" ? doc.name.trim() : "";
  if (!name) return null;
  return { name, members: Array.isArray(doc.members) ? doc.members.length : 0 };
}

/** Build the invite card SVG. Pure. */
export function campaignSvg(data: CampaignImageData, locale: OgLocale = "en"): string {
  const s = ogStrings(locale);
  const nameLines = wrapText(data.name, data.name.length > 22 ? 18 : 14, 2);
  const nameSize = nameLines.length > 1 || data.name.length > 14 ? 62 : 78;
  const nameTop = 258;
  const nameEls = nameLines
    .map(
      (ln, i) =>
        `<text x="72" y="${nameTop + i * (nameSize + 4)}" ${T_NAME}` +
        ` font-size="${nameSize}" fill="${PARCHMENT}">${esc(ln)}</text>`
    )
    .join("\n    ");
  const ruleY = nameTop + nameLines.length * (nameSize + 4) + 8;
  const party = data.members > 0 ? s.atTheTable(data.members) : "";
  const partyEl = party
    ? `<text x="72" y="${ruleY + 52}" ${T_SUB} font-size="34"` +
      ` fill="${CREAM}">${esc(party)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      ${leftMask(0.42, 0.66)}
    </defs>
    <image href="${artDataUri("og-card-campaign.jpg")}" x="0" y="0" width="${W}" height="${H}"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#mask)"/>
    ${chrome()}
    <text x="72" y="192" ${T_EYEBROW} font-size="22" letter-spacing="6" fill="${GOLD_DIM}">${esc(s.invitation)}</text>
    ${nameEls}
    <line x1="72" y1="${ruleY}" x2="560" y2="${ruleY}" stroke="${GOLD_DIM}" stroke-opacity="0.4" stroke-width="1"/>
    ${partyEl}
  </svg>`;
}

/**
 * Rasterise an SVG string to a 1200-wide PNG buffer with the bundled folio fonts and
 * NO system-font fallback (the container has none we want — a missing glyph must
 * degrade within our faces, never to an arbitrary sans). The ONE impure edge; the
 * caller wraps it so a throw here falls to the static card.
 */
export function renderSvg(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: DEFAULT_FAMILY,
    },
    fitTo: { mode: "width", value: W },
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * Rasterise, swallowing ANY failure to `null` — the seam that guarantees a render
 * error (bad font, resvg throw, OOM) degrades to the static fallback card rather than
 * a 500 or a leaked stack. The route redirects to the static per-type card on `null`.
 * `render` is injectable so a test can force the throw and prove the fallback fires.
 */
export function tryRender(
  svg: string,
  render: (svg: string) => Buffer = renderSvg
): Buffer | null {
  try {
    return render(svg);
  } catch {
    return null;
  }
}

/** A strong ETag over the PNG bytes (sha1 / base64) — the value the route revalidates
 *  a crawler's `If-None-Match` against for a 304. Computed once, at cache-fill. */
export function imageEtag(png: Buffer): string {
  return `"${createHash("sha1").update(png).digest("base64")}"`;
}

/** One memoised render: the PNG, its ETag, and the epoch-ms it goes stale. */
export interface ImageMemoEntry {
  etag: string;
  png: Buffer;
  expiresAt: number;
}

/**
 * The canonical memo key for a parsed image target — the SAME entity collapses onto ONE
 * key regardless of how its path was spelled. `parseOgImagePath` drops empty segments,
 * so `/og/character/u/c.png` and `/og//character//u//c.png` parse identically; keying the
 * memo on this identity (not the raw `req.path`) folds a path-fuzzing flood onto one
 * render the way the query-agnostic key already folds a `?i=…` flood.
 */
export function ogImageKey(target: Exclude<SharePath, null>): string {
  return target.kind === "character"
    ? `character:${target.uid}:${target.charId}`
    : `campaign:${target.code}`;
}

/**
 * A tiny in-process render memo for the `ogImage` route — the DoS/cost belt.
 *
 * The render is DETERMINISTIC per parsed IDENTITY — the caller keys it on
 * {@link ogImageKey} (the `kind` + ids `parseOgImagePath` returns), NOT the raw request
 * path. That collapses two floods at once: (a) the query string, which Firebase Hosting's
 * CDN keys its cache on (docs/hosting/manage-cache — "the CDN cache your content based on
 * … the query string", with no knob to normalise it away), so a `…png?i=1,2,3…` burst is
 * a fresh CDN miss every hit; and (b) path spellings that parse to the SAME entity
 * (`/og//character//u//c.png` — empty segments filtered), which would each form a
 * DISTINCT raw-path key. Both variants share ONE identity key and re-serve the cached
 * bytes from memory. Paired with the route's `maxInstances` cap, worst-case raster work
 * is bounded regardless of the CDN key.
 *
 * BOUNDED so it can't grow unbounded (LRU by insertion order, `maxEntries`) and TTL'd
 * (~ the CDN `s-maxage`) so a revoked link can't be re-served past the CDN's own window.
 * An UNPARSEABLE path never reaches here (the route redirects to the static card before
 * the memo) and `produce` returns `null` for an ungated / failed lookup; nulls are NOT
 * cached — they redirect to the static card and never rasterise, so there is nothing
 * costly to memo. (No in-flight de-dupe: two concurrent cold hits on one key may both
 * render once before the fill lands — acceptable, and the `maxInstances` cap bounds that.)
 */
export function makeImageMemo(maxEntries: number, ttlMs: number) {
  const store = new Map<string, ImageMemoEntry>();
  return async function memo(
    key: string,
    produce: () => Promise<Buffer | null>,
    now: number = Date.now()
  ): Promise<ImageMemoEntry | null> {
    const hit = store.get(key);
    if (hit && hit.expiresAt > now) {
      // LRU touch — re-insert so a live key is evicted last.
      store.delete(key);
      store.set(key, hit);
      return hit;
    }
    if (hit) store.delete(key); // stale — drop before re-producing
    const png = await produce();
    if (!png) return null;
    const entry: ImageMemoEntry = { etag: imageEtag(png), png, expiresAt: now + ttlMs };
    store.set(key, entry);
    // Bound the map — evict the oldest (first-inserted) key once over the cap.
    if (store.size > maxEntries) {
      const oldest = store.keys().next().value as string;
      store.delete(oldest);
    }
    return entry;
  };
}
