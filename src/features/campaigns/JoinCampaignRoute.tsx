/**
 * JoinCampaignRoute — the shareable-invite-link landing (#33). A DM shares
 * `<origin>/join/<inviteCode>`; opening it (authenticated, via AuthGuard) joins
 * the campaign whose id == that code and redirects to its hub. The invite code IS
 * the campaign document id, so the joiner resolves the campaign from the link with
 * no read access (the rules' controlled self-join). Invalid / unreachable codes
 * land on a recoverable empty state instead of a dead end.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { joinCampaign } from "./campaign-io";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { Button } from "@/components/ui/button";

export function JoinCampaignRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const user = useAuthStore((s) => s.user);
  const [error, setError] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!code || !user || attempted.current) return;
    attempted.current = true;
    joinCampaign(user.uid, code, user.displayName ?? "", user.photoURL ?? null)
      .then((id) => navigate(`/campaigns/${id}`, { replace: true }))
      .catch(() => setError(true));
  }, [code, user, navigate]);

  if (error) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-12">
        <RunicEmptyState
          className="on-art-scope"
          glyph={Compass}
          eyebrow={t("campaigns.joinLink.invalidEyebrow")}
          title={t("campaigns.joinLink.invalidTitle")}
          blurb={t("campaigns.joinLink.invalidBlurb")}
          actions={
            <Button size="lg" onClick={() => void navigate("/campaigns")}>
              {t("campaigns.joinLink.backToCampaigns")}
            </Button>
          }
        />
      </main>
    );
  }

  return <FolioLoader variant="region" label={t("campaigns.joinLink.joining")} />;
}
