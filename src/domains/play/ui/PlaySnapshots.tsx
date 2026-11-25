/**
 * «Istantanee» on the Play screen (#1342): the sheet's saved copies, newest first, with
 * Save now, and Restore and Delete each behind a confirm step on the row (the classic
 * sheet's SnapshotsModal, D&D Beyond's character «Backups»). The same Firestore seams as
 * the classic sheet: a restore rewrites the whole sheet at its revision and clears the
 * undo stack, since an older undo would undo into the restored sheet.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { classLevelSummary } from "@/lib/views/snapshot-summary";
import {
  deleteCharacterSnapshot,
  listCharacterSnapshots,
  restoreCharacterSnapshot,
  saveCharacterSnapshot,
} from "@/lib/firestore";
import type { Locale } from "@/lib/locale";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Dialog } from "@/ui";

type Snapshot = Awaited<ReturnType<typeof listCharacterSnapshots>>[number];
type Confirm = { id: string; kind: "restore" | "delete" } | null;

export function PlaySnapshots({
  uid,
  doc,
  locale = "en",
  open,
  onClose,
}: {
  uid: string;
  doc: CharacterDoc;
  locale?: Locale;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // mounted on open (the Play screen draws it only then): each opening starts fresh
  useEffect(() => {
    if (!open) return;
    let live = true;
    listCharacterSnapshots(uid, doc.id)
      .then((l) => live && setList(l))
      .catch(() => {
        if (!live) return;
        setError(t("snapshots.loadError"));
        setList([]);
      });
    return () => {
      live = false;
    };
  }, [open, uid, doc.id, t]);

  async function run(id: string, work: () => Promise<unknown>, failed: string) {
    setBusy(id);
    setError(null);
    try {
      await work();
      return true;
    } catch {
      setError(t(failed));
      return false;
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const save = () =>
    run(
      "save",
      async () => {
        await saveCharacterSnapshot(uid, doc.id, {
          character: doc.character,
          session: doc.session,
          reason: "manual",
        });
        setList(await listCharacterSnapshots(uid, doc.id));
      },
      "snapshots.saveError"
    );

  const restore = async (snap: Snapshot) => {
    const done = await run(
      snap.id,
      () =>
        restoreCharacterSnapshot(
          uid,
          doc.id,
          { character: snap.character, session: snap.session },
          doc.revision,
          doc
        ),
      "snapshots.restoreError"
    );
    if (!done) return;
    useUndoStore.getState().clear();
    onClose();
  };

  const remove = (snap: Snapshot) =>
    run(
      snap.id,
      async () => {
        await deleteCharacterSnapshot(uid, doc.id, snap.id);
        setList((l) => l?.filter((s) => s.id !== snap.id) ?? null);
      },
      "snapshots.deleteError"
    );

  const reason = (r: string) =>
    r === "level-up"
      ? t("snapshots.reasonLevelUp")
      : r === "manual"
        ? t("snapshots.reasonManual")
        : r;
  const when = (d: Date | null) =>
    d
      ? d.toLocaleString(locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("snapshots.title")}
      color="log"
      closeLabel={t("common.close")}
      actions={
        <Button kind="primary" busy={busy === "save"} onClick={() => void save()}>
          {busy === "save" ? t("snapshots.saving") : t("snapshots.saveNow")}
        </Button>
      }
    >
      <p className="f-help">{t("snapshots.hint")}</p>
      {error && (
        <p className="f-help" role="alert">
          {error}
        </p>
      )}
      {list === null ? (
        <p role="status">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="f-help">{t("snapshots.empty")}</p>
      ) : (
        <div>
          {list.map((snap) => {
            const summary = classLevelSummary(snap.character, locale, t("stats.lvl"));
            const asking = confirm?.id === snap.id ? confirm.kind : null;
            return (
              <div key={snap.id} className="f-row">
                <div className="f-row-main">
                  <div className="f-row-t">
                    {reason(snap.reason)}
                    {summary && ` · ${summary}`}
                  </div>
                  <div className="f-row-s">{when(snap.createdAt)}</div>
                </div>
                <div className="f-row-end">
                  {asking ? (
                    <>
                      <Button kind="quiet" onClick={() => setConfirm(null)}>
                        {t("common.cancel")}
                      </Button>
                      <Button
                        kind="danger"
                        busy={busy === snap.id}
                        onClick={() =>
                          void (asking === "restore" ? restore(snap) : remove(snap))
                        }
                      >
                        {asking === "restore"
                          ? t("snapshots.confirmRestore")
                          : t("common.delete")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => setConfirm({ id: snap.id, kind: "restore" })}
                      >
                        {t("snapshots.restore")}
                      </Button>
                      <Button
                        kind="quiet"
                        icon="u-delete"
                        onClick={() => setConfirm({ id: snap.id, kind: "delete" })}
                      >
                        {t("common.delete")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
