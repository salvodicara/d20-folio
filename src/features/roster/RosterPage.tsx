/**
 * RosterPage — "My Characters" (Phase 6).
 *
 * The real roster. It consumes the shipped `useCharacters()` real-time hook —
 * the ONLY data path here: that hook subscribes via `subscribeToCharacters`
 * (onSnapshot, ordered by `updatedAt`) and tears the listener down on unmount,
 * so the roster adds no second listener and no new query (§7 free-tier rule).
 * Four states render on the folio `.roster-*` / `.ch-*` recipe (shipped in
 * folio.css): loading · error · empty · populated. The Create CTA opens the
 * shipped creation wizard at /characters/new.
 *
 * The hidden Personal Campaign is a campaign, not a character, so it is never
 * returned by `useCharacters()` and never appears in this list.
 *
 * Owns its own `<main id="main">` landmark (AppShell renders no <main>).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Plus,
  TriangleAlert,
  Users,
  FlaskConical,
  SearchX,
  ListChecks,
} from "lucide-react";
import { primaryClassName, primarySubclassName } from "@/lib/classes";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/shared/PageHeader";
import { PickerSearch } from "@/components/sheet/picker-parts";
import { matchesSearch } from "@/lib/search";
import { FREE_TIER_LIMITS } from "@/lib/limits";
import { useCharacters } from "@/hooks/useCharacters";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRealmBackdrop } from "@/hooks/useRealmBackdrop";
import { CharacterCard } from "./CharacterCard";
import { ImportJsonButton } from "./ImportJsonButton";
import { useLoadExample } from "./use-roster-actions";
import { useRosterSelection } from "./use-roster-selection";
import { useRosterBulkActions } from "./use-roster-bulk-actions";
import { RosterBulkBar } from "./RosterBulkBar";
import { FolioLoader } from "@/components/shared/FolioLoader";

/** Show the name/class filter only past this many characters — a small roster scans
 *  fine without it (mirrors the pickers' "hide search on short lists" rule). */
const ROSTER_FILTER_THRESHOLD = 6;

export function RosterPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("nav.characters"));
  // The realm's own scene plate — the Hall of Heroes (per-theme pair, DESIGN.md
  // §13) — replaces the app-wide study backdrop while the roster is mounted.
  useRealmBackdrop("var(--asset-roster-scene)");
  const navigate = useNavigate();
  const { characters, loading, error, hpReady } = useCharacters();
  const isAdmin = useIsAdmin();
  const loadExample = useLoadExample();
  const [query, setQuery] = useState("");

  // ─── Multi-select (owner 2026-06-07) — select N characters, bulk-delete now;
  //     the action list is data-driven so Export/Retire slot in later. ──────────
  const selection = useRosterSelection();
  const selectedDocs = useMemo(
    () => characters.filter((c) => selection.isSelected(c.id)),
    [characters, selection]
  );
  const bulk = useRosterBulkActions(selectedDocs, selection.cancel);

  // Focus restoration (WCAG 2.4.3): entering selection mode unmounts the focused
  // "Select" button (the bulk bar focuses its Cancel on mount); when selection mode
  // ends, return focus to the Select trigger — or the main landmark if the roster
  // emptied out and the trigger is gone.
  const wasSelecting = useRef(false);
  useEffect(() => {
    if (wasSelecting.current && !selection.selecting) {
      (
        document.getElementById("roster-select") ?? document.getElementById("main")
      )?.focus();
    }
    wasSelecting.current = selection.selecting;
  }, [selection.selecting]);

  const goCreate = () => void navigate("/characters/new");
  const createLabel = t("roster.create");
  // Free-tier cap (#29): bound the per-user character count. At the cap the Create
  // affordance is disabled with an explaining tooltip (never a silent dead-end).
  const atCharCap = characters.length >= FREE_TIER_LIMITS.characters;
  const capLabel = t("roster.atCharCap", {
    max: FREE_TIER_LIMITS.characters,
  });

  // Bilingual, accent-insensitive name/class/race/subclass filter (reuses the
  // shared matchesSearch). Empty query matches everything.
  const filtered = useMemo(
    () =>
      characters.filter((c) =>
        matchesSearch(
          query,
          c.character.name,
          // R4 — class/subclass display strings DERIVE from `classes[]` (primary).
          primaryClassName(c.character),
          c.character.race,
          primarySubclassName(c.character)
        )
      ),
    [characters, query]
  );
  // Select-all operates on the CURRENTLY VISIBLE (filtered) cards.
  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);

  return (
    // tabIndex=-1 so it can be a programmatic focus target (the focus-restore
    // fallback when the Select trigger is gone, e.g. the roster emptied out).
    <main id="main" tabIndex={-1} className="page-shell py-8">
      {/* The roster uses the SAME canonical <PageHeader> as every other hub
          (Campaigns, Compendium, Settings) so the realms read as one consistent
          surface — title + hint on the left, primary actions on the right. The brand
          wordmark already lives in the topbar, so no page-level "d20 Folio" eyebrow. */}
      <PageHeader
        as="h1"
        // The engraved brand crest rides behind the band as a whisper-faint
        // frontispiece watermark (DESIGN.md §13): every framed masthead on the
        // standard app field carries it, so the realms read as one bound folio.
        crest
        title={t("roster.title")}
        hint={t("roster.hint")}
        // The header CTAs are "add a character" (Create/Import) — orthogonal to the
        // floating selection bar's "act on the selected" actions, so they stay put and
        // fully usable during selection. Nothing in the header changes when selection
        // toggles, so there is simply no reflow to engineer around: zero jump, no hiding.
        actions={
          <>
            {/* Admin-only test tool — seeds the bundled example character. Hidden for
                everyone else (and in the dev-bypass preview, whose uid is never the
                admin uid). */}
            {isAdmin ? (
              <Button variant="ghost" onClick={() => void loadExample()}>
                <Icon as={FlaskConical} size="sm" decorative />
                {t("roster.loadExample")}
              </Button>
            ) : null}
            {/* "Select" lives on the grid toolbar below (it acts on the LIST, not the
                page) — the header keeps only the "add a character" CTAs. */}
            <ImportJsonButton />
            <Button
              onClick={goCreate}
              disabled={atCharCap}
              title={atCharCap ? capLabel : undefined}
            >
              <Icon as={Plus} size="sm" decorative />
              {createLabel}
            </Button>
          </>
        }
      />
      {atCharCap && (
        <p className="mb-4 text-sm text-text-secondary" role="status">
          {capLabel}
        </p>
      )}

      {/* While the subscription settles, show the unified FolioLoader (delayed, so the
          warm/offline-cached common case shows nothing and the cards just appear; a
          cold fetch shows the rolling d20). The page header above is already up; the
          empty-state stays gated on a settled, genuinely-empty roster. */}
      {loading ? (
        <FolioLoader variant="region" />
      ) : error ? (
        <RunicEmptyState
          className="on-art-scope"
          glyph={TriangleAlert}
          title={t("roster.errorTitle")}
          blurb={t("roster.errorBlurb")}
          // The blurb promises recovery "once you're back online" but a hard load
          // error offers no action — give it an explicit retry (H5).
          actions={
            <Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>
          }
        />
      ) : characters.length === 0 ? (
        // The first-run WELCOME — the app's first impression after login. It
        // teaches (the blurb reassures: guided, no rulebook needed; the note shows
        // the whole journey, derived from the SAME create.step* keys the wizard's
        // stepper uses — rule 6, one step name, one key) AND it ACTS: the hero
        // carries its own Create CTA at the point of attention (the empty state IS
        // the surface), the same wizard route as the header button.
        <RunicEmptyState
          className="on-art-scope"
          glyph={Users}
          eyebrow={t("roster.emptyEyebrow")}
          title={t("roster.emptyTitle")}
          titleEmphasis="folio"
          blurb={t("roster.emptyBlurb")}
          actions={
            <Button size="lg" onClick={goCreate}>
              <Icon as={Plus} size="sm" decorative />
              {createLabel}
            </Button>
          }
          note={t("roster.emptyPath", {
            steps: [
              t("create.stepClass"),
              t("create.stepRace"),
              t("create.stepBackground"),
              t("create.stepAbilities"),
              t("create.stepReview"),
            ].join(" · "),
          })}
        />
      ) : (
        <>
          {/* Grid toolbar — controls that act on the LIST live WITH the list: the
              roster size, the name/class filter (shown once the roster is big enough
              to need sifting — a handful of cards scan fine at a glance, mirroring the
              pickers' "hide the search on short lists" rule), and the multi-select
              trigger. The page header above keeps only the "add a character" CTAs. */}
          <div className="roster-toolbar">
            {/* The toolbar's loose text/control sit directly on the candlelit
                backdrop (not a card), so they MUST carry `.on-art` / `.btn.ghost
                .on-art` or they vanish on the art in light theme. */}
            <span className="roster-count on-art">
              {t("roster.count", { count: characters.length })}
            </span>
            {characters.length > ROSTER_FILTER_THRESHOLD && (
              <div className="roster-toolbar-search">
                <PickerSearch
                  bare
                  value={query}
                  onChange={setQuery}
                  placeholder={t("roster.searchPlaceholder")}
                />
              </div>
            )}
            {/* Enter multi-select — only worth offering with MORE THAN ONE character
                (bulk actions on a lone hero are a no-op). In selection mode it's hidden
                (the floating bar owns the controls) but stays in LAYOUT (`invisible`,
                not unmounted) so toggling never reflows the toolbar row — zero jump.
                id="roster-select" is the focus-restore target. Long-press / ⌘-click on a
                card is the accelerator. (`visibility:hidden` also drops it from tab
                order + a11y.) */}
            {characters.length > 1 && (
              <Button
                id="roster-select"
                variant="ghost"
                size="sm"
                className={`roster-select-btn on-art${
                  selection.selecting ? " invisible" : ""
                }`}
                onClick={() => selection.enter()}
              >
                <Icon as={ListChecks} size="sm" decorative />
                {t("roster.select")}
              </Button>
            )}
          </div>
          {filtered.length === 0 ? (
            <RunicEmptyState
              className="on-art-scope"
              glyph={SearchX}
              size="sm"
              title={t("roster.noMatchTitle")}
              blurb={t("roster.noMatchBlurb", { query })}
            />
          ) : (
            <div className="roster-grid">
              {filtered.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  // Gate the tile's HP fill on its combat-subdoc hydration so the gold
                  // bar first-paints at the real width (no full-HP placeholder slide).
                  hpReady={hpReady?.[character.id]}
                  selection={{
                    selecting: selection.selecting,
                    selected: selection.isSelected(character.id),
                    onToggle: selection.toggle,
                    onEnterWith: selection.enter,
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Floating bulk-action bar — present only in selection mode. */}
      {selection.selecting ? (
        <RosterBulkBar
          count={selection.count}
          total={filteredIds.length}
          allSelected={selection.allSelected(filteredIds)}
          onToggleAll={() => selection.toggleAll(filteredIds)}
          onCancel={selection.cancel}
          actions={bulk.actions}
          busy={bulk.busy}
          busyKey={bulk.busyKey}
        />
      ) : null}
    </main>
  );
}
