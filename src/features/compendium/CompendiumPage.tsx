/**
 * CompendiumPage — the "Compendium" realm, redesigned as an illuminated codex
 * (OWN-5). A faceted, searchable, READ-ONLY browse over the bundled SRD (spells ·
 * class features · feats · equipment · magic items · maneuvers · metamagic ·
 * invocations), rendered as an open ancient tome: a gilt-framed parchment spread
 * (`.cmp-tome`) carrying a type ribbon (`.cmp-ribbon`), a collapsible facet bar,
 * and premium carved entry rows.
 *
 * COMPENDIUM-LUX layout — ONE tome, two reading models by width:
 *  - ≥1024px, the tome opens as a TWO-LEAF SPREAD (`.cmp-body[data-spread]`):
 *    the index leaf (search · filters · list) on the verso, the reading leaf
 *    (the open entry, or the frontispiece at rest) on the recto, split by the
 *    book-fold gutter. Browsing keeps the index in place — clicking entry after
 *    entry reads like leafing a reference book, no layout swap, no lost scroll.
 *  - Below, the list and the entry leaf SWAP in place (the phone model), with
 *    the picker's scroll memory restoring the index depth on Back.
 *
 * It is powered by the SAME picker primitive the eight "Add-X" / re-pick flows
 * use — `useCompendiumPicker` in browse mode + the shared `CompendiumResultList`
 * + `EntryView` — driven by the per-type spec registry, so the elevated row
 * treatment propagates to the cockpit pickers for free.
 *
 * The campaign-scoped content lens (Personal default) is DEFERRED per the plan;
 * this shows the full SRD. No Firebase.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal, ChevronDown, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchField } from "@/components/shared/SearchField";
import { useCompendiumPicker, countActiveFacets } from "./picker/useCompendiumPicker";
import { CompendiumResultList } from "./picker/ResultList";
import { CompendiumFacets } from "./Facets";
import { COMPENDIUM_SPECS, type AnyCompendiumSpec } from "./picker/specs";
import { EntryView } from "./EntryView";
import { useActiveTabScroll } from "@/hooks/useActiveTabScroll";
import { useOverflowFade } from "@/hooks/useOverflowFade";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useLocale } from "@/hooks/useLocale";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { PickerCtx } from "./picker";

export function CompendiumPage() {
  const { t } = useTranslation();
  // The active content type lives in the URL (`?type=spell|maneuver|…`) so a
  // compendium view is deep-linkable, bookmarkable, and back-button friendly —
  // matching the cockpit's `?tab=` pattern. An unknown / missing type falls back
  // to the first spec.
  const [searchParams, setSearchParams] = useSearchParams();
  const fallbackId = COMPENDIUM_SPECS[0]?.id ?? "spell";
  const param = searchParams.get("type");
  const activeId = COMPENDIUM_SPECS.some((s) => s.id === param)
    ? (param as string)
    : fallbackId;
  const spec = COMPENDIUM_SPECS.find((s) => s.id === activeId) ?? COMPENDIUM_SPECS[0];
  // `?q=` deep-links a search — it only SEEDS the browser; switching type drops it.
  const initialQuery = searchParams.get("q") ?? "";
  // `?sel=` is the OPEN ENTRY (COMPENDIUM-NAV): selection lives in the URL as
  // live state — opening the first entry PUSHES ONE history frame (switching
  // entry→entry replaces it), so the browser's Back closes the leaf and returns
  // to the list (with its scroll intact) instead of leaving the realm; an entry
  // is shareable/bookmarkable by construction.
  const selectedId = searchParams.get("sel");
  const location = useLocation();
  const navigate = useNavigate();
  const { language: locale } = useLocale();

  // Tab title: the realm name, or `<Entry> · Compendium` when a leaf is open
  // (`?sel=`) — resolve the open entry's localized name from the active spec (the
  // same `spec.getName(entry, ctx)` seam the palette index uses).
  const entryName = useMemo(() => {
    if (!selectedId || !spec) return null;
    const ctx = { t, locale, character: null } as PickerCtx;
    const entry = spec.data.find((e) => spec.getId(e) === selectedId);
    return entry ? spec.getName(entry, ctx) : null;
  }, [selectedId, spec, t, locale]);
  useDocumentTitle(
    entryName ? `${entryName} · ${t("nav.compendium")}` : t("nav.compendium")
  );
  // The facet disclosure is page-level state (not per-type) so it survives the
  // type-keyed browser remount: a reader who opens the filters keeps them open
  // while hopping Spells → Feats. Collapsed by default at EVERY width — the
  // list is the surface; the facets unfold on demand (owner, 2026-07-10).
  const [facetsOpen, setFacetsOpen] = useState(false);

  const setActiveId = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("type", id);
          next.delete("q"); // the seeded search belonged to the prior type
          next.delete("sel"); // …as did the open entry
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Opening the FIRST entry = PUSH (marked, so closing can be a real history
  // Back to the index); switching entry→entry = REPLACE the marked frame, so the
  // tome shows ONE page at a time and closing always returns to the index — never
  // an accumulating pile of prior entries. Close = Back when WE pushed the entry,
  // else (a deep link / refresh — no marker) strip `sel` in place so the URL never
  // goes stale while the list shows.
  const setSelectedId = useCallback(
    (id: string | null) => {
      if (id) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("sel", id);
            return next;
          },
          { replace: selectedId !== null, state: { cmpEntry: true } }
        );
      } else if ((location.state as { cmpEntry?: boolean } | null)?.cmpEntry) {
        void navigate(-1);
      } else {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("sel");
            return next;
          },
          { replace: true }
        );
      }
    },
    [setSearchParams, selectedId, location.state, navigate]
  );

  return (
    // OWN-24 / OWN-28a / COMPENDIUM-NAV — the whole page fits the viewport at EVERY
    // width by shortening ONLY the tome card: `<main>` keeps the SAME `page-shell
    // py-8` as the roster + campaigns pages (identical margins / header position, so
    // navigating between them never jumps), and becomes a viewport-tall flex column
    // so the tome flexes to fill the space left under the (unchanged) header and its
    // OWN list/detail scroll — ONE scroll, ever. The cap subtracts exactly the
    // shell's fixed bottom chrome (the `<md` bottom-nav + safe area + the PWA dock —
    // the AppShell's own padding formula); the page then scrolls ONLY for the
    // colophon footer below. `min-h` is the short-viewport (landscape phone)
    // escape hatch: the page falls back to scrolling instead of crushing the list.
    <main
      id="main"
      className="page-shell flex min-h-[30rem] py-8 h-[calc(100svh-var(--topbar-h)-var(--m-nav-h)-var(--safe-bottom)-var(--pwa-banner-h,0px))] flex-col overflow-hidden md:h-[calc(100svh-var(--topbar-h)-var(--pwa-banner-h,0px))]"
    >
      <PageHeader as="h1" crest title={t("nav.compendium")} hint={t("compendium.hint")} />
      {spec && (
        // Remount when the type OR a seeded `?q=` changes → fresh facets + search.
        // The open entry (`?sel=`) is LIVE state, not a seed: it must NOT remount
        // the browser, or the list's query/facets/scroll would be lost on open.
        <CompendiumBrowser
          key={`${spec.id}:${initialQuery}`}
          spec={spec}
          specs={COMPENDIUM_SPECS}
          activeId={activeId}
          onSelectType={setActiveId}
          initialQuery={initialQuery}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
          facetsOpen={facetsOpen}
          onFacetsOpenChange={setFacetsOpen}
        />
      )}
    </main>
  );
}

interface BrowserProps {
  spec: AnyCompendiumSpec;
  specs: readonly AnyCompendiumSpec[];
  activeId: string;
  onSelectType: (id: string) => void;
  initialQuery: string;
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  facetsOpen: boolean;
  onFacetsOpenChange: (open: boolean) => void;
}

function CompendiumBrowser({
  spec,
  specs,
  activeId,
  onSelectType,
  initialQuery,
  selectedId,
  onSelectedIdChange,
  facetsOpen,
  onFacetsOpenChange,
}: BrowserProps) {
  const { t } = useTranslation();
  const picker = useCompendiumPicker<unknown>(spec, {
    mode: "browse",
    initialQuery,
    selectedId,
    onSelectedIdChange,
  });
  // Alias the callback ref out of the api object BEFORE the JSX (a `ref=` usage
  // marks its source as a ref; later `picker.*` reads would trip the lint).
  const { selected, attachListScroll } = picker;
  const facetsId = useId();
  const hasFacets = spec.filters.length > 0;
  // §3 — the closed disclosure must still SAY when facets are narrowing the
  // list (industry-standard "Filters · N"), or an active facet is invisible.
  const activeFacets = countActiveFacets(spec.filters, picker.filterState);
  // COMPENDIUM-LUX — the two-leaf spread (a JS fork, not CSS: the mobile model
  // must UNMOUNT the list on open so the scroll-memory remount seam restores
  // the index depth on Back; a display:none pane would zero its scrollTop).
  const spread = useMediaQuery("(min-width: 1024px)");

  // Keep the SELECTED type tab revealed inside the ribbon's own horizontal scroller
  // — never by scrolling the page. Tapping a type that sits off the edge used to
  // leave it clipped, and a touch browser's native focus-scroll then jumped the
  // whole page to reveal it (owner, 2026-07-04).
  const ribbonRef = useRef<HTMLDivElement>(null);
  useActiveTabScroll(ribbonRef, activeId);
  // Edge-fade "more this way" cue on the horizontal ribbon (the shared
  // overflow-fade seam the cockpit TabStrip uses) — a tab clipped past the edge
  // must read as scrollable, not as the end of the strip. The ribbon is ONE
  // scrolling row at every width now (COMPENDIUM-LUX: the old desktop wrap
  // spent a second row on one orphan tab).
  const ribbonFade = useOverflowFade(ribbonRef);

  // Roam the index with the keyboard (the command-palette muscle memory the app
  // already teaches): ↓ from the SEARCH FIELD drops into the first result, ↑/↓
  // move focus row-to-row, ↑ from the first row returns to search. Scoped to
  // the search input + the rows so the facet chips keep native arrow behavior.
  const onIndexKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const target = e.target as HTMLElement;
    const container = e.currentTarget;
    const rows = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".pick-row:not(:disabled)")
    );
    if (rows.length === 0) return;
    if (target instanceof HTMLInputElement) {
      if (e.key === "ArrowDown" && rows[0]) {
        e.preventDefault();
        rows[0].focus();
        rows[0].scrollIntoView({ block: "nearest" });
      }
      return;
    }
    if (!target.classList.contains("pick-row")) return;
    const at = rows.indexOf(target as HTMLButtonElement);
    if (e.key === "ArrowUp" && at === 0) {
      e.preventDefault();
      container.querySelector<HTMLInputElement>(".search .input")?.focus();
      return;
    }
    const next = e.key === "ArrowDown" ? rows[at + 1] : at < 0 ? rows[0] : rows[at - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: "nearest" });
  }, []);

  const index = (
    // A pure keyboard-delegation wrapper (no click/role): ↑/↓ roam between the
    // search input and the rows, which stay the real interactive elements.
    <div className="cmp-index" onKeyDown={onIndexKeyDown}>
      {/* Index head: rubric + live count + search + the facet disclosure. */}
      <div className="cmp-head">
        <div className="cmp-index-rubric">
          <span className="cmp-index-name">{spec.label(t)}</span>
          <span className="cmp-index-count">
            {t("common.items", { count: picker.count })}
          </span>
        </div>
        <SearchField
          value={picker.query}
          onChange={picker.setQuery}
          placeholder={spec.searchPlaceholder?.(t)}
        />
        {/* The facet disclosure — one control at EVERY width (owner, 2026-07-10:
            the always-open desktop bar spent ~3 rows of list on chrome). The
            gilt tally keeps an active-but-collapsed filter visible. */}
        {hasFacets && (
          <button
            type="button"
            className="fchip cmp-facet-toggle"
            aria-expanded={facetsOpen}
            aria-controls={facetsId}
            onClick={() => onFacetsOpenChange(!facetsOpen)}
          >
            <Icon as={SlidersHorizontal} size="xs" decorative />
            {t("compendium.filters")}
            {activeFacets > 0 && <span className="cmp-facet-count">{activeFacets}</span>}
            <Icon as={ChevronDown} size="xs" decorative className="cmp-facet-caret" />
          </button>
        )}
      </div>

      {hasFacets && (
        <CompendiumFacets
          id={facetsId}
          spec={spec}
          picker={picker}
          collapsed={!facetsOpen}
        />
      )}

      {/* COMPENDIUM-NAV — the picker's scroll memory keeps the codex depth
          across the entry leaf and resets it on a new result set. */}
      <div className="cmp-list" data-variant="codex" ref={attachListScroll}>
        {picker.count === 0 ? (
          <div className="cmp-empty">
            <Icon as={BookOpen} decorative />
            <span className="cmp-empty-title">{t("compendium.emptyTitle")}</span>
            <span className="cmp-empty-hint">{t("compendium.emptyHint")}</span>
            {/* §2.5 — a no-match leaf offers the next action, not just advice:
                one tap clears the search + every facet back to the full pool. */}
            <Button variant="secondary" size="sm" onClick={picker.reset}>
              {t("compendium.emptyReset")}
            </Button>
          </div>
        ) : (
          <CompendiumResultList picker={picker} spec={spec} bare />
        )}
      </div>
    </div>
  );

  const reading = selected ? (
    // Keyed by the open id: jumping entry→entry mounts a FRESH leaf — its read
    // column starts at the top (and the page-settle plays once per entry).
    <EntryView
      key={selectedId ?? undefined}
      spec={spec}
      entry={selected}
      ctx={picker.ctx}
      onBack={picker.clearSelection}
      spread={spread}
    />
  ) : spread ? (
    <Frontispiece spec={spec} count={picker.count} />
  ) : null;

  return (
    // COMPENDIUM-NAV — ONE tome at every width: it FLEXES to fill the
    // viewport-capped `<main>` (its list/detail scroll inside), so the page never
    // grows with the codex and the ribbon + search stay put.
    <div className="tome-leaf-surface cmp-tome mt-2 flex min-h-0 flex-1 flex-col">
      {/* Type ribbon — the bound divider tabs (Spells · Features · …), inside a
          shell that fades whichever edge still hides tabs when it scrolls. */}
      <div className="cmp-ribbon-shell" data-fade={ribbonFade || undefined}>
        <div
          ref={ribbonRef}
          className="cmp-ribbon"
          role="tablist"
          aria-label={t("compendium.type")}
        >
          {specs.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === activeId}
              className="cmp-tab"
              onClick={() => onSelectType(s.id)}
            >
              {s.icon && <Icon as={s.icon} decorative />}
              {s.label(t)}
            </button>
          ))}
        </div>
      </div>
      <div className="cmp-ribbon-rule" />

      <div className="cmp-body" data-spread={spread ? "" : undefined}>
        {/* The index leaf: on the spread it ALWAYS shows (reading never hides
            the list); on the phone model it swaps out behind the open entry. */}
        {(spread || !selected) && index}
        {reading}
      </div>
    </div>
  );
}

/**
 * The reading leaf AT REST (spread only) — the codex frontispiece. An honest
 * resting state in the tome's own voice: the active type's seal, its name, the
 * live entry count, and the one next action (pick from the index). Quiet by
 * design; the leaf's job is to hold the reading surface open.
 */
function Frontispiece({ spec, count }: { spec: AnyCompendiumSpec; count: number }) {
  const { t } = useTranslation();
  return (
    <div className="cmp-read cmp-frontis" aria-hidden>
      <div className="cmp-frontis-inner">
        {spec.icon && (
          <span className="cmp-frontis-seal">
            <Icon as={spec.icon} decorative />
          </span>
        )}
        <span className="cmp-frontis-title">{spec.label(t)}</span>
        <span className="cmp-frontis-count">{t("common.items", { count })}</span>
        <span className="cmp-frontis-hint">{t("compendium.frontisHint")}</span>
      </div>
    </div>
  );
}
