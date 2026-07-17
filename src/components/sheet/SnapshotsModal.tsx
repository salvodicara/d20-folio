/**
 * SnapshotsModal — list + restore character snapshots.
 *
 * Built on the folio modal system: Radix `Dialog` gives the scrim, focus trap,
 * ESC / outside-click close and the diamond-rubric branded head; the zero-state
 * uses the shared `RunicEmptyState` hero and every action is a `<Button>` variant
 * (restore = ghost, destructive confirm = destructive). Purely presentational:
 * receives snapshots as props; the parent (sheet.tsx) handles the async loading.
 */

import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { History, RotateCcw, Trash2, Save } from "lucide-react";
import { restoreCharacterSnapshot, deleteCharacterSnapshot } from "@/lib/firestore";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { localizeClassName } from "@/lib/views/srd-i18n";
import { totalLevel } from "@/lib/classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogBody,
  RunicEmptyState,
  Icon,
} from "@/components/ui";
import type { CharacterData, SessionState } from "@/types/character";

export interface SnapshotItem {
  id: string;
  reason: string;
  createdAt: Date | null;
  character: CharacterData;
  session: SessionState;
}

interface Props {
  open: boolean;
  onClose: () => void;
  snapshots: SnapshotItem[];
  loading: boolean;
  error: string | null;
  onDelete?: (id: string) => void; // Callback to refresh list after delete
  /** Save the CURRENT sheet as a new manual snapshot (omitted = no save UI). */
  onSave?: () => void;
  /** True while a manual save is in flight (disables the Save control). */
  saving?: boolean;
}

/**
 * Compact class·level summary DERIVED at render from the snapshot's OWN stored
 * character data — what this snapshot would restore (owner, 2026-06-12). Never
 * a stored display string (rules 6/7/10: the old stored EN "Pre level-up
 * snapshot (Lv N)" label leaked English into the IT UI and is gone).
 * Single-class: "Barbaro 4"; multiclass: "Ladro 3 · Mago 2 — Liv 5".
 */
function classLevelSummary(
  character: CharacterData,
  locale: "en" | "it",
  lvlLabel: string
): string {
  const entries = character.classes.filter((e) => e.classId);
  if (entries.length === 0) return "";
  const parts = entries.map((e) => `${localizeClassName(e.classId, locale)} ${e.level}`);
  if (parts.length === 1) return parts[0] ?? "";
  return `${parts.join(" · ")} — ${lvlLabel} ${totalLevel(character)}`;
}

/** Carved tile for each snapshot row — folio surface + lapidary radius token. */
const ROW_STYLE: CSSProperties = {
  background: "var(--bg-surface-3)",
  border: "1px solid var(--border-soft)",
  borderRadius: "var(--radius-lg)",
};

export function SnapshotsModal({
  open,
  onClose,
  snapshots,
  loading,
  error: loadError,
  onDelete,
  onSave,
  saving,
}: Props) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const user = useAuthStore((s) => s.user);
  const char = useCharacterStore((s) => s.character);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore(id: string) {
    if (!user || !char) return;
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    setRestoring(id);
    setError(null);
    try {
      await restoreCharacterSnapshot(user.uid, char.id, {
        character: snap.character,
        session: snap.session,
      });
      // Undo-stack FENCE (§5.4): restoring a snapshot rewrites the whole sheet, so a
      // pre-restore reverse-applier would clobber the restored state. Drop the stack.
      useUndoStore.getState().clear();
      onClose();
    } catch {
      setError(t("snapshots.restoreError"));
    } finally {
      setRestoring(null);
      setConfirmId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!user || !char) return;
    setDeleting(id);
    setError(null);
    try {
      await deleteCharacterSnapshot(user.uid, char.id, id);
      onDelete?.(id);
    } catch {
      setError(t("snapshots.deleteError"));
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  }

  function formatDate(d: Date | null) {
    if (!d) return "—";
    // App locale, not the browser's — an IT UI must not show "Jun 11, 2026".
    return d.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function reasonLabel(reason: string) {
    if (reason === "level-up") return t("snapshots.reasonLevelUp");
    if (reason === "manual") return t("snapshots.reasonManual");
    return reason;
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConfirmId(null);
      setConfirmDeleteId(null);
      setError(null);
      onClose();
    }
  }

  const displayError = error ?? loadError;
  const isEmpty = !loading && snapshots.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* E1 — top-anchored (the command-palette anti-jump recipe): adding or
          deleting a snapshot grows/shrinks the list DOWNWARD only; the head
          never drifts, nothing teleports. */}
      <DialogContent
        overlayClassName="scrim-top"
        rubric={t("snapshots.rubric")}
        title={t("snapshots.title")}
        description={t("snapshots.hint")}
        closeLabel={t("common.close")}
      >
        {/* Hint — visible warning above the list (also the AT description). */}
        <p
          style={{
            padding: "var(--sp-3) var(--sp-5) 0",
            fontSize: "var(--text-sm)",
            lineHeight: 1.5,
            color: "var(--text-muted)",
          }}
        >
          {t("snapshots.hint")}
        </p>

        <DialogBody>
          {onSave && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "var(--sp-3)",
              }}
            >
              <Button variant="secondary" size="sm" onClick={onSave} disabled={saving}>
                <Icon as={Save} size="sm" decorative />
                {saving ? t("snapshots.saving") : t("snapshots.saveNow")}
              </Button>
            </div>
          )}

          {loading && (
            <p
              className="text-center"
              style={{ padding: "var(--sp-6) 0", color: "var(--text-muted)" }}
            >
              {t("common.loading")}
            </p>
          )}

          {isEmpty && (
            <RunicEmptyState
              size="sm"
              glyph={History}
              eyebrow={t("snapshots.emptyEyebrow")}
              title={t("snapshots.emptyTitle")}
              blurb={t("snapshots.empty")}
            />
          )}

          {displayError && (
            <p
              className="text-center"
              style={{
                color: "var(--semantic-danger)",
                fontSize: "var(--text-sm)",
                marginBottom: "var(--sp-3)",
              }}
              role="alert"
            >
              {displayError}
            </p>
          )}

          {snapshots.length > 0 && (
            <ul
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--sp-2)",
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {snapshots.map((snap) => {
                const summary = classLevelSummary(snap.character, locale, t("stats.lvl"));
                return (
                  <li
                    key={snap.id}
                    style={{
                      ...ROW_STYLE,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "var(--sp-3)",
                      padding: "var(--sp-3)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--sp-2)",
                          flexWrap: "wrap",
                        }}
                      >
                        <Badge
                          size="sm"
                          color={
                            snap.reason === "level-up" ? undefined : "var(--text-muted)"
                          }
                        >
                          {reasonLabel(snap.reason)}
                        </Badge>
                        {summary && (
                          <span
                            style={{
                              fontSize: "var(--text-sm)",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {summary}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          marginTop: "var(--sp-1)",
                          fontFamily: "var(--font-numeric)",
                          fontSize: "var(--text-xs)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {formatDate(snap.createdAt)}
                      </p>
                    </div>

                    {/* Confirm restore */}
                    {confirmId === snap.id ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--sp-2)",
                          flexShrink: 0,
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void handleRestore(snap.id)}
                          disabled={restoring === snap.id}
                        >
                          {restoring === snap.id
                            ? t("snapshots.restoring")
                            : t("snapshots.confirmRestore")}
                        </Button>
                      </div>
                    ) : confirmDeleteId === snap.id ? (
                      /* Confirm delete */
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--sp-2)",
                          flexShrink: 0,
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void handleDelete(snap.id)}
                          disabled={deleting === snap.id}
                        >
                          {deleting === snap.id
                            ? t("snapshots.deleting")
                            : t("common.delete")}
                        </Button>
                      </div>
                    ) : (
                      /* Normal state: Restore + Delete buttons */
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--sp-2)",
                          flexShrink: 0,
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmId(snap.id)}
                          title={t("snapshots.restore")}
                        >
                          <Icon as={RotateCcw} size="sm" decorative />
                          {t("snapshots.restore")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          className="icon-danger"
                          onClick={() => setConfirmDeleteId(snap.id)}
                          aria-label={t("common.delete")}
                          title={t("common.delete")}
                        >
                          <Icon as={Trash2} size="sm" decorative />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
