/**
 * «Your data» (#1341) on the new settings screen: download a copy of everything, or
 * erase the account. Pattern source: Google Account's «Download your data» and «Delete
 * your account», and D&D Beyond's account settings. Erasure is behind a dialog that
 * says what goes and asks for the account's email (the server checks it again).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  deleteMyAccount,
  downloadMyData,
  emailConfirms,
} from "@/domains/account/my-data";
import type { AccountProfile } from "@/features/account/account-export";
import { useToastStore } from "@/stores/toastStore";
import { Button, Dialog, Field, Panel } from "@/ui";

export function MyDataPanel({ profile }: { profile: AccountProfile }) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const toast = (message: string) =>
    useToastStore.getState().showToast({ message, duration: 6000 });

  const download = async (): Promise<void> => {
    setDownloading(true);
    const result = await downloadMyData(profile);
    setDownloading(false);
    if (!result.ok) {
      toast(t("settings.myData.downloadFailed"));
      return;
    }
    toast(t("settings.myData.downloaded", { count: result.characters }));
    if (result.charactersSkipped > 0)
      toast(t("settings.myData.skipped", { count: result.charactersSkipped }));
  };

  const confirmed = emailConfirms(typed, profile.email);
  const erase = async (): Promise<void> => {
    if (!confirmed) return;
    setDeleting(true);
    setFailed(false);
    const outcome = await deleteMyAccount(profile.uid, profile.email, typed);
    setDeleting(false);
    if (outcome === "failed") setFailed(true);
  };

  return (
    <Panel color="grp" title={t("settings.myData.title")}>
      <p className="f-help">{t("settings.myData.help")}</p>
      <div className="f-chips">
        <Button icon="u-download" busy={downloading} onClick={() => void download()}>
          {t("settings.myData.download")}
        </Button>
        <Button kind="danger" icon="u-delete" onClick={() => setAsking(true)}>
          {t("settings.myData.delete")}
        </Button>
      </div>
      <Dialog
        open={asking}
        onClose={() => {
          setAsking(false);
          setTyped("");
          setFailed(false);
        }}
        title={t("settings.myData.deleteTitle")}
        color="dng"
        closeLabel={t("common.close")}
        actions={
          <Button
            kind="danger"
            busy={deleting}
            disabled={!confirmed}
            onClick={() => void erase()}
          >
            {t("settings.myData.delete")}
          </Button>
        }
      >
        <p className="f-help">{t("settings.myData.deleteBody")}</p>
        <Field
          label={t("settings.myData.typeEmail")}
          type="email"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          error={failed ? t("settings.myData.deleteFailed") : undefined}
          data-autofocus
        />
      </Dialog>
    </Panel>
  );
}
