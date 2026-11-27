/**
 * «Gestisci la campagna» on the new campaign screen (the classic DM tools, invite card
 * and inline rename; D&D Beyond's and Roll20's campaign settings gather the same):
 * the campaign's name, the invite link's lock, and each player's «Rendi DM» and
 * «Rimuovi», the last two after a confirmation. The writes are the shared ones
 * (`campaign-admin`, the store's rename).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  campaignAdminView,
  handOverDm,
  removeCampaignMember,
  setInviteLocked,
} from "@/domains/campaign/campaign-admin";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { Button, Dialog, Field } from "@/ui";

type Confirm = { kind: "yield" | "remove"; uid: string; name: string };

export function ManageCampaignDialog({
  uid,
  isAdmin = false,
  onClose,
}: {
  uid: string | undefined;
  isAdmin?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const campaign = useCampaignStore((s) => s.campaign);
  const [name, setName] = useState(campaign?.name ?? "");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  if (!campaign) return null;
  const view = campaignAdminView(campaign, uid, isAdmin, t);
  const trimmed = name.trim();
  return (
    <Dialog
      open
      onClose={onClose}
      color="grp"
      title={t("campaignScreen.manageTitle")}
      closeLabel={t("common.close")}
    >
      <form
        className="f-ask f-manage-name"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && trimmed !== campaign.name)
            useCampaignStore.getState().setName(trimmed);
        }}
      >
        <Field
          label={t("campaignHub.renameAria")}
          autoComplete="off"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={!trimmed || trimmed === campaign.name}>
          {t("common.save")}
        </Button>
      </form>
      <div className="f-ask">
        <div className="f-lbl">{t("campaigns.inviteLink")}</div>
        <p className="f-quiet">
          {t(
            view.invite.locked
              ? "campaignScreen.joinsLockedState"
              : "campaignScreen.joinsOpenState"
          )}
        </p>
        <Button onClick={() => setInviteLocked(!view.invite.locked, t)}>
          {view.invite.locked
            ? t("campaignScreen.unlockJoins")
            : t("campaignHub.lockJoins")}
        </Button>
      </div>
      {view.members.length > 0 && (
        <div className="f-ask">
          <div className="f-lbl">{t("campaignScreen.playersSection")}</div>
          {view.members.map((m) => (
            <div key={m.uid} className="f-manage-member">
              <span className="f-manage-name-t">{m.name}</span>
              <Button
                kind="quiet"
                aria-label={t("campaignScreen.yieldTo", { name: m.name })}
                onClick={() => setConfirm({ kind: "yield", uid: m.uid, name: m.name })}
              >
                {t("campaignHub.yieldDmConfirm")}
              </Button>
              <Button
                kind="quiet"
                aria-label={t("campaignScreen.removeWho", { name: m.name })}
                onClick={() => setConfirm({ kind: "remove", uid: m.uid, name: m.name })}
              >
                {t("common.remove")}
              </Button>
            </div>
          ))}
        </div>
      )}
      {confirm && (
        <Dialog
          open
          onClose={() => setConfirm(null)}
          color="grp"
          title={t(
            confirm.kind === "yield"
              ? "campaignHub.yieldDmTitle"
              : "campaignHub.removeMemberTitle"
          )}
          closeLabel={t("common.close")}
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
              <Button
                kind={confirm.kind === "remove" ? "danger" : "primary"}
                onClick={() => {
                  const { kind, uid: who } = confirm;
                  setConfirm(null);
                  if (kind === "yield") {
                    void handOverDm(who, t).then((ok) => ok && onClose());
                  } else void removeCampaignMember(who, t);
                }}
              >
                {t(
                  confirm.kind === "yield"
                    ? "campaignHub.yieldDmConfirm"
                    : "campaignHub.removeMemberConfirm"
                )}
              </Button>
            </>
          }
        >
          <p className="f-ask">
            {t(
              confirm.kind === "yield"
                ? "campaignHub.yieldDmMessage"
                : "campaignHub.removeMemberMessage",
              { name: confirm.name }
            )}
          </p>
        </Dialog>
      )}
    </Dialog>
  );
}
