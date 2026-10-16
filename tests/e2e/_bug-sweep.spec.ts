/**
 * Bug sweep (NOT a regression test): every manifest surface on phone + laptop, dark +
 * light, IT + EN, checked in the real browser for the defects the owner counts as bugs
 * (2026-10-13: "visual bugs and UI/UX problems are bugs too"):
 *   overflow  — the page scrolls sideways
 *   tiny      — visible text under 10px
 *   clipped   — text cut by its box (overflow hidden/clip, or an ellipsis)
 *   covered   — a visible control whose centre is covered by another element
 *   untranslated — a raw i18n key, the missing-key sentinel, or (IT) an EN-only UI string
 * Gated on BUG_SWEEP_DIR; writes one JSON per run (+ a screenshot when it finds
 * something). Aggregate with the sibling script.
 */
import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SURFACES,
  VARIANTS,
  DESKTOP,
  MOBILE,
  freezeMotion,
  seedLang,
  seedUI,
  settleForShot,
  type Locale,
  type Theme,
} from "./surfaces";

const DIR = process.env.BUG_SWEEP_DIR ?? "";
test.skip(!DIR, "BUG_SWEEP_DIR is not set — sweep disabled.");
test.beforeAll(() => {
  if (DIR) fs.mkdirSync(DIR, { recursive: true });
});

const here = path.dirname(fileURLToPath(import.meta.url));
function flatten(obj: unknown, prefix = "", out = new Map<string, string>()) {
  if (typeof obj === "string") out.set(prefix, obj);
  else if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj))
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}
function catalogue(lang: string) {
  const dir = path.resolve(here, `../../src/i18n/${lang}/ui`);
  const out = new Map<string, string>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")))
    flatten(JSON.parse(readFileSync(path.join(dir, f), "utf8")), "", out);
  return out;
}
const EN = catalogue("en");
const IT = catalogue("it");
// EN-only UI strings: multi-word, no interpolation, and different from their IT twin.
const EN_ONLY = [...EN.entries()]
  .filter(([k, v]) => {
    const it = IT.get(k);
    return (
      it !== undefined &&
      it !== v &&
      !/[{<]/.test(v) &&
      /^[A-Z][a-z]+(?: [A-Za-z']+){1,5}$/.test(v) &&
      v.length >= 9
    );
  })
  .map(([, v]) => v);
const NAMESPACES = readdirSync(path.resolve(here, "../../src/i18n/en/ui"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const CHECK = ({
  locale,
  enOnly,
  namespaces,
}: {
  locale: string;
  enOnly: string[];
  namespaces: string[];
}) => {
  const issues: { kind: string; detail: string }[] = [];
  const vw = window.innerWidth;
  const se = document.scrollingElement ?? document.documentElement;
  if (se.scrollWidth > vw + 1)
    issues.push({ kind: "overflow", detail: `scrollWidth ${se.scrollWidth} > ${vw}` });
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return (
      cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05
    );
  };
  const label = (el: Element) =>
    `${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(/\s+/).slice(0, 2).join(".")} "${(el.textContent || "").trim().slice(0, 40)}"`;
  // The topmost layer: an open dialog/menu when there is one, else the page.
  const layers = [
    ...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]'),
  ].filter(visible);
  const scope: Element = layers.at(-1) ?? document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent || "").trim();
    const el = n.parentElement;
    if (!t || !el || seen.has(el) || !visible(el)) continue;
    if (el.closest('.sr-only, [aria-hidden="true"], script, style, svg')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    if (fs < 9.95) issues.push({ kind: "tiny", detail: `${fs}px ${label(el)}` });
    // clipped: walk up to 3 ancestors for a clipping box narrower than its content
    let box: Element | null = el;
    for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
      const bs = getComputedStyle(box);
      const clips = /(hidden|clip)/.test(bs.overflowX) || bs.textOverflow === "ellipsis";
      if (
        (clips && box.scrollWidth > box.clientWidth + 1 && bs.whiteSpace !== "normal") ||
        (clips && bs.textOverflow === "ellipsis" && box.scrollWidth > box.clientWidth + 1)
      ) {
        issues.push({
          kind: "clipped",
          detail: `${box.scrollWidth}>${box.clientWidth} ${label(box)}`,
        });
        break;
      }
    }
  }
  // covered controls (in viewport, in the top layer)
  for (const el of scope.querySelectorAll(
    'button, a[href], input, select, textarea, [role="tab"], [role="menuitem"], [role="option"]'
  )) {
    if (!visible(el) || (el as HTMLButtonElement).disabled) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > vw || cy > window.innerHeight) continue;
    // Skip a control clipped out of view by a scrolling/collapsed ancestor.
    let clippedOut = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (/(hidden|clip|auto|scroll)/.test(as.overflowY + as.overflowX)) {
        const ar = a.getBoundingClientRect();
        if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) {
          clippedOut = true;
          break;
        }
      }
    }
    if (clippedOut) continue;
    const hit = document.elementFromPoint(cx, cy);
    // The sticky topbar, the phone nav and a transient toast cover scrolled content by design.
    if (hit && hit.closest(".topbar, .m-nav, .toast-region, .toast")) continue;
    if (
      hit &&
      !el.contains(hit) &&
      !hit.contains(el) &&
      !(el as HTMLElement).closest("label")?.contains(hit)
    ) {
      const fixed = (x: Element | null) => {
        for (; x; x = x.parentElement) {
          const p = getComputedStyle(x).position;
          if (p === "fixed" || p === "sticky") return true;
        }
        return false;
      };
      issues.push({
        kind: "covered",
        detail: `${label(el)} under ${label(hit)}${fixed(hit) ? " (fixed/sticky)" : ""}`,
      });
    }
  }
  const text = (scope as HTMLElement).innerText || "";
  const rawKey = new RegExp(
    `\\b(?:${namespaces.join("|")})(?:\\.[a-zA-Z][a-zA-Z0-9_]*){1,}\\b`
  );
  const mk = text.match(rawKey);
  if (mk) issues.push({ kind: "untranslated", detail: `raw key ${mk[0]}` });
  if (/⟦[^⟧]+⟧/.test(text))
    issues.push({ kind: "untranslated", detail: "missing-key sentinel" });
  if (locale === "it") {
    for (const s of enOnly) {
      const re = new RegExp(
        `(^|[^A-Za-zÀ-ÿ])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-zÀ-ÿ])`
      );
      if (re.test(text))
        issues.push({ kind: "untranslated", detail: `EN in IT: "${s}"` });
    }
  }
  return issues;
};

const COMBOS: { locale: Locale; theme: Theme; device: "desktop" | "mobile" }[] = [];
for (const locale of ["it", "en"] as Locale[])
  for (const theme of ["dark", "light"] as Theme[])
    for (const device of ["desktop", "mobile"] as const)
      COMBOS.push({ locale, theme, device });

for (const surface of SURFACES) {
  const variants = surface.variants;
  const allowed = variants
    ? VARIANTS.filter((v) => variants.includes(v.key)).map((v) => v.device)
    : ["desktop", "mobile"];
  for (const combo of COMBOS.filter((c) => allowed.includes(c.device))) {
    const tag = `${surface.slug}-${combo.locale}-${combo.theme}-${combo.device}`;
    test(tag, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(combo.device === "desktop" ? DESKTOP : MOBILE);
      await seedUI(page, combo.theme, surface.edit ? "edit" : "play");
      await seedLang(page, combo.locale);
      await page.goto(surface.route);
      await surface.ready(page);
      if (surface.prepare) await surface.prepare(page);
      await freezeMotion(page);
      await settleForShot(page);
      const found = await page.evaluate(CHECK, {
        locale: combo.locale,
        enOnly: EN_ONLY,
        namespaces: NAMESPACES,
      });
      fs.writeFileSync(
        path.join(DIR, `${tag}.json`),
        JSON.stringify({ tag, issues: found })
      );
      if (found.length) await page.screenshot({ path: path.join(DIR, `${tag}.png`) });
    });
  }
}

// ── Surfaces outside the manifest (the inventory's remainder), each opened by hand ──
type Extra = {
  slug: string;
  route: string;
  flags?: Record<string, string>;
  edit?: boolean;
  offline?: boolean;
  prepare?: (page: import("@playwright/test").Page) => Promise<void>;
};
const EN_IT = (en: string, it: string) => new RegExp(`^(${en}|${it})`, "i");
const click = async (page: import("@playwright/test").Page, re: RegExp) =>
  page.getByRole("button", { name: re }).first().click({ timeout: 15_000 });
// On a phone the rail lives behind the "Resources" fold; open it first.
const railFirst = async (page: import("@playwright/test").Page) => {
  const fold = page.getByRole("button", { name: /^(resources|risorse)$/i }).first();
  if (await fold.isVisible().catch(() => false)) await fold.click();
};
const clickVisible = async (page: import("@playwright/test").Page, re: RegExp) =>
  page
    .getByRole("button", { name: re })
    .filter({ visible: true })
    .first()
    .click({ timeout: 15_000 });
const EXTRAS: Extra[] = [
  {
    slug: "x-damage-tray",
    route: "/characters/mock-1?tab=play",
    prepare: async (p) => {
      await clickVisible(p, /^(all|tutti)$/i);
      await clickVisible(p, /^(Cast: Healing Word|Lancia: Parola Guaritrice)/);
      const slot = p
        .getByRole("button", { name: /(Level 1 slot|Slot di livello 1)/ })
        .first();
      if (await slot.isVisible().catch(() => false)) await slot.click();
      await p.getByTestId("damage-tray").waitFor({ timeout: 15_000 });
    },
  },
  {
    slug: "x-target-step",
    route: "/characters/scn-evoker-wizard?tab=play",
    flags: { "d20-dev-combat-chronicle": "1" },
    prepare: async (p) => {
      await clickVisible(p, /^(all|tutti)$/i);
      await clickVisible(p, /^(Cast: Fireball|Lancia: Palla di Fuoco)/);
      const slot = p
        .getByRole("dialog")
        .getByRole("button", { name: /(Level 3 slot|Slot di livello 3)/ })
        .first();
      if (await slot.isVisible().catch(() => false)) await slot.click();
      await p.getByRole("dialog").first().waitFor({ timeout: 15_000 });
    },
  },
  {
    slug: "x-wildshape",
    route: "/characters/scn-shapechange-druid?tab=spells",
    prepare: async (p) => {
      await p
        .locator(
          '.uc-chevron[aria-label$=": Shapechange"], .uc-chevron[aria-label$=": Trasformazione"]'
        )
        .first()
        .click({ timeout: 20_000 });
      await clickVisible(p, /^(Transform|Trasforma)$/);
      await p.getByRole("dialog").first().waitFor({ timeout: 15_000 });
    },
  },
  {
    slug: "x-summon-picker",
    route: "/characters/scn-planar-ally-cleric?tab=play",
    prepare: async (p) => {
      await railFirst(p);
      await clickVisible(p, /^(Choose a creature|Scegli una creatura)$/);
      await p.getByRole("dialog").first().waitFor({ timeout: 15_000 });
    },
  },
  {
    slug: "x-divine-intervention",
    route: "/characters/scn-wish?tab=play",
    prepare: async (p) => {
      await clickVisible(p, /^(all|tutti)$/i);
      await clickVisible(p, /^(Cast: Wish|Lancia: Desiderio)/);
      const d = p.getByRole("dialog");
      const slot = d
        .getByRole("button", { name: /(Level 9 slot|Slot di livello 9)/ })
        .first();
      if (await slot.isVisible().catch(() => false)) await slot.click();
      const skip = p.getByRole("dialog").getByRole("button", { name: /^(Skip|Salta)/ });
      if (await skip.isVisible().catch(() => false)) await skip.click();
      await clickVisible(p, /^(Duplicate a spell|Duplica un incantesimo)$/);
      await p.getByRole("dialog").getByRole("searchbox").waitFor({ timeout: 15_000 });
    },
  },
  {
    slug: "x-concentration-save",
    route: "/characters/mock-1",
    prepare: async (p) => {
      await p
        .locator(".vital-hp")
        .filter({ visible: true })
        .first()
        .click({ timeout: 15_000 });
      const field = p
        .getByRole("dialog")
        .getByRole("spinbutton")
        .or(p.getByRole("dialog").getByRole("textbox"))
        .first();
      await field.fill("6");
      await p
        .getByRole("dialog")
        .getByRole("button", { name: /^(damage|danno)$/i })
        .first()
        .click();
      await p.keyboard.press("Escape");
    },
  },
  {
    slug: "x-cunning-strike",
    route: "/characters/scn-soulknife-rogue?tab=play",
    prepare: async (p) => {
      await clickVisible(p, /^(all|tutti)$/i);
      await clickVisible(p, /^(Attack|Attacca): /);
      await p.waitForTimeout(800);
    },
  },
  {
    slug: "x-table-clock",
    route: "/characters/scn-gem-of-seeing?tab=play",
    prepare: async (p) => {
      await railFirst(p);
      await clickVisible(p, /(Table clock|Tempo al tavolo)/);
    },
  },
  {
    slug: "x-icon-picker",
    route: "/characters/mock-1?tab=play",
    prepare: async (p) => {
      await clickVisible(
        p,
        /^(Show Combat Algorithm|Mostra l'Algoritmo di Combattimento|Mostra)/
      );
      await p
        .locator(".icon-picker-trigger, [aria-haspopup=listbox], [aria-haspopup=dialog]")
        .filter({ visible: true })
        .first()
        .click({ timeout: 15_000 });
    },
  },
  {
    slug: "x-picker-detail",
    route: "/characters/new",
    prepare: async (p) => {
      await clickVisible(p, /^(Guided|Guidato)$/);
      await p.waitForTimeout(800);
      await p
        .getByRole("button", { name: /^(Bard|Bardo)/ })
        .first()
        .click({ timeout: 15_000 });
      await p.waitForTimeout(500);
    },
  },
  {
    slug: "x-tooltip",
    route: "/characters",
    prepare: async (p) => {
      await p.locator(".ch-card [data-state]").first().hover({ timeout: 15_000 });
      await p.waitForTimeout(900);
    },
  },
  {
    slug: "x-condition-editor",
    route: "/characters/mock-1",
    prepare: async (p) => {
      await railFirst(p);
      await clickVisible(p, EN_IT("Add condition", "Aggiungi condizione"));
    },
  },
  {
    slug: "x-defense-editor",
    route: "/characters/mock-1",
    prepare: async (p) => {
      await railFirst(p);
      await clickVisible(p, EN_IT("Add defense", "Aggiungi difesa"));
    },
  },
  {
    slug: "x-status-ledge",
    route: "/characters/mock-1",
    prepare: (p) => click(p, EN_IT("Hypnotic Pattern", "Trama Ipnotica")),
  },
  {
    slug: "x-breakdown-tip",
    route: "/characters/mock-1?tab=play",
    prepare: async (p) => {
      await clickVisible(p, /^(all|tutti)$/i);
      await clickVisible(p, /^(Expand: Shortbow|Espandi: Arco Corto)$/);
      await p.waitForTimeout(500);
      await clickVisible(p, /^(Damage breakdown|Scomposizione del danno)$/);
    },
  },
  {
    slug: "x-resource-conversion",
    route: "/characters/mock-1",
    prepare: async (p) => {
      await railFirst(p);
      await p
        .getByRole("button", { name: /→/ })
        .filter({ visible: true })
        .first()
        .click({ timeout: 15_000 });
    },
  },
  {
    slug: "x-cover-chip",
    route: "/characters/mock-1",
    prepare: (p) => click(p, EN_IT("Cover", "Copertura")),
  },
  {
    slug: "x-undo-toast",
    route: "/characters/mock-1?tab=play",
    prepare: async (p) => {
      await clickVisible(p, /^(all|tutti)$/i);
      await clickVisible(p, /^(Use: Dash|Usa: Scatto)$/);
      await p.locator(".toast").first().waitFor({ timeout: 10_000 });
    },
  },
  {
    slug: "x-combat-algorithm",
    route: "/characters/mock-1",
    prepare: (p) => click(p, EN_IT("Show Combat Algorithm", "Mostra")),
  },
  { slug: "x-character-missing", route: "/characters/does-not-exist" },
  { slug: "x-offline", route: "/characters/mock-1", offline: true },
  {
    slug: "x-campaign-empty",
    route: "/campaigns/DEVCAMPAIGN24",
    flags: { "d20-dev-empty": "1" },
  },
  {
    slug: "x-campaigns-list-empty",
    route: "/campaigns",
    flags: { "d20-dev-empty": "1" },
  },
  { slug: "x-join-bad-code", route: "/join/ZZZZZZZZ" },
  { slug: "x-member-sheet-missing", route: "/campaigns/DEVCAMPAIGN24/sheets/nobody" },
  {
    slug: "x-attach-dialog",
    route: "/campaigns/DEVCAMPAIGN24",
    prepare: (p) => click(p, EN_IT("Attach", "Collega")),
  },
  {
    slug: "x-portrait-lightbox",
    route: "/campaigns/DEVCAMPAIGN24",
    prepare: (p) => click(p, EN_IT("Show .*portrait", "Mostra il ritratto")),
  },
  {
    slug: "x-end-encounter",
    route: "/campaigns/DEVCAMPAIGN24",
    flags: { "d20-dev-encounter": "1" },
    prepare: (p) => click(p, EN_IT("End encounter", "Termina scontro")),
  },
  {
    slug: "x-init-popover",
    route: "/campaigns/DEVCAMPAIGN24",
    flags: { "d20-dev-encounter": "1" },
    prepare: (p) =>
      p
        .locator(
          ".init-vital, [class*=init-chip], button[aria-label*=nitiativ], button[aria-label*=niziativa]"
        )
        .first()
        .click({ timeout: 15_000 }),
  },
  {
    slug: "x-combat-pip",
    route: "/characters/mock-1",
    flags: { "d20-dev-pip-scenario": "fresh" },
    prepare: (p) => p.locator(".combat-pip").first().click({ timeout: 20_000 }),
  },
  {
    slug: "x-roster-delete-confirm",
    route: "/characters",
    prepare: async (p) => {
      await click(p, EN_IT("More actions", "Altre azioni"));
      await p
        .getByRole("menuitem", { name: EN_IT("Delete", "Elimina") })
        .first()
        .click();
    },
  },
  { slug: "x-admin-sheet", route: "/admin/users/mock-uid/characters/mock-1" },
  {
    slug: "x-guided-class-detail",
    route: "/characters/new",
    prepare: async (p) => {
      await click(p, EN_IT("Guided", "Guidato"));
      await p.waitForTimeout(800);
      await p
        .getByRole("button", { name: /details|dettagli|more|altro/i })
        .first()
        .click({ timeout: 15_000 });
    },
  },
  {
    slug: "x-sheet-edit-portrait-menu",
    route: "/characters/mock-1",
    edit: true,
    prepare: (p) =>
      p
        .locator(".seal, .portrait-edit, [aria-label*=ortrait], [aria-label*=itratto]")
        .first()
        .click({ timeout: 15_000 }),
  },
];

const EXTRAS_ON = !!process.env.BUG_SWEEP_EXTRAS;
for (const x of EXTRAS) {
  for (const combo of COMBOS) {
    const tag = `${x.slug}-${combo.locale}-${combo.theme}-${combo.device}`;
    test(tag, async ({ page, context }) => {
      test.skip(!EXTRAS_ON, "extras off");
      test.setTimeout(90_000);
      await page.setViewportSize(combo.device === "desktop" ? DESKTOP : MOBILE);
      await seedUI(page, combo.theme, x.edit ? "edit" : "play");
      await seedLang(page, combo.locale);
      if (x.flags)
        await page.addInitScript((f) => {
          for (const [k, v] of Object.entries(f)) localStorage.setItem(k, v);
        }, x.flags);
      await page.goto(x.route);
      await page.waitForSelector("main, [role=main], #main", { timeout: 60_000 });
      await page.waitForTimeout(3000);
      let opened = "ok";
      if (x.offline) {
        await context.setOffline(true);
        await page.waitForTimeout(1500);
      }
      if (x.prepare)
        await x.prepare(page).catch((e: unknown) => {
          opened = `could not open: ${(String(e instanceof Error ? e.message : e).split("\n")[0] ?? "").slice(0, 120)}`;
        });
      await page.waitForTimeout(1200);
      await freezeMotion(page);
      const found = await page.evaluate(CHECK, {
        locale: combo.locale,
        enOnly: EN_ONLY,
        namespaces: NAMESPACES,
      });
      if (opened !== "ok") found.push({ kind: "unopened", detail: opened });
      fs.writeFileSync(
        path.join(DIR, `${tag}.json`),
        JSON.stringify({ tag, issues: found })
      );
      await page.screenshot({ path: path.join(DIR, `${tag}.png`) });
      if (x.offline) await context.setOffline(false);
    });
  }
}
