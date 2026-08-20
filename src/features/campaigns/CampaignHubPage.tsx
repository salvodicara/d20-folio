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
 * IA — a compact campaign WORKSPACE, not one permanently expanded document. Real local
 * tabs separate Live (Party/Encounter + current recap), Journal (Chronicle + Notes),
 * Resources (Treasury + Access), and manager-only DM tasks. Inactive panels remain mounted
 * so drafts and disclosures survive task switches; the selected workspace is remembered per
 * campaign. This is navigation by table activity, not a decorative anchor index.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import "./encounter.css";
import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router";
import { AlertTriangle, Coins, Crown, Users } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { FolioBookIcon, FolioCombatIcon } from "@/components/shared/folio-icons";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorBoundary, SectionErrorFallback } from "@/components/shared/ErrorBoundary";
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

type CampaignWorkspaceView = "live" | "journal" | "resources" | "dm";

/**
 * CampaignWorkspaceNav — the campaign's compact local workspace switcher.
 *
 * These are real tabs: only one task-context participates in layout, while every panel
 * remains mounted so an in-progress editor survives local view changes. The selected
 * view is remembered per campaign; no domain state is copied into the navigation.
 */
function CampaignWorkspaceNav({
  value,
  onChange,
  encounterRunning,
  canManage,
}: {
  value: CampaignWorkspaceView;
  onChange: (view: CampaignWorkspaceView) => void;
  encounterRunning: boolean;
  canManage: boolean;
}) {
  const { t } = useTranslation();

  const items = [
    {
      id: "live" as const,
      label: t("campaignHub.workspaceLive"),
      icon: encounterRunning ? FolioCombatIcon : Users,
      live: encounterRunning,
    },
    {
      id: "journal" as const,
      label: t("campaignHub.workspaceJournal"),
      icon: FolioBookIcon,
    },
    {
      id: "resources" as const,
      label: t("campaignHub.workspaceResources"),
      icon: Coins,
    },
    ...(canManage
      ? [
          {
            id: "dm" as const,
            label: t("campaignHub.dmTools"),
            icon: Crown,
          },
        ]
      : []),
  ];

  return (
    <div
      className="campaign-table-nav"
      role="tablist"
      aria-label={t("campaignHub.workspaceNavAria")}
    >
      <div className="campaign-table-nav-track">
        {items.map((item) => (
          <button
            type="button"
            role="tab"
            key={item.id}
            id={`campaign-tab-${item.id}`}
            aria-controls={`campaign-panel-${item.id}`}
            aria-selected={value === item.id}
            aria-label={item.label}
            className="campaign-table-nav-item"
            data-live={item.live || undefined}
            onClick={() => onChange(item.id)}
          >
            <span className="campaign-table-nav-seal" aria-hidden>
              <Icon as={item.icon} size="sm" decorative />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function readWorkspace(campaignId: string): CampaignWorkspaceView {
  try {
    const value = localStorage.getItem(`d20.campaignWorkspace.${campaignId}`);
    return value === "journal" || value === "resources" || value === "dm"
      ? value
      : "live";
  } catch {
    return "live";
  }
}

function CampaignWorkspace({
  campaignId,
  campaignName,
  encounterRunning,
  canManage,
}: {
  campaignId: string;
  campaignName: string;
  encounterRunning: boolean;
  canManage: boolean;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<CampaignWorkspaceView>(() => {
    const remembered = readWorkspace(campaignId);
    return remembered === "dm" && !canManage ? "live" : remembered;
  });
  const activeView = view === "dm" && !canManage ? "live" : view;

  function selectView(next: CampaignWorkspaceView): void {
    const safe = next === "dm" && !canManage ? "live" : next;
    if (safe === activeView) return;
    setView(safe);
    try {
      localStorage.setItem(`d20.campaignWorkspace.${campaignId}`, safe);
    } catch {
      // Storage-disabled browsers still retain the view for this mount.
    }
    // A newly selected task must begin at its own readable start. Without this,
    // switching from a long Live recap inherited the old page offset and could
    // open Journal/Resources/DM halfway down, with the section title hidden above
    // the sticky workspace bar. Panels remain mounted, so drafts and disclosure
    // state survive; only the viewport returns to the shared task boundary.
    workspaceRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }

  return (
    <>
      <CampaignWorkspaceNav
        value={activeView}
        onChange={selectView}
        encounterRunning={encounterRunning}
        canManage={canManage}
      />
      <div ref={workspaceRef} className="on-art-scope campaign-workspace">
        <section
          id="campaign-panel-live"
          role="tabpanel"
          aria-labelledby="campaign-tab-live"
          hidden={activeView !== "live"}
          className="campaign-workspace-panel campaign-live-grid"
        >
          <IsolatedSection>
            <Party />
          </IsolatedSection>
          <IsolatedSection>
            <div className="campaign-live-recap">
              <Sessions campaignId={campaignId} liveDesk />
            </div>
          </IsolatedSection>
        </section>

        <section
          id="campaign-panel-journal"
          role="tabpanel"
          aria-labelledby="campaign-tab-journal"
          hidden={activeView !== "journal"}
          className="campaign-workspace-panel campaign-journal-grid"
        >
          <IsolatedSection>
            <Chronicle campaignId={campaignId} campaignName={campaignName} />
          </IsolatedSection>
          <IsolatedSection>
            <SharedNotes />
          </IsolatedSection>
        </section>

        <section
          id="campaign-panel-resources"
          role="tabpanel"
          aria-labelledby="campaign-tab-resources"
          hidden={activeView !== "resources"}
          className="campaign-workspace-panel campaign-resources-grid"
        >
          <IsolatedSection>
            <Treasury />
          </IsolatedSection>
          <IsolatedSection>
            <CampaignInvite canManage={canManage} />
          </IsolatedSection>
        </section>

        {canManage && (
          <section
            id="campaign-panel-dm"
            role="tabpanel"
            aria-labelledby="campaign-tab-dm"
            hidden={activeView !== "dm"}
            className="campaign-workspace-panel"
          >
            <IsolatedSection>
              <DmTools />
            </IsolatedSection>
          </section>
        )}
      </div>
    </>
  );
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
      <main id="main" className="wb page-shell py-8">
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
    <main id="main" className="wb page-shell py-8">
      {/* SLIM hub header (owner 2026-06-30) — the big 3:1 hero band was retired so
          the Party/combat sit in the fold; the campaign's art is now the page's
          atmospheric `--app-bg-art` backdrop (above). This is the SAME framed
          `PageHeader` the campaigns LIST opens on, so every campaign surface reads
          as one family. The title is the DM's inline-editable name (members see it
          read-only); the hint carries the at-a-glance member count + DM status; the
          action slot holds the set/change-art affordance. */}
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
      <CampaignWorkspace
        key={campaignId}
        campaignId={campaignId}
        campaignName={campaign.name}
        encounterRunning={campaign.encounter !== null}
        canManage={canManage}
      />
    </main>
  );
}
