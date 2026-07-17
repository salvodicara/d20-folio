/**
 * SnapshotsHistory — the cockpit's character version-history host (#14). The
 * fob family's ⋯ overflow ("History") drives the CONTROLLED open
 * state; this container owns the list fetch + the manual "save snapshot" action,
 * and delegates restore/delete to the `SnapshotsModal` (which calls the
 * firestore helpers itself). Under dev-bypass the firestore helpers no-op
 * (save → mock id, list → []), so the mock cockpit shows an honest empty
 * history instead of throwing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { listCharacterSnapshots, saveCharacterSnapshot } from "@/lib/firestore";
import { SnapshotsModal } from "@/components/sheet/SnapshotsModal";

type SnapItem = Awaited<ReturnType<typeof listCharacterSnapshots>>[number];

export interface SnapshotsHistoryProps {
  /** Controlled open state — driven by the cockpit-header overflow menu. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SnapshotsHistory({ open, onOpenChange }: SnapshotsHistoryProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const char = useCharacterStore((s) => s.character);
  const [snapshots, setSnapshots] = useState<SnapItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user || !char) return;
    setLoading(true);
    setError(null);
    try {
      setSnapshots(await listCharacterSnapshots(user.uid, char.id));
    } catch {
      setError(t("snapshots.loadError"));
    } finally {
      setLoading(false);
    }
  }, [user, char, t]);

  // Fetch the list on the closed→open EDGE only, so opening loads once without
  // re-fetching on every render while the modal stays open.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) void load();
    wasOpen.current = open;
  }, [open, load]);

  async function handleSave() {
    if (!user || !char) return;
    setSaving(true);
    setError(null);
    try {
      await saveCharacterSnapshot(user.uid, char.id, {
        character: char.character,
        session: char.session,
        reason: "manual",
      });
      await load();
    } catch {
      setError(t("snapshots.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SnapshotsModal
      open={open}
      onClose={() => onOpenChange(false)}
      snapshots={snapshots}
      loading={loading}
      error={error}
      onDelete={() => void load()}
      onSave={() => void handleSave()}
      saving={saving}
    />
  );
}
