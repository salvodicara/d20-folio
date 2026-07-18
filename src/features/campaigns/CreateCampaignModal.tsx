/**
 * CreateCampaignModal — start a shared campaign (Phase 5 · Part 2b).
 *
 * Two phases in one ModalShell: a name form → a "share this invite link" success
 * view. Calls `createCampaign` (the 2a io boundary) which seeds the A13 invariants
 * and returns the new campaign id (== its invite code). The owner copies the invite
 * LINK to share (the code is embedded in it), then opens the hub. Under dev-bypass
 * `createCampaign` persists nothing and returns a generated code (the hub seeds a
 * fixture) — see `dev-fixture.ts`.
 *
 * It never imports `firebase/firestore`: every Firestore touch goes through
 * `campaign-io`.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ModalShell } from "@/components/shared/ModalShell";
import { retireTopOverlayThen } from "@/lib/overlay-history";
import { CopyButton } from "@/components/shared/CopyButton";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { createCampaign } from "@/features/campaigns/campaign-io";

export function CreateCampaignModal({
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

  const [name, setName] = useState("");
  const [phase, setPhase] = useState<"form" | "done">("form");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setName("");
    setPhase("form");
    setCode("");
    setBusy(false);
    setError(null);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (!uid || !trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createCampaign(uid, { name: trimmed, displayName, photoURL });
      setCode(id);
      setPhase("done");
    } catch (e) {
      setError(t("campaigns.createError"));
      void e;
    } finally {
      setBusy(false);
    }
  }

  // The invite is a LINK; the code is just the doc id embedded in it (de-dup pass).
  const inviteLink =
    (typeof window !== "undefined" ? window.location.origin : "") + `/join/${code}`;

  function openHub(): void {
    const id = code;
    handleClose();
    // Race-free close-then-navigate: retire the modal's Back sentinel and
    // navigate only once its back() traversal LANDS — never a navigation the
    // in-flight rewind undoes, and no dead same-key Back entry left behind.
    retireTopOverlayThen(() => void navigate(`/campaigns/${id}`));
  }

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      compact
      size="md"
      rubric={t("campaigns.rubric")}
      title={phase === "form" ? t("campaigns.createTitle") : t("campaigns.createdTitle")}
    >
      <div className="modal-body flex flex-col gap-4">
        {phase === "form" ? (
          <>
            <p className="text-sm text-text-secondary">{t("campaigns.createBlurb")}</p>
            <Field label={t("campaigns.nameLabel")} error={error ?? undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  maxLength={60}
                  autoFocus
                  placeholder={t("campaigns.namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
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
                disabled={name.trim().length === 0}
                onClick={() => void handleCreate()}
              >
                {t("campaigns.create")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-text-secondary">{t("campaigns.createdBlurb")}</p>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-text-secondary">
                {t("campaigns.inviteLink")}
              </span>
              <p className="mb-1 text-xs text-text-muted">
                {t("campaigns.inviteLinkHint")}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={inviteLink}
                  aria-label={t("campaigns.inviteLink")}
                  className="font-mono text-xs"
                />
                <CopyButton
                  value={inviteLink}
                  toastMessage={t("campaigns.linkCopied")}
                  label={t("common.copy")}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose}>
                {t("common.close")}
              </Button>
              <Button variant="primary" onClick={openHub}>
                {t("campaigns.openHub")}
              </Button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
