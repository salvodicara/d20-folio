/**
 * AdminSheetView — an admin opens ANY user's character as a READ-ONLY sheet.
 *
 * Route: `/admin/users/:uid/characters/:charId`. Reached from the admin console's
 * per-user drill-down. It REUSES the exact MemberSheetView render path — the shared
 * `useMemberCharacterSubscription` (which loads the member's REAL character doc via
 * the SAME `subscribeToCharacter` the owner's cockpit uses, into the shared store
 * with the `readonly` flag) + the SAME read-only `CockpitView`. The admin read is
 * authorized server-side by `firestore.rules` (character read: `… || isAdmin()`), so
 * there is NO campaign scoping and NO rules change — admin override alone grants it.
 *
 * Every mutating affordance hides/disables via the store's `readonly` flag (the same
 * backstop MemberSheetView relies on), so this is a pure inspection surface.
 */

import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useMemberCharacterSubscription } from "@/features/campaigns/useMemberCharacterSubscription";
import { useCharacterStore } from "@/stores/characterStore";
import { CockpitView } from "@/features/character/CharacterCockpit";

export function AdminSheetView() {
  const { uid, charId } = useParams<{ uid: string; charId: string }>();
  const isAdmin = useIsAdmin();
  // Gate on admin alone (the same gate the console uses); a non-admin is bounced.
  if (!isAdmin) return <Navigate to="/" replace />;
  if (!uid || !charId) return <Navigate to="/admin" replace />;
  return <AdminSheet uid={uid} charId={charId} />;
}

function AdminSheet({ uid, charId }: { uid: string; charId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // The SAME read-only load path the member/DM sheet uses — admin read is granted
  // server-side, so no campaign is needed.
  useMemberCharacterSubscription(uid, charId);

  const character = useCharacterStore((s) => s.character);
  const loading = useCharacterStore((s) => s.loading);

  if (loading || !character) return <FolioLoader variant="region" />;

  // The SAME compact read-only header row MemberSheetView floats on the backdrop art:
  // a ghost back button inline-left, a quiet "Read-only" status chip inline-right.
  return (
    <div className="flex flex-col">
      <div className="on-art-scope mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => void navigate("/admin")}>
          <Icon as={ArrowLeft} size="sm" decorative />
          {t("admin.backToConsole")}
        </Button>
        <span role="status" className="toolbar-chip" title={t("dmView.readonlyTip")}>
          <Icon as={Eye} size="sm" decorative />
          {t("dmView.readonly")}
        </span>
      </div>
      <CockpitView />
    </div>
  );
}
