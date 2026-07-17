/**
 * JoinCampaignModal — join a shared campaign by pasting an invite (Phase 5 · Part 2b).
 *
 * Industry-standard "paste your invite": the single field accepts the whole invite
 * LINK (`…/join/<CODE>`) OR a bare code — the app extracts the code so the user does
 * the least possible work. Calls `joinCampaign` (the 2a io boundary): a blind
 * `arrayUnion` self-add the `firestore.rules` "controlled self-join" path validates
 * (the joiner needs no read access first — the code IS the campaign id). On success
 * it navigates to the hub; an invalid code surfaces a friendly inline error. Under
 * dev-bypass it persists nothing and the hub seeds a fixture (see `dev-fixture.ts`).
 *
 * It never imports `firebase/firestore`: every Firestore touch goes through
 * `campaign-io`.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ModalShell } from "@/components/shared/ModalShell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { joinCampaign } from "@/features/campaigns/campaign-io";
import { inviteCodeFromInput } from "@/features/campaigns/invite-code";

export function JoinCampaignModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);
  const displayName = useAuthStore((s) => s.profile?.displayName ?? "");
  const photoURL = useAuthStore((s) => s.user?.photoURL ?? null);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose(): void {
    setCode("");
    setBusy(false);
    setError(null);
    onClose();
  }

  async function handleJoin(): Promise<void> {
    const parsed = inviteCodeFromInput(code);
    if (!uid || !parsed) return;
    setBusy(true);
    setError(null);
    try {
      const id = await joinCampaign(uid, parsed, displayName, photoURL);
      handleClose();
      void navigate(`/campaigns/${id}`);
    } catch (e) {
      setError(t("campaigns.joinError"));
      void e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      compact
      size="md"
      rubric={t("campaigns.rubric")}
      title={t("campaigns.joinTitle")}
    >
      <div className="modal-body flex flex-col gap-4">
        <p className="text-sm text-text-secondary">{t("campaigns.joinBlurb")}</p>
        <Field
          label={t("campaigns.inviteLink")}
          help={error ? undefined : t("campaigns.joinInviteHint")}
          error={error ?? undefined}
        >
          {(props) => (
            <Input
              {...props}
              value={code}
              autoFocus
              spellCheck={false}
              placeholder={t("campaigns.joinInvitePlaceholder")}
              className="font-mono text-xs"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleJoin();
              }}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={code.trim().length === 0}
            onClick={() => void handleJoin()}
          >
            {t("campaigns.join")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
