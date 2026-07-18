/**
 * CommandPalette — "Ask the Folio", a universal ⌘K quick-switcher (N-E / D16).
 *
 * Its PURPOSE (owner-chosen): type to find ANYTHING — your CHARACTERS (→ open the
 * cockpit), the whole COMPENDIUM (spells · items · feats · maneuvers … → open the
 * entry's DETAIL in the codex), and the realm SECTIONS (→ jump). It also RUNS the
 * one-keystroke quick ACTIONS a player reaches for most (flip the theme, flip the
 * language — both in place — and start a new character). The empty query shows the
 * sections + actions as a launcher; a query fans out into grouped results. This is
 * what justifies the assistant-y name (it used to only jump to four sections).
 *
 * The heavy data (the live character list + the SRD index) lives in `PaletteBody`,
 * which is a child of the Radix `DialogContent` and therefore only mounts WHILE the
 * palette is open — so the characters subscription is never an always-on listener
 * and the SRD index is built lazily on first open (then memoized per locale).
 *
 * Built on the accessible Radix-backed `Dialog` (focus trap, ESC, outside-click,
 * aria wiring); search is bilingual + accent-insensitive via `matchesSearch`.
 *
 * ─── EXTENDING THE PALETTE (OWN-29 — read this before shipping a new feature) ───
 * Whenever a new realm / dataset / global capability ships, wire it in here so it
 * stays reachable from ⌘K. Pick the matching slot — each is a small `Hit[]` memo:
 *
 *  1. A new top-level REALM/PAGE → add it to `sections` (a `{ to, label, labelEn,
 *     icon }`). Always supply BOTH the localized `label` (t-key in EN+IT) and the
 *     `labelEn` so it's findable in either language. Gate it (e.g. `isAdmin`) if
 *     the route is role-scoped.
 *  2. A new searchable DATASET the user owns (like characters / campaigns) → add a
 *     `…Hits` memo that returns `[]` on an empty query, else filters the live list
 *     via `matchesSearch(q, …localizedFields)`, `.slice(0, ~6)`, and maps each to a
 *     `Hit` whose `to` opens its page (deep-link to the DETAIL, not a list). Fetch
 *     the data lazily (this body only mounts while the palette is open). Then add a
 *     group to `groups`.
 *  3. A new browsable SRD type → it comes for FREE: add the spec to
 *     `COMPENDIUM_SPECS` and the compendium index picks it up (deep-links via
 *     `?type=…&sel=<id>`).
 *  4. A new GLOBAL action (one that is NOT specific to a single character/campaign —
 *     those belong on their own pages) → add a def to the `actions` memo: a `run`
 *     (in-place command, reusing the real seam — e.g. a store/hook, never a fork) or
 *     a `to` (navigate), an `icon`, a localized `label`, and EN+IT search `terms`.
 *     Add the `palette.*` i18n keys to BOTH `common.json` files.
 *
 * Always: reuse the SAME lucide glyph a concept uses elsewhere (consistency), keep
 * the row a `Hit`, and add/adjust a test in `tests/unit/command-palette.test.tsx`.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type SVGProps,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Users,
  Swords,
  BookOpen,
  SlidersHorizontal,
  Shield,
  SearchX,
  Sun,
  Moon,
  Languages,
  UserPlus,
  FlagTriangleRight,
  Upload,
  LogOut,
  Bug,
  Scale,
  Keyboard,
} from "lucide-react";
import { Dialog, DialogContent, DialogBody, SearchInput, Icon } from "@/components/ui";
import { Kbd } from "@/components/ui/kbd";
import { matchesSearch } from "@/lib/search";
import { retireTopOverlayThen } from "@/lib/overlay-history";
import { getPaletteRecents, recordPaletteRecent } from "./palette-recents";
import { useCoarsePointer, isCoarsePointer } from "@/hooks/useCoarsePointer";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useCharacters } from "@/hooks/useCharacters";
import { useLocale } from "@/hooks/useLocale";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { signOut } from "@/lib/auth";
import { localizeClassName } from "@/lib/views/srd-i18n";
import { primaryClassId, totalLevel } from "@/lib/classes";
// COMPENDIUM_SPECS pull the whole SRD. The palette is always-mounted (⌘K), so a
// STATIC import would weigh the SRD onto the initial bundle (#59/#78). It's instead
// dynamically imported when PaletteBody mounts (palette opens) — type-only here.
type CompendiumSpec =
  (typeof import("@/features/compendium/picker/specs"))["COMPENDIUM_SPECS"][number];
import type { PickerCtx } from "@/features/compendium/picker";
import { listSharedCampaigns } from "@/features/campaigns/campaign-io";
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import { triggerCharacterImport } from "@/features/roster/import-trigger";
import { openReportAfterPaint } from "@/features/report/open-report";
import type { CampaignDoc } from "@/types/campaign";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Stable id on the search field so the dialog's `onOpenAutoFocus` can put initial
 * focus THERE (not on the first focusable, which is the close ✕). There is only ever
 * one palette mounted, so a fixed id is safe.
 */
const PALETTE_SEARCH_ID = "palette-search-input";

/**
 * One actionable result, flattened across every group for Enter / roving. A hit
 * either NAVIGATES (`to`) or RUNS an in-app command (`run`) — the quick actions
 * (theme / language toggles) use `run`; everything else navigates.
 */
interface Hit {
  key: string;
  to?: string;
  run?: () => void;
  label: string;
  sub?: string;
  icon: Glyph;
  current?: boolean;
}

/**
 * OWN-33 — the bounded launcher's seed: when there are no recents yet, the empty
 * palette's "Quick" group shows these curated action keys (the ones a player reaches
 * for most). Recents take precedence; these fill the rest up to the cap.
 */
const CURATED_QUICK = ["act:new-char", "act:new-camp", "act:report"];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        excludeFromCapture
        // Top-anchor the palette so the header + search bar hold a fixed position
        // and the modal grows/shrinks DOWNWARD only as results change (owner
        // 2026-06-07) — not symmetrically from the viewport center.
        overlayClassName="scrim-top"
        rubric={t("palette.rubric")}
        title={t("palette.title")}
        description={t("palette.description")}
        closeLabel={t("common.close")}
        // Put initial focus on the SEARCH FIELD, deterministically. Radix's default
        // focuses the first focusable in the content — the header's close ✕ — and a
        // bare `autoFocus` on the input only wins that race when the palette is the
        // ONLY dialog. Opened ON TOP of another modal (e.g. the weapon-mastery
        // picker), a second FocusScope mounts and the close ✕ wins instead, so the
        // input never holds focus and the type/↑↓/↵ flow is dead. Steering the open
        // auto-focus here (the canonical Radix API) makes the field win every time,
        // nested or not — no race to lose.
        //
        // …EXCEPT on a COARSE pointer (touch). Auto-focusing the input there pops the
        // soft keyboard, which shrinks the visual viewport and visibly RESIZES the
        // page under the palette (owner: "opening ⌘K resizes the page, mainly on
        // mobile"). On touch the standard pattern is to tap the field to type, so we
        // keep the palette open WITHOUT stealing focus — no keyboard, no reflow. We
        // still preventDefault so Radix's own auto-focus (the close ✕) doesn't fire
        // and pop the keyboard by a different route.
        onOpenAutoFocus={(e) => {
          if (isCoarsePointer()) {
            e.preventDefault();
            return;
          }
          const input = document.getElementById(PALETTE_SEARCH_ID);
          if (input) {
            e.preventDefault();
            input.focus();
          }
        }}
      >
        {/* Child of DialogContent → only mounts while open (Radix presence), so the
            characters subscription + SRD index are scoped to the open palette. */}
        <PaletteBody onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { language: locale, toggleLanguage } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = useIsAdmin();
  // On a coarse pointer (touch, no keyboard) the `?` shortcuts entry points are
  // noise — they advertise keys the user doesn't have. Gated through the shared
  // coarse-pointer seam (the same one that hides the topbar ⌘K chip).
  const coarsePointer = useCoarsePointer();
  const { characters } = useCharacters();
  const uid = useAuthStore((s) => s.user?.uid);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
  const [query, setQuery] = useState("");
  const q = query.trim();
  const listboxId = useId();

  // The roving highlight for keyboard nav (OWN-28b): Arrow Up/Down move it, Enter
  // activates it. Starts on the first hit; resets whenever the result set changes.
  const [activeIndex, setActiveIndex] = useState(0);

  // OWN-33 — read the recents ONCE when the palette opens (they only change on
  // activate, which closes it), so render stays pure (no per-frame storage read).
  const [recentKeys] = useState(getPaletteRecents);

  // Open the shortcuts sheet AFTER the palette's overlay fully closes (two rAFs —
  // the same after-close deferral navigation uses), so raising one overlay as
  // another retires never races the overlay-history sentinels. The palette action
  // reaches this via `activate()` (which already called `onClose`); the footer
  // chip closes the palette itself first.
  const openShortcutsSheet = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setShortcutsOpen(true)));
  }, [setShortcutsOpen]);

  // ── Campaigns (the player's shared campaigns) ────────────────────────────────
  // Indexed just like the character roster (OWN-28c). A ONE-SHOT membership fetch on
  // open (campaigns have no live-listener hook; this mirrors CampaignsListPage). The
  // body only mounts while the palette is open, so it's one read per open, not always-on.
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void listSharedCampaigns(uid)
      .then((cs) => {
        if (alive) setCampaigns(cs.filter((c) => c.id !== PERSONAL_CAMPAIGN_ID));
      })
      .catch(() => {
        /* a palette is a best-effort finder — a failed campaign read just omits them */
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  // Lazy-load the SRD compendium specs the FIRST time the palette opens (this body
  // only mounts while open). Until they arrive, compendium search yields nothing
  // and the palette's nav/actions work immediately — but the ~250 KB-gzip SRD
  // never weighs on the initial app load (#59/#78).
  const [compendiumSpecs, setCompendiumSpecs] = useState<
    readonly CompendiumSpec[] | null
  >(null);
  useEffect(() => {
    let alive = true;
    void import("@/features/compendium/picker/specs").then((m) => {
      if (alive) setCompendiumSpecs(m.COMPENDIUM_SPECS);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Sections (realm nav) ─────────────────────────────────────────────────────
  const sections: Hit[] = useMemo(() => {
    const base: { to: string; label: string; labelEn: string; icon: Glyph }[] = [
      {
        to: "/characters",
        label: t("nav.characters"),
        labelEn: "Characters",
        icon: Users,
      },
      {
        to: "/campaigns",
        label: t("nav.campaigns"),
        labelEn: "Campaigns",
        icon: Swords,
      },
      {
        to: "/compendium",
        label: t("nav.compendium"),
        labelEn: "Compendium",
        icon: BookOpen,
      },
      {
        to: "/settings",
        label: t("nav.settings"),
        labelEn: "Settings",
        icon: SlidersHorizontal,
      },
      // The colophon leaf — ungated (a public route), so every routed surface is
      // palette-reachable (D7).
      {
        to: "/legal",
        label: t("legal.title"),
        labelEn: "Legal & Attribution",
        icon: Scale,
      },
    ];
    if (isAdmin) {
      base.push({
        to: "/admin",
        label: t("nav.admin"),
        labelEn: "Admin",
        icon: Shield,
      });
    }
    return base
      .filter((s) => matchesSearch(q, s.label, s.labelEn))
      .map((s) => ({
        key: `sec:${s.to}`,
        to: s.to,
        label: s.label,
        icon: s.icon,
        current: location.pathname === s.to || location.pathname.startsWith(`${s.to}/`),
      }));
  }, [t, isAdmin, q, location.pathname]);

  // ── Quick actions (OWN-25c) ──────────────────────────────────────────────────
  // The palette isn't only a finder: it runs the one-keystroke commands a player
  // reaches for most — flip the theme, flip the language (both IN PLACE, reusing the
  // same seams Settings drives), and start a new character. Shown on the empty palette
  // (immediately useful) and searchable by EN+IT keywords. `run` toggles execute via
  // the shared `activate()`; "new character" navigates.
  const actions: Hit[] = useMemo(() => {
    const nextTheme = theme === "light" ? "dark" : "light";
    const defs: (Hit & { terms: string[] })[] = [
      {
        key: "act:theme",
        run: () => setTheme(nextTheme),
        label:
          nextTheme === "light"
            ? t("palette.actionThemeToLight")
            : t("palette.actionThemeToDark"),
        icon: nextTheme === "light" ? Sun : Moon,
        terms: [
          "theme",
          "tema",
          "aspetto",
          "appearance",
          "dark",
          "light",
          "scuro",
          "chiaro",
        ],
      },
      {
        key: "act:lang",
        run: () => toggleLanguage(),
        label:
          locale === "en" ? t("palette.actionLangToIt") : t("palette.actionLangToEn"),
        icon: Languages,
        terms: ["language", "lingua", "english", "inglese", "italian", "italiano"],
      },
      {
        key: "act:new-char",
        to: "/characters/new",
        label: t("palette.actionNewCharacter"),
        icon: UserPlus,
        terms: ["new", "nuovo", "create", "crea", "character", "personaggio"],
      },
      {
        key: "act:new-camp",
        // Deep-links the campaigns realm with the create modal open (OWN-28d).
        to: "/campaigns?new=1",
        label: t("palette.actionNewCampaign"),
        icon: FlagTriangleRight,
        terms: [
          "new",
          "nuovo",
          "create",
          "crea",
          "campaign",
          "campagna",
          "party",
          "group",
        ],
      },
      {
        key: "act:import",
        // Launches the shell-hosted import picker (OWN-28d) — the click IS the user
        // gesture, so the OS file dialog still opens after the palette closes.
        run: () => triggerCharacterImport(),
        label: t("palette.actionImport"),
        icon: Upload,
        terms: ["import", "importa", "json", "upload", "carica", "load", "file"],
      },
      {
        key: "act:report",
        // Opens the global bug/feature reporter (OWN-37). `activate()` closes the
        // palette first; the shared after-paint deferral lets the palette unmount
        // before html2canvas photographs the SCREEN, then captures + flips the
        // global `reportOpen` flag.
        run: () => openReportAfterPaint(),
        label: t("palette.actionReport"),
        icon: Bug,
        terms: [
          "bug",
          "report",
          "feature",
          "idea",
          "suggestion",
          "issue",
          "problem",
          "feedback",
          "segnala",
          "segnalazione",
          "errore",
          "problema",
          "funzionalità",
          "idea",
          "suggerimento",
        ],
      },
      {
        key: "act:shortcuts",
        // Opens the `?` keyboard-shortcuts sheet (shared uiStore seam). Deferred so
        // it raises after the palette closes.
        run: openShortcutsSheet,
        // Reuse the sheet's own title ("Keyboard shortcuts") — one canonical label.
        label: t("shortcuts.title"),
        icon: Keyboard,
        terms: ["keyboard", "shortcuts", "hotkeys", "tastiera", "scorciatoie", "tasti"],
      },
      {
        key: "act:sign-out",
        run: () => void signOut(),
        label: t("palette.actionSignOut"),
        icon: LogOut,
        terms: [
          "sign out",
          "logout",
          "log out",
          "esci",
          "disconnetti",
          "account",
          "exit",
        ],
      },
    ];
    return defs.filter(
      (a) =>
        // The shortcuts action is a keyboard affordance — drop it on touch (no keys
        // to reach). Everything else is pointer-agnostic.
        (a.key !== "act:shortcuts" || !coarsePointer) &&
        matchesSearch(q, a.label, ...a.terms)
    );
  }, [t, theme, setTheme, locale, toggleLanguage, q, openShortcutsSheet, coarsePointer]);

  // ── Characters (the roster) ──────────────────────────────────────────────────
  // Searchable by NAME and by CLASS (localized + the stable id, so "wizard" and
  // "mago" both find your wizard in either locale) — §2.5, search answers "which
  // of my characters is the cleric?".
  const characterHits: Hit[] = useMemo(() => {
    if (!q) return [];
    return characters
      .map((c) => {
        const classId = primaryClassId(c.character);
        const cls = classId ? localizeClassName(classId, locale) : "";
        return { c, classId, cls };
      })
      .filter(({ c, classId, cls }) => matchesSearch(q, c.character.name, cls, classId))
      .slice(0, 6)
      .map(({ c, cls }) => ({
        key: `char:${c.id}`,
        to: `/characters/${c.id}`,
        label: c.character.name,
        sub: cls ? `${cls} ${totalLevel(c.character)}` : undefined,
        icon: Users,
      }));
  }, [characters, q, locale]);

  // ── Campaigns (the player's shared campaigns) — searched like the roster ──────
  const campaignHits: Hit[] = useMemo(() => {
    if (!q) return [];
    return campaigns
      .filter((c) => matchesSearch(q, c.name))
      .slice(0, 6)
      .map((c) => ({
        key: `camp:${c.id}`,
        to: `/campaigns/${c.id}`,
        label: c.name,
        icon: Swords,
      }));
  }, [campaigns, q]);

  // ── Compendium (the whole SRD) ───────────────────────────────────────────────
  // Built once per locale (lazily — this body only mounts when the palette opens).
  const index = useMemo(() => {
    const ctx = { t, locale, character: null, mode: "browse" } as PickerCtx;
    const out: {
      typeId: string;
      typeLabel: string;
      icon: Glyph;
      id: string;
      name: string;
      cands: Array<string | null | undefined>;
    }[] = [];
    if (!compendiumSpecs) return out; // specs still loading (lazy on open)
    for (const spec of compendiumSpecs) {
      const label = spec.label(t);
      const icon = (spec.icon ?? BookOpen) as Glyph;
      for (const entry of spec.data) {
        out.push({
          typeId: spec.id,
          typeLabel: label,
          icon,
          id: spec.getId(entry),
          name: spec.getName(entry, ctx),
          cands: spec.searchText(entry, ctx),
        });
      }
    }
    return out;
  }, [t, locale, compendiumSpecs]);

  const compendiumHits: Hit[] = useMemo(() => {
    if (!q) return [];
    // NAME matches outrank gloss-only matches ("fire" puts Fire Bolt above the
    // spells that merely mention fire in their text) — the stable partition keeps
    // each band in data order, so the ranking is deterministic.
    const nameHits: typeof index = [];
    const glossHits: typeof index = [];
    for (const e of index) {
      if (matchesSearch(q, e.name)) nameHits.push(e);
      else if (matchesSearch(q, ...e.cands)) glossHits.push(e);
    }
    return [...nameHits, ...glossHits].slice(0, 8).map((e, i) => ({
      key: `cmp:${e.typeId}:${e.id}:${i}`,
      // OWN-25e — deep-link straight to the entry's DETAIL page (`?sel=`), not the
      // filtered list, so "Ask the Folio" → a spell/item opens it ready to read.
      to: `/compendium?type=${e.typeId}&sel=${encodeURIComponent(e.id)}`,
      label: e.name,
      sub: e.typeLabel,
      icon: e.icon,
    }));
  }, [index, q]);

  // OWN-33 — the BOUNDED launcher. With no query, show a few recents + curated
  // actions (the "Quick" group) and the stable Sections, NOT the full action list —
  // so the entry point stays a fixed size however many actions exist; everything
  // else reveals on type. Recents/curated resolve against the (unfiltered, on empty
  // query) `actions` pool; recents win, curated fill up to the cap.
  const quickHits: Hit[] = useMemo(() => {
    if (q) return [];
    const byKey = new Map(actions.map((a) => [a.key, a] as const));
    const out: Hit[] = [];
    const seen = new Set<string>();
    for (const key of [...recentKeys, ...CURATED_QUICK]) {
      if (seen.has(key)) continue;
      const hit = byKey.get(key);
      if (hit) {
        out.push(hit);
        seen.add(key);
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [q, actions, recentKeys]);

  const groups: { heading: string; hits: Hit[] }[] = (
    q === ""
      ? [
          { heading: t("palette.groupQuick"), hits: quickHits },
          { heading: t("palette.groupSections"), hits: sections },
        ]
      : [
          { heading: t("palette.groupSections"), hits: sections },
          { heading: t("palette.groupActions"), hits: actions },
          { heading: t("palette.groupCharacters"), hits: characterHits },
          { heading: t("palette.groupCampaigns"), hits: campaignHits },
          { heading: t("palette.groupCompendium"), hits: compendiumHits },
        ]
  ).filter((g) => g.hits.length > 0);

  const flat = groups.flatMap((g) => g.hits);

  // The highlight resets to the top on each edit (in the change handler below — not an
  // effect), and is clamped here so an async result-set shrink can never strand it.
  const activeIdx = flat.length === 0 ? -1 : Math.min(activeIndex, flat.length - 1);
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  // Keep the highlighted option visible as the user arrows past the fold.
  useEffect(() => {
    if (activeIdx < 0) return;
    document
      .getElementById(`${listboxId}-opt-${activeIdx}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, listboxId]);

  function activate(hit: Hit) {
    // OWN-33 — remember it so the bounded launcher surfaces what you actually use.
    recordPaletteRecent(hit.key);
    onClose();
    setQuery("");
    if (hit.run) hit.run();
    else if (hit.to) {
      const to = hit.to;
      // B21 — retire the palette's overlay-history sentinel FIRST, and navigate
      // only once its `history.back()` traversal has actually LANDED (the
      // popstate — the traversal's one deterministic completion signal). A
      // navigation pushed while that traversal is still in flight gets rewound
      // when it lands, silently undoing the route change — the owner's mobile
      // bug: tapping a result "did nothing" because two coalesced rAFs (the old
      // wall-clock deferral) fired the navigate BEFORE the ~7ms traversal
      // completed, so the fresh /compendium entry was popped right back off.
      // `retireTopOverlayThen` also removes the entry from the overlay stack, so
      // the Dialog cleanup (from `onClose()` above) no-ops instead of issuing a
      // second back() — no dead same-key Back entry, no race, on every device.
      retireTopOverlayThen(() => void navigate(to));
    }
  }

  // Full keyboard control (OWN-28b · hardened #75/#76). The PALETTE CONTAINER owns
  // navigation — not just the search field — so ↑↓ / Home / End / Enter drive the
  // roving highlight no matter which element inside the palette holds focus (the
  // input normally, but also a result row or the body). The search field is a
  // combobox with an `aria-activedescendant` highlight; making the handler
  // focus-position-independent is what structurally guarantees the arrows can never
  // "go dead" — paired with the field grabbing initial focus on open
  // (`onOpenAutoFocus`) and the result rows being non-tab-stops (`tabIndex={-1}`),
  // so focus has nowhere to drift that would strand keyboard nav.
  function onPaletteKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(flat.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[activeIdx] ?? flat[0];
      if (hit) activate(hit);
    }
  }

  return (
    // OWN-31 — a flex column so the search + the footer legend stay PINNED and only
    // the results scroll; the "↑↓ Navigate · ↵ Go · Esc" legend is always visible
    // however many sections/actions there are.
    <DialogBody className="palette-body" onKeyDown={onPaletteKeyDown}>
      {/* OWN-25 — full-width so the placeholder hint (the only cue to WHAT you can
          search) is never clipped; the field is the palette's primary affordance. */}
      <SearchInput
        id={PALETTE_SEARCH_ID}
        className="palette-search w-full"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onClear={() => {
          setQuery("");
          setActiveIndex(0);
        }}
        clearLabel={t("common.clearSearch")}
        placeholder={t("palette.placeholder")}
        aria-label={t("palette.placeholder")}
        // Combobox over the results listbox (OWN-28b) — the input keeps focus while
        // the roving highlight (aria-activedescendant) moves through the options, so
        // ⌘K → type → arrows → Enter is a complete keyboard flow.
        role="combobox"
        aria-expanded={flat.length > 0}
        // Only reference the listbox when it actually exists (no-match state renders
        // none) — otherwise aria-controls is a dangling IDREF.
        aria-controls={flat.length > 0 ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeIdx >= 0 ? optionId(activeIdx) : undefined}
        // Initial focus is driven by the dialog's `onOpenAutoFocus` (deterministic
        // even when the palette opens over another modal), not a focus-race `autoFocus`.
      />

      {flat.length > 0 ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t("palette.title")}
          className="palette-results mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
        >
          {(() => {
            let gi = -1;
            return groups.map((group) => (
              // A grouped listbox: each section is a `role="group"` (so the
              // listbox's children are groups, not bare <div>/<ul>), and the
              // ul/li are made presentational so they shed their implicit
              // list/listitem roles — otherwise the `role="option"` buttons'
              // required listbox|group parent is broken (axe aria-required-*).
              <div key={group.heading} role="group" aria-label={group.heading}>
                <p className="palette-group" aria-hidden="true">
                  {group.heading}
                </p>
                <ul className="flex flex-col gap-1" role="presentation">
                  {group.hits.map((hit) => {
                    const idx = ++gi;
                    const active = idx === activeIdx;
                    return (
                      <li key={hit.key} role="presentation">
                        <button
                          type="button"
                          id={optionId(idx)}
                          role="option"
                          // Combobox options are NOT tab stops: focus stays on the
                          // search field (the roving `aria-activedescendant` marks the
                          // active row), so Tab can't strand focus on a result where
                          // arrows would be dead. Mouse + roving-Enter still activate.
                          tabIndex={-1}
                          aria-selected={active}
                          data-active={active || undefined}
                          className="menu-item w-full text-left"
                          aria-current={hit.current ? "page" : undefined}
                          onMouseMove={() => setActiveIndex(idx)}
                          onClick={() => activate(hit)}
                        >
                          <Icon as={hit.icon} size="sm" decorative />
                          <span className="palette-label">{hit.label}</span>
                          {hit.sub ? (
                            <span className="palette-sub">{hit.sub}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <Icon as={SearchX} size="lg" decorative className="text-text-secondary" />
          <p className="text-sm text-text-secondary">
            {t("palette.empty")}
            {q ? ` · “${q}”` : null}
          </p>
        </div>
      )}

      <div className="palette-foot mt-3 flex items-center justify-end gap-3 border-t border-border-subtle pt-3 text-xs text-text-secondary">
        {/* The `? Shortcuts` chip — a real button that opens the shortcuts sheet.
            Left-aligned via `mr-auto` so the ↑↓ / ↵ / Esc legend stays right. Hidden
            on touch (no keyboard to advertise) via the shared coarse-pointer seam. */}
        {!coarsePointer && (
          <button
            type="button"
            className="palette-foot-chip mr-auto inline-flex items-center gap-1"
            onClick={() => {
              onClose();
              openShortcutsSheet();
            }}
          >
            <Kbd>?</Kbd>
            {t("shortcuts.rubric")}
          </button>
        )}
        <span className="inline-flex items-center gap-1">
          <Kbd>↑↓</Kbd>
          {t("palette.hintNav")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>↵</Kbd>
          {t("palette.hintGo")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd>
          {t("common.close")}
        </span>
      </div>
    </DialogBody>
  );
}
