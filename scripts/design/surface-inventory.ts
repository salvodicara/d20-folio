/**
 * Surface inventory: every user-facing surface the design vision must cover, read
 * from the code itself (owner 2026-10-13: "every screen, dialogs, menus, everything").
 *
 * A surface is a route, or a component file that renders one of the overlay / state
 * patterns below. The checklist (`docs/design/SURFACES.md`) must list every surface
 * this scan finds; `tests/unit/surface-inventory.guard.test.ts` enforces it, so a new
 * dialog or menu cannot ship without a line on the checklist.
 *
 * What it does not see: states that live inside a surface (edit mode, dying, a
 * running encounter) and phone variants. Those are rows of kind `state`, written by
 * hand, and every row is checked on phone + laptop, dark + light.
 *
 * Run `pnpm exec tsx scripts/design/surface-inventory.ts` to print rows for surfaces
 * missing from the checklist.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type SurfaceKind =
  | "route"
  | "panel"
  | "tabs"
  | "dialog"
  | "popover"
  | "menu"
  | "listbox"
  | "picker"
  | "tooltip"
  | "notice"
  | "empty"
  | "loading"
  | "state";

export interface Surface {
  /** Stable id: `route:/path` or `<kind>:<file path under src without extension>`. */
  id: string;
  kind: SurfaceKind;
  group: string;
}

/** Patterns that make a component file a surface of that kind. */
const FILE_PATTERNS: ReadonlyArray<[Exclude<SurfaceKind, "route" | "state">, RegExp]> = [
  ["tabs", /role="tab"/],
  [
    "dialog",
    /<DialogContent\b|<RadixDialog\.Content\b|<ModalShell\b|aria-modal|role="dialog"/,
  ],
  ["popover", /<PopoverContent\b|<RadixPopover\.Content\b/],
  ["menu", /role="menu"/],
  ["listbox", /role="listbox"/],
  ["tooltip", /<RadixTooltip\.Content\b|<TooltipContent\b/],
  ["empty", /<RunicEmptyState\b/],
  ["loading", /<FolioLoader\b/],
];

/** Content panels: the sheet's tabs and the creation steps (each a full page body). */
const PANEL_FILE = /center\/tabs\/[A-Z]\w*Tab\.tsx$|creation\/steps\/[A-Z]\w*Step\.tsx$/;

/** Pickers: where the player chooses (often inline, not in a dialog). */
const PICKER_FILE = /[A-Z]\w*Picker\.tsx$|\/picker\/[A-Z]\w*\.tsx$/;

/** Live notices (toasts, banners, save state): a live region in a notice-shaped file. */
const NOTICE_LIVE = /role="(status|alert)"|aria-live=/;
const NOTICE_FILE = /(Toast|Banner|Indicator|Bar|Pip)s?\.tsx$/;

function groupOf(path: string): string {
  if (path.startsWith("route:")) {
    const p = path.slice("route:".length);
    if (p.startsWith("/campaigns") || p.startsWith("/join")) return "Campaign";
    if (p.startsWith("/compendium")) return "Compendium";
    if (p === "/characters/new" || p.includes("level-up")) return "Creation";
    if (p.startsWith("/characters") || p.startsWith("/view")) return "Character";
    return "Other";
  }
  if (/components\/ui\//.test(path)) return "System";
  if (/app\/shell\/|components\/shared\/|app\/AppShell/.test(path)) return "Shell";
  if (/features\/(creation|wizard|leveling)\//.test(path)) return "Creation";
  if (/features\/campaigns\//.test(path)) return "Campaign";
  if (/features\/compendium\//.test(path)) return "Compendium";
  if (/features\/(character|roster)\/|components\/sheet\//.test(path)) return "Character";
  return "Other";
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) out.push(full);
  }
}

/** Every surface under `srcDir` (the app's `src/`), sorted by group then id. */
export function scanSurfaces(srcDir: string): Surface[] {
  const found = new Map<string, Surface>();
  const add = (id: string, kind: SurfaceKind) =>
    found.set(id, { id, kind, group: groupOf(id) });

  const router = readFileSync(join(srcDir, "app", "router.tsx"), "utf8");
  for (const m of router.matchAll(/\bpath="([^"]+)"/g)) {
    const path = m[1] ?? "";
    // Dev-only probes are not product surfaces.
    if (path.startsWith("/_")) continue;
    add(`route:${path}`, "route");
  }

  const files: string[] = [];
  walk(srcDir, files);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(srcDir, file)
      .split(sep)
      .join("/")
      .replace(/\.tsx$/, "");
    for (const [kind, re] of FILE_PATTERNS) {
      if (re.test(text)) add(`${kind}:${rel}`, kind);
    }
    if (NOTICE_FILE.test(file) && NOTICE_LIVE.test(text)) add(`notice:${rel}`, "notice");
    const posix = file.split(sep).join("/");
    if (PANEL_FILE.test(posix)) add(`panel:${rel}`, "panel");
    if (PICKER_FILE.test(posix)) add(`picker:${rel}`, "picker");
  }

  return [...found.values()].sort(
    (a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id)
  );
}

/** The surface ids listed in the checklist's table (first column, in backticks). */
export function checklistIds(markdown: string): Map<string, SurfaceKind> {
  const ids = new Map<string, SurfaceKind>();
  for (const line of markdown.split("\n")) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|/);
    const id = m?.[1];
    if (!id) continue;
    ids.set(id, id.slice(0, id.indexOf(":")) as SurfaceKind);
  }
  return ids;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /surface-inventory\.ts$/.test(process.argv[1]);
if (isMain) {
  const root = join(import.meta.dirname, "..", "..");
  const listed = checklistIds(
    readFileSync(join(root, "docs", "design", "SURFACES.md"), "utf8")
  );
  for (const s of scanSurfaces(join(root, "src"))) {
    if (!listed.has(s.id)) console.log(`| \`${s.id}\` | ${s.group} | todo |`);
  }
}
