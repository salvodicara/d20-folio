/**
 * An invite link on the new frame (`/join/:code`): it joins and opens the campaign; a
 * link that did not work says so in one tile with the way back to the campaigns (the
 * unknown page's grammar). The same `joinCampaign` the old route used.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import { joinCampaign } from "@/features/campaigns/campaign-io";
import { useAuthStore } from "@/stores/authStore";
import { Button, Icon } from "@/ui";

export function JoinScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const user = useAuthStore((s) => s.user);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);
  useEffect(() => {
    if (!code || !user || tried.current) return;
    tried.current = true;
    joinCampaign(user.uid, code, user.displayName ?? "", user.photoURL ?? null)
      .then((id) => void navigate(`/campaigns/${id}`, { replace: true }))
      .catch(() => setFailed(true));
  }, [code, user, navigate]);
  return (
    <main id="main" className="f-page f-roster">
      {failed ? (
        <section className="f-roster-empty f-notfound">
          <div className="f-tile">
            <Icon name="g-invite" size={48} />
            <span className="f-lbl">{t("campaigns.joinLink.invalidEyebrow")}</span>
            <h1>{t("campaigns.joinLink.invalidTitle")}</h1>
            <span>{t("campaigns.joinLink.invalidBlurb")}</span>
            <Button kind="primary" onClick={() => void navigate("/campaigns")}>
              {t("campaigns.joinLink.backToCampaigns")}
            </Button>
          </div>
        </section>
      ) : (
        <p role="status">{t("campaigns.joinLink.joining")}</p>
      )}
    </main>
  );
}
