/**
 * SharedCharacterView — the PUBLIC read-only sheet behind a share link.
 *
 * Route: `/view/:uid/:charId` — mounted OUTSIDE `AuthGuard` (the only such sheet
 * route), because the whole point of a share link is a viewer with no account: a
 * friend off the app opens the URL and reads the sheet. The document path IS the
 * link; anonymous readers can fetch only the sanitized `public/sheet` projection,
 * never the private character parent or play-state child.
 *
 * It reuses the established read-only seam WHOLESALE (golden rule 3): load the doc,
 * push it into the character store through `loadReadonly` (which sets the `readonly`
 * flag every mutating affordance and the Binder's Fob already self-gate on), render
 * the SAME `CockpitView` the owner, the DM viewer and the admin viewer render. The
 * only thing this file owns is the fetch, the three states, and the noindex.
 *
 * Differences from `AdminSheetView` / `MemberSheetView`, all forced by anonymity:
 *   - ONE-SHOT projection read, not a live subscription. A public viewer has no
 *     use for a listener, and it keeps anonymous reads at exactly one billed read
 *     per view (the zero-budget discipline, golden rule 24).
 *   - No combat subdoc. `combat/state` stays owner/campaign-gated, so the public
 *     sheet shows the BUILT character with full HP, never live play state.
 *   - Revocation atomically deletes the projection, so every viewer resolves to
 *     the same honest unavailable state without reading private metadata.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { getPublicCharacter } from "@/lib/firestore";
import {
  buildPublicCharacterProjection,
  parsePublicCharacterProjection,
} from "@/lib/public-character-projection";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { resolveDevDoc } from "@/features/campaigns/useMemberCharacterDocs";
import { useCharacterStore } from "@/stores/characterStore";
import { CockpitView } from "@/features/character/CharacterCockpit";
import type { CharacterDoc } from "@/types/character";

/**
 * The dev-bypass id that stands for a REVOKED / deleted link, so the unavailable
 * page is a drivable surface (rule 15: if a state is hard to reach, build the seam).
 * Every other id resolves through the SAME `resolveDevDoc` fixture/scenario seam the
 * party + member views use, then crosses the exact projection builder/parser boundary.
 */
const DEV_REVOKED_ID = "revoked";

function loadSharedCharacter(uid: string, charId: string): Promise<CharacterDoc | null> {
  if (!DEV_BYPASS_AUTH) return getPublicCharacter(uid, charId);
  if (charId === DEV_REVOKED_ID) return Promise.resolve(null);
  return resolveDevDoc(charId).then(async (doc) => {
    const source = { ...doc, shared: true };
    const projection = await buildPublicCharacterProjection(source, source.updatedAt);
    return parsePublicCharacterProjection(uid, charId, projection);
  });
}

/**
 * Keep this page out of search indexes for as long as it is mounted. A share link
 * is unguessable and never linked from anywhere, so a crawler realistically cannot
 * reach it — this is the belt to that pair of braces, and it is the honest
 * SPA-shaped way to do it: a STATIC `robots` tag in `index.html` would deindex the
 * whole app (landing page included), and there is no server to vary the response
 * per route. Google renders JS and honours a robots tag injected this way; the tag
 * is removed on unmount so navigating on within the SPA restores the default.
 */
function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

type LoadState = "loading" | "shared" | "unavailable";

export function SharedCharacterView() {
  const { uid, charId } = useParams<{ uid: string; charId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Only the ASYNC settle writes state (never a setState during the effect — D10 /
  // `react-hooks/set-state-in-effect`); the three render states are DERIVED from it
  // below. Keyed by the link so a settle for a previous URL can never be read as
  // this one's answer.
  const [settled, setSettled] = useState<{ link: string; shared: boolean } | null>(null);
  useNoIndex();

  const link = `${uid ?? ""}/${charId ?? ""}`;

  useEffect(() => {
    if (!uid || !charId) return;
    let cancelled = false;
    const settle = (shared: boolean): void => {
      if (!cancelled) setSettled({ link: `${uid}/${charId}`, shared });
    };
    // A denied read (revoked / never shared) REJECTS with a permission error — the
    // expected outcome for a dead link, not a fault, so it resolves to the same
    // quiet page a deleted character does. Offline with nothing cached lands here
    // too: ONE page for "you cannot see this right now", whatever the reason.
    loadSharedCharacter(uid, charId)
      .then((doc) => {
        if (cancelled || !doc) {
          settle(false);
          return;
        }
        useCharacterStore.getState().loadReadonly(doc);
        settle(true);
      })
      .catch(() => settle(false));
    return () => {
      cancelled = true;
      // Never leave a stranger's character in the store for the next surface.
      useCharacterStore.getState().loadReadonly(null);
    };
  }, [uid, charId]);

  const state: LoadState =
    !uid || !charId
      ? "unavailable"
      : settled?.link !== link
        ? "loading"
        : settled.shared
          ? "shared"
          : "unavailable";

  if (state === "loading") return <FolioLoader variant="region" />;

  if (state === "unavailable") {
    return (
      <main id="main" className="page-shell on-art-scope py-12">
        <RunicEmptyState
          glyph={Link2Off}
          title={t("share.unavailableTitle")}
          blurb={t("share.unavailableBlurb")}
          actions={
            <Button size="lg" onClick={() => void navigate("/")}>
              {t("share.unavailableCta")}
            </Button>
          }
        />
      </main>
    );
  }

  // Just the sheet — the read-only marker rides the header's identity line (the ONE
  // app-wide `.ro-pill`, inside CockpitView's CombatHeader), so the public share view
  // is structurally identical to the editable sheet: no read-only row of its own
  // (owner 2026-07-31). The SOLE conversion path is the topbar's "Sign in" button; the
  // marketing card that once sat here was removed as off-tone + redundant with it
  // (owner 2026-07-31). An anonymous viewer has nowhere to navigate back TO, so this
  // surface owns no chrome at all.
  return <CockpitView />;
}
