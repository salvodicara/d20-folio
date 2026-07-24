/**
 * CharacterCockpit — the character page, composing the three cockpit regions
 * wired to live character state (Phase 3B).
 *
 * Composes the three regions by `:characterId` (mock previews/history):
 *
 *   ┌─ CombatHeader ─ identity + HP · AC·Init·Speed·PB vitals (full width) ──┐
 *   ├─────────────┬──────────────────────────────────────┬─────────────────┤
 *   │  LeftHud    │  tabs (strip at the very top)         │  RightHud       │
 *   │ (abilities· │  (Play·Spells·Inventory·Features·Bio; │ (resources·     │
 *   │  skills·    │   the turn-economy meter lives at the │  status·        │
 *   │  senses)    │   top of the Play tab)                │  defenses·prof) │
 *   └─────────────┴──────────────────────────────────────┴─────────────────┘
 *
 * HP is a slim header control (popover; a dying affordance at 0 HP) so it shows on
 * every tab. Mobile recompose: a single column — header → center (tabs) → the Left
 * ("Stats") and Right ("Resources") rails behind disclosure toggles.
 *
 * The regions bind the EXISTING scoped subscription (`useCharacterSubscription`,
 * auto-teardown on unmount — NFR-safe), so under dev-bypass the mock (Lyra Voss)
 * loads with no Firestore. The tab CONTENT
 * re-home and the live-play loop (This Turn / HP controls) land in Phase 3C / 4.
 * Owns its own `<main id="main">`.
 */

import { useId, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, Compass } from "lucide-react";
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEditModeShortcut } from "@/hooks/useEditModeShortcut";
import { useUndoRedoShortcut } from "@/hooks/useUndoRedoShortcut";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { Icon } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { cn } from "@/lib/utils";
import { DyingBanner } from "./DyingBanner";
import { BinderFob } from "./BinderFob";
import { MobileSignet } from "./MobileSignet";
import { CombatHeader } from "./center/CombatHeader";
import { TabsProvider } from "./center/TabsProvider";
import { TabStrip } from "./center/TabStrip";
import { TabBody } from "./center/TabBody";
import { PlayRefDeepLink } from "./center/PlayRefDeepLink";
import { TurnEconomyProvider } from "./center/TurnEconomyProvider";
import { LeftHud } from "./hud/LeftHud";
import { RightHud } from "./hud/RightHud";

export function CharacterCockpit() {
  const { characterId } = useParams<{ characterId: string }>();
  // The owner-edit subscription (live + auto-save). The render body is the shared
  // CockpitView, reused as-is by the read-only DM viewer (T4) with a different
  // subscription — never a fork.
  useCharacterSubscription(characterId);
  return <CockpitView />;
}

/**
 * CockpitView — the cockpit render body (header + three regions), reading purely
 * from `useCharacterStore`. Shared by the owner `CharacterCockpit` and the DM
 * read-only viewer (`MemberSheetView`): the ONLY difference is which subscription
 * fed the store + whether the store's `readonly` flag is set (which the regions
 * read via `useSheetReadonly` to hide their edit/play affordances; the DM viewer's
 * own read-only chrome lives in `MemberSheetView`). The body itself is identical.
 */
export function CockpitView() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Edit-mode signal (#60): a narrow boolean selector so a mode toggle re-renders
  // only this shell — the memoized region elements keep identity and never
  // re-render (§7.2). It activates the design-source amber EDITING frame on the
  // center content column (the `.content` surface + `data-mode`) and mounts the
  // textual banner; both are absent in play mode.
  const isEditMode = useUIStore((s) => s.sheetMode === "edit");

  // ⌘E / Ctrl+E toggles edit ↔ play (#101). Route-scoped by living here (this body
  // only mounts on the cockpit route); inert on a read-only member-sheet viewer and
  // while focus is in a text field. It drives the SAME `toggleSheetMode` action the
  // header pill uses — one edit signal, never a parallel state.
  const readonly = useSheetReadonly();
  useEditModeShortcut(readonly);
  useUndoRedoShortcut(readonly);

  // Tab title = the viewed character's name (raw, not localized). One home for
  // all three cockpit surfaces — the owner sheet, the campaign member viewer, and
  // the admin viewer all render THIS body over the same store, so the title tracks
  // whichever character the store holds.
  const characterName = useCharacterStore((s) => s.character?.character.name);
  useDocumentTitle(characterName);

  const hasCharacter = useCharacterStore((s) => s.character != null);
  // `/characters/:id` matches ANY id — a typo'd / deleted / unauthorized id is a
  // VALID route, so the path="*" 404 never fires. The subscription resolves it to
  // `{ character: null, loading: false }` (the store clears `error` on
  // setCharacter(null)); read those here and guard the render BEFORE the regions,
  // which otherwise paint a blank HUD over `character === null`.
  const loading = useCharacterStore((s) => s.loading);
  const error = useCharacterStore((s) => s.error);
  // The store starts `{ loading: false, character: null, error: null }`, and the
  // subscription only flips `loading` true in a post-paint effect — so the very
  // first frame is indistinguishable from "settled, not found". Mask just that
  // frame so a valid character never flashes not-found before its doc arrives.
  // Adjusting state DURING render (React's endorsed pattern — not a setState in an
  // effect, which the compiler rules ban) the instant the store shows ANY signal
  // (loading, a character, or an error); fires at most once, then `loading` covers
  // every later transition (an id swap re-sets loading=true synchronously).
  const [booting, setBooting] = useState(true);
  if (booting && (loading || hasCharacter || error !== null)) {
    setBooting(false);
  }

  // Render-isolation (§7.2): the persistent regions are STABLE elements, so a
  // cockpit re-render — e.g. the tab strip rewriting `?tab=` on a tab switch,
  // which bubbles a router re-render through this routed subtree — can never
  // cascade into them. Each region still re-renders on its OWN store slice (and
  // i18n) because it subscribes internally; element identity only blocks the
  // PARENT-driven reconciliation §7.2 forbids. The TabsProvider subtree is
  // intentionally NOT memoized — it owns the tab state that legitimately changes.
  const combatHeader = useMemo(() => <CombatHeader />, []);
  const leftHud = useMemo(() => <LeftHud />, []);
  const rightHud = useMemo(() => <RightHud />, []);

  // The center tabs region. The persistent `TurnEconomyProvider` wraps the whole
  // region (it owns the per-slot undo refs + the combatStore hydrate/persist
  // bookkeeping, so the in-progress turn survives a tab switch — the meter itself
  // now lives inside the Play tab). The tab strip sits at the VERY TOP of the
  // content column with the tab body directly below; both share one scoped
  // TabsProvider so a switch re-renders only those two (§7.2). Memoized as a
  // stable element so a cockpit re-render never cascades into it; the provider
  // re-renders solely on its own character/locale subscription, the TabsProvider
  // only on its own tab state.
  const turnEconomyRegion = useMemo(
    () => (
      <TurnEconomyProvider>
        <TabsProvider>
          <PlayRefDeepLink />
          <TabStrip />
          <TabBody />
        </TabsProvider>
      </TurnEconomyProvider>
    ),
    []
  );

  // While the subscription is settling, show the unified FolioLoader (the gilt d20) in
  // the content region — DELAYED, so the warm/offline-cached path (the common case)
  // shows nothing and the HUD just appears, but a genuinely cold/slow fetch shows the
  // rolling die instead of a blank screen (fixes the "open a sheet, screen is empty").
  // It must NOT render the regions (blank HUD) and never not-found (which would FLASH,
  // since fresh-mount {null,false,null} is shaped like settled-not-found — the
  // `booting` mask still distinguishes them).
  if (loading || booting) {
    return <FolioLoader variant="region" />;
  }

  // Settled with no document: a typo'd / deleted / unauthorized id. A graceful,
  // recoverable not-found (the NotFoundPage idiom) instead of a broken blank HUD.
  if (!hasCharacter) {
    return (
      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-12">
        <RunicEmptyState
          glyph={Compass}
          title={t("character.notFound")}
          blurb={t("character.notFoundBlurb")}
          actions={
            <Button size="lg" onClick={() => void navigate("/characters")}>
              {t("notFound.back")}
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-7xl px-4 py-6 lg:py-8"
      // P10 GLASS CASE — a read-only viewer (member/DM/admin) marks the whole
      // cockpit so the folio.css glass-case recipe hides every pure-commit
      // affordance (card CTAs, End Turn/Reset, add-condition/defense, spend
      // cues) while every piece of STATE stays legible. The store `readonly`
      // guards are the behavioral backstop; this is the visual-honesty seam.
      data-sheet-readonly={readonly ? "" : undefined}
    >
      {/* T4 — the read-only state is surfaced by the MemberSheetView header row
          (back button + "Read-only" chip on ONE compact line), not a banner here. */}
      {combatHeader}

      {/* The management home, split by pointer/width (`useBinderFobHome`) so
          exactly ONE renders: the Binder's Fob (the fixed coin chain) on
          fine-pointer ≥768px desktop, the Signet (one coin above the bottom nav
          that blooms its chain) on coarse/compact mobile. Both self-gate on the
          same query + own-sheet + not-readonly, and both are fixed so the tools
          are reachable at every scroll depth (no floating deep-scroll exit). */}
      <BinderFob />
      <MobileSignet />

      {/* A knockout (0 HP) lights a prominent danger strip on EVERY tab — the
          markable death saves + a quick heal — paired with the header's compact
          "0 HP · Dying" pill. Renders nothing above 0 HP. */}
      <DyingBanner />

      {/* #10 — below the rail threshold the two rail toggles are CO-LOCATED at
          the top via `order` (Stats, Resources, then the center), so both HUDs
          are reachable together without scrolling past the tall tab body. DOM
          order stays center→left→right (so keyboard/SR focus order is
          center-first on every viewport); `order` only repaints the recomposed
          flow, and the `rail:` explicit column placement leaves the ≥1180
          three-column grid UNCHANGED. */}
      {/* `[overflow-anchor:none]` — STOP THE RAIL JUMP. Expanding an action card
          DOWN the (long) Play board changes the page's content height; the
          browser's CSS scroll-anchoring then adjusts window.scrollY to keep its
          chosen anchor visually fixed, which visibly SHIFTS the whole cockpit —
          including the lateral rails, which are normal-flow grid items that scroll
          with the page (the `lg:items-start` rails never move in the grid; the
          shift was the viewport re-anchor). Excluding this subtree from anchor
          selection removes the reanchor so a card-expand never nudges the page —
          while the rails STILL scroll with it (NOT sticky/pinned). */}
      {/* The three-column HUD mounts at the `rail:` breakpoint (--bp-rail 1180px,
          DESIGN.md §11) — NOT `lg:` (1024): between 1024–1179 (iPad landscape)
          three columns squeezed the center to ~400px, narrower than a phone, so
          the whole tablet band keeps the recomposed single-column cockpit. */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 [overflow-anchor:none] rail:grid-cols-[16rem_minmax(0,1fr)_18rem] rail:items-start rail:gap-y-8">
        {/* ── CENTER — health · this turn · tabs (mobile: after the rails) ──── */}
        {/* `.content` + `data-mode` activate the design-source amber EDITING
            frame (immutable folio.css `.content[data-mode="edit"]::before`) that
            hugs this content column in edit mode; absent in play. */}
        <div
          data-mode={isEditMode ? "edit" : undefined}
          // #71 — horizontal padding so the tab strip, filters, and card lists
          // aren't flush to the `.content` column edge (and clear the inset
          // `.content[data-mode=edit]` amber frame ring). The frame `::before` is
          // inset:0 over the padding box, so it still hugs the column edge while
          // the content breathes inside.
          //
          // `isolate` — the design-source amber EDITING frame (`.content[data-mode=
          // edit]::before`) is `z-index: var(--z-sticky)` (100), the SAME layer as
          // the topbar; in a plain `position: relative` column that z escapes to the
          // root context and (being later in DOM) paints OVER the topbar on scroll —
          // the gold frame "leaks into the header" and collides with the sticky edit
          // banner. Forming a stacking context here confines that z:100 to this
          // column, so the topbar (z:100 at root) and the z:99 banner both stay
          // cleanly above the frame as it scrolls beneath them.
          className="content isolate flex flex-col px-3 pt-3 max-rail:order-3 rail:col-start-2 rail:row-start-1"
        >
          {turnEconomyRegion}
        </div>

        {/* ── LEFT — abilities · skills · senses (mobile: "Stats" sheet) ───── */}
        <aside
          aria-label={t("character.hud.statsRegion")}
          className="max-rail:order-1 rail:col-start-1 rail:row-start-1"
        >
          <MobileDisclosure label={t("character.hud.stats")}>{leftHud}</MobileDisclosure>
        </aside>

        {/* ── RIGHT — resources · status · defenses (mobile: "Resources") ──── */}
        <aside
          aria-label={t("character.hud.resourcesRegion")}
          className="max-rail:order-2 rail:col-start-3 rail:row-start-1"
        >
          <MobileDisclosure label={t("character.hud.resources")}>
            {rightHud}
          </MobileDisclosure>
        </aside>
      </div>
    </main>
  );
}

/**
 * A rail wrapper that, below the rail threshold (--bp-rail 1180px), collapses
 * its region behind a labeled toggle (the mock's bottom "Stats" / "Resources"
 * sheets) and, on the three-column desktop (≥ `rail:`), is always open as a
 * side column — the toggle hides and the body is forced visible.
 */
function MobileDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex w-full items-center justify-between rounded-md border border-border-subtle bg-bg-secondary px-3 py-2 rail:hidden",
          // Only space below the bar when it's expanded (a collapsed bar's margin
          // just bloated the gap between the Stats and Resources sheets).
          open && "mb-3"
        )}
      >
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-text-secondary">
          {label}
        </span>
        <Icon
          as={ChevronDown}
          size="sm"
          decorative
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={bodyId} className={cn("rail:block", !open && "max-rail:hidden")}>
        {children}
      </div>
    </>
  );
}
