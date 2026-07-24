/**
 * CampaignHubPage — a single campaign (Phase 5 · Part 2b).
 *
 * Holds exactly ONE scoped campaign listener (`useCampaignSubscription`, routed
 * through the §7.1 abstraction): it opens on mount and DETACHES on unmount / route
 * change / leave — the "scoped + detached listeners" the Phase-5 gate requires.
 * The hidden Personal Campaign is NEVER a `/campaigns` document, so the sentinel
 * id is redirected away (never surfaced as a campaign). Renders loading / error /
 * not-found, then the Party · Treasury · Shared-notes sections.
 *
 * Under dev-bypass the listener opens nothing; a fixture is seeded so the hub (and
 * the create/join → hub flow) renders locally + in e2e (see `dev-fixture.ts`).
 *
 * IA — a TWO-BAND dashboard (CAMP-2/3), NOT a cockpit of mutually-exclusive panels (it
 * deliberately does NOT use the cockpit `TabStrip`):
 *   • PLAY band — the Party, full-width on top, always open. The thing the table reads
 *     every session (live HP/AC/conditions + the encounter layer).
 *   • MANAGE band — below, a `lg:grid-cols-2` dashboard (one column on mobile) read
 *     top-to-bottom in read-frequency order. CHRONICLE leads, full width, as a book-
 *     spread (reading column + chapter rail); then the SESSIONS | SHARED-NOTES pair
 *     (latest-item + add); then the compact TREASURY | ACCESS utility pair; and DM Tools
 *     (role / danger only) as the full-width foot. Each MANAGE section is a FIXED
 *     at-a-glance panel + a collapsible DETAIL slot, sticky per campaign
 *     ({@link SectionPanel}); Party never collapses.
 */

import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router";
import { AlertTriangle, Users } from "lucide-react";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorBoundary, SectionErrorFallback } from "@/components/shared/ErrorBoundary";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { transitionBackdrop } from "@/lib/backdrop-transition";
import { cropToBackgroundPosition, cropZoomFactor } from "@/lib/portrait-crop";
import type { PortraitCrop } from "@/types/character";
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import { useAuthStore } from "@/stores/authStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  useCampaignStore,
  campaignMemberCount,
} from "@/features/campaigns/campaignStore";
import { useCampaignSubscription } from "@/features/campaigns/useCampaignSubscription";
import { useChronicleSubscription } from "@/features/campaigns/useChronicleSubscription";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { conformCampaignMembers } from "@/features/campaigns/campaign-io";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";
import { CampaignArtControl } from "@/features/campaigns/CampaignArtControl";
import { Party } from "@/features/campaigns/Party";
import { CampaignInvite } from "@/features/campaigns/CampaignInvite";
import { Chronicle } from "@/features/campaigns/Chronicle";
import { Sessions } from "@/features/campaigns/Sessions";
import { Treasury } from "@/features/campaigns/Treasury";
import { SharedNotes } from "@/features/campaigns/SharedNotes";
import { DmTools } from "@/features/campaigns/DmTools";

/**
 * The bundled default campaign backdrop — the war-table plate, fed to the app's
 * existing `--app-bg-art` variable (so it renders under the app-owned scrim, NOT
 * a new band) whenever the DM hasn't set custom campaign art. Referenced through
 * the PER-THEME `--asset-campaign-backdrop` token (index.css), so each theme
 * paints — and downloads — its own sibling plate (candlelit night in dark,
 * daylight morning in light) and a live theme switch swaps it with no JS. Falls
 * back gracefully like every other asset.
 */
const CAMPAIGN_BACKDROP = "var(--asset-campaign-backdrop)";

/**
 * Atmosphere under content (DESIGN.md §7 craft law 3): paint the campaign's art —
 * the DM's custom banner when set, else the bundled backdrop — as the app's
 * existing viewport-fixed `--app-bg-art` layer for as long as the hub is mounted.
 * This REUSES the one global backdrop mechanism (`body::after` reads `--app-bg-art`
 * at the document root + the app's own scrim/grain) rather than building a second
 * one, so the campaign art sits atmospherically under the legible scrimmed cards.
 * The variable is restored to the app default on unmount / route change.
 *
 * The crop drives the backdrop: a DM's custom art is framed by the SAME 16:9 crop
 * the card shows — BOTH position AND zoom. Its focal (`bannerCrop` centre →
 * `cropToBackgroundPosition`) positions the `cover` backdrop via
 * `--app-bg-art-position`, and its zoom (`cropZoomFactor` → `--app-bg-art-scale`)
 * scales the backdrop up around that focal (`transform: scale()` in `body::after`),
 * so a tightly-cropped banner shows the SAME tight framing the card does rather than
 * the whole un-zoomed image. The default asset (or an un-cropped banner) leaves the
 * variables unset → the global `center top`, `scale(1)` defaults (pixel-identical).
 */
function useCampaignBackdrop(
  bannerUrl: string | null,
  bannerCrop: PortraitCrop | null
): void {
  useEffect(() => {
    const html = document.documentElement;
    const root = html.style;
    // Every swap rides the backdrop crossfade (scene dissolves into scene —
    // reduced motion keeps the hard cut). The attribute + focal/zoom mutations
    // ride the SAME transition as the art: the ghost snapshots the painter's
    // computed state (image, focal, veil, presence) before any of it changes.
    transitionBackdrop(() => {
      root.setProperty(
        "--app-bg-art",
        bannerUrl ? `url("${bannerUrl}")` : CAMPAIGN_BACKDROP
      );
      // Custom art is ANY image — both themes carve its presence back to 0.55
      // and the light theme veils it (`data-app-bg-custom`, the index.css
      // glaze) so an arbitrary upload sits harmoniously under the chrome; the
      // bundled per-theme plates render native (no veil, full presence).
      if (bannerUrl) html.setAttribute("data-app-bg-custom", "");
      // Only a custom banner carries a crop; the default asset stays centred + unscaled.
      const position = bannerUrl ? cropToBackgroundPosition(bannerCrop) : null;
      if (position) {
        root.setProperty("--app-bg-art-position", position);
        // The focal is also the zoom pivot, so scaling keeps "where they cropped" centred.
        root.setProperty("--app-bg-art-scale", String(cropZoomFactor(bannerCrop)));
      } else {
        root.removeProperty("--app-bg-art-position");
        root.removeProperty("--app-bg-art-scale");
      }
    });
    return () => {
      transitionBackdrop(() => {
        root.removeProperty("--app-bg-art");
        root.removeProperty("--app-bg-art-position");
        root.removeProperty("--app-bg-art-scale");
        html.removeAttribute("data-app-bg-custom");
      });
    };
  }, [bannerUrl, bannerCrop]);
}

export function CampaignHubPage() {
  const { campaignId } = useParams();
  // Personal is the invisible solo world-layer, never a campaign — redirect it
  // (and any missing id) back to the realm list.
  if (!campaignId || campaignId === PERSONAL_CAMPAIGN_ID) {
    return <Navigate to="/campaigns" replace />;
  }
  return <CampaignHub campaignId={campaignId} />;
}

/**
 * Per-section fault isolation (Layer 4): wrap each independent hub section in the
 * shared {@link ErrorBoundary} with the compact {@link SectionErrorFallback}, so an
 * unforeseen render error in ONE section degrades to a quiet in-place notice while
 * every sibling section keeps rendering — the hub never white-screens as a whole.
 * Belt-and-suspenders behind the data-model + type-safety + guardrail layers; the
 * route-level `RouteErrorBoundary` remains the outer net.
 */
function IsolatedSection({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => <SectionErrorFallback error={error} onReset={reset} />}
    >
      {children}
    </ErrorBoundary>
  );
}

/** Dev-bypass only: seed a fixture campaign so the hub renders without Firestore. */
function useDevCampaignSeed(campaignId: string): void {
  useEffect(() => {
    if (!DEV_BYPASS_AUTH) return;
    const store = useCampaignStore.getState();
    if (store.campaign?.id !== campaignId) {
      // Route the in-memory fixture through the SAME member-snapshot read boundary
      // the real Firestore read uses, so a corrupt (nameless) member snapshot is
      // rejected (its `character` → null) identically in dev (non-nullability).
      const fixture = makeDevCampaign(campaignId);
      store.setCampaign({
        ...fixture,
        memberDetails: conformCampaignMembers(fixture.memberDetails),
      });
    }
  }, [campaignId]);
}

function CampaignHub({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  useCampaignSubscription(campaignId);
  // The chronicle listener lives HERE (not inside <Chronicle>) so the hub can
  // COMPOSE ONCE: painting the sections before the chronicle's first snapshot
  // meant the book-spread grew ~200px a beat after mount and shoved Sessions /
  // Notes / Treasury / DM Tools down mid-read (the nav-feel "page reorganizes
  // itself" jump). The loading gate below holds the FolioLoader until BOTH
  // initial snapshots have landed, so the hub always paints fully formed.
  useChronicleSubscription(campaignId);
  useDevCampaignSeed(campaignId);
  const campaign = useCampaignStore((s) => s.campaign);
  const error = useCampaignStore((s) => s.error);
  const chronicleLoading = useChronicleStore((s) => s.loading);
  const setName = useCampaignStore((s) => s.setName);
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  // Paint the campaign art (custom banner, else the bundled backdrop) under the
  // app's own scrim for as long as the hub is mounted — atmosphere under content.
  useCampaignBackdrop(campaign?.bannerUrl ?? null, campaign?.bannerCrop ?? null);
  const ready = campaign !== null && !chronicleLoading;
  // Tab title = the campaign name (base brand until it loads).
  useDocumentTitle(campaign?.name);

  if (!ready) {
    // Settled with an error → a recoverable not-found. Still loading (either
    // initial snapshot) → the unified FolioLoader (delayed, so a warm/offline-
    // cached hub shows nothing and just appears; a cold fetch shows the rolling
    // d20 instead of a blank screen). A chronicle ERROR is not a hub error: its
    // onError settles `loading` false, so the hub still renders (the section
    // shows its empty state) — the gate can never wedge on a denied chronicle.
    if (!error) return <FolioLoader variant="region" />;
    return (
      <main id="main" className="page-shell py-8">
        <RunicEmptyState
          glyph={AlertTriangle}
          title={t("campaignHub.notFound")}
          blurb={t("campaignHub.notFoundBlurb")}
        />
      </main>
    );
  }

  // The DM may rename the campaign inline (debounce-persisted; `name` is in
  // CampaignWritable + the save selector) — clean text at rest, editable on intent
  // via the quiet affordance (#83/#86). Members see the name read-only.
  const isDm = campaign.dmUid === uid;
  // D29 — the admin (owner) overrides every campaign: they may manage one they
  // don't run (rename, DM tools), but the "you are the DM" line stays truthful.
  const canManage = isDm || isAdmin;
  const members = campaignMemberCount(campaign);

  return (
    <main id="main" className="page-shell py-8">
      {/* SLIM hub header (owner 2026-06-30) — the big 3:1 hero band was retired so
          the Party/combat sit in the fold; the campaign's art is now the page's
          atmospheric `--app-bg-art` backdrop (above). This is the SAME framed
          `PageHeader` the campaigns LIST opens on, so every campaign surface reads
          as one family. The title is the DM's inline-editable name (members see it
          read-only); the hint carries the at-a-glance member count + DM status; the
          action slot holds the set/change-art affordance. NO `crest`: this masthead
          is art-backed (the campaign's own art is the backdrop), so its art is the
          frontispiece — the crest rides only the framed mastheads on the standard
          app field (DESIGN.md §13). */}
      <PageHeader
        as="h1"
        title={
          canManage ? (
            <InlineEditable
              type="text"
              editable
              value={campaign.name}
              onChange={(v) => setName(v)}
              ariaLabel={t("campaignHub.renameAria")}
            />
          ) : (
            campaign.name
          )
        }
        hint={
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden className="h-4 w-4" />
            {t("campaigns.memberCount", { count: members })}
            {isDm ? ` · ${t("campaignHub.youAreDm")}` : ""}
          </span>
        }
        actions={
          <IsolatedSection>
            <CampaignArtControl />
          </IsolatedSection>
        }
      />
      <div className="on-art-scope flex flex-col gap-12">
        {/* PLAY band — the Party leads, full-width + always open (never collapsible). */}
        <IsolatedSection>
          <Party />
        </IsolatedSection>
        {/* MANAGE band — a two-column dashboard read top-to-bottom in read-frequency
            order. The grid flows: Chronicle (full-width book-spread) · Sessions /
            Shared-notes (the latest-item pair) · Treasury / Access (the compact utility
            pair) · DM Tools (full-width foot, role/danger only). Chronicle + DM Tools
            span both columns (`lg:col-span-2`, applied to their own panel root); DM
            Tools renders null for a non-manager, so the page simply ends at the utility
            pair (no phantom trailing cell). Each cell takes its own height (items-start)
            so a folded section never stretches to its neighbour. */}
        <div className="campaign-hub-grid grid gap-x-6 gap-y-12 lg:grid-cols-2 lg:items-start">
          {/* CHRONICLE — the shared story, full width; inside, a book-spread (reading
              column + chapter rail) on desktop. */}
          <IsolatedSection>
            <Chronicle campaignId={campaignId} campaignName={campaign.name} />
          </IsolatedSection>
          {/* SESSIONS | SHARED NOTES — the latest-item + add pair. */}
          <IsolatedSection>
            <Sessions campaignId={campaignId} />
          </IsolatedSection>
          <IsolatedSection>
            <SharedNotes />
          </IsolatedSection>
          {/* TREASURY | ACCESS — the compact utility pair. Access (invite/share) is
              UNGATED (every member grows the table); its lock-joins kill switch is
              DM/admin-gated and sits with the link it disables. */}
          <IsolatedSection>
            <Treasury />
          </IsolatedSection>
          <IsolatedSection>
            <CampaignInvite canManage={canManage} />
          </IsolatedSection>
          {/* DM Tools (role / danger only) — full-width foot; renders null for
              non-managers, so it never reserves a grid cell for a player. */}
          <IsolatedSection>
            <DmTools />
          </IsolatedSection>
        </div>
      </div>
    </main>
  );
}
