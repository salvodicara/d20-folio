/**
 * The Tesoro tab's chest, on the engine's chest seams (chest-io): the stacks and the
 * pickups waiting for each player's sheet, the item log, and each move with its undo in
 * the toast (a refused undo says so).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  subscribeToChest,
  subscribeToChestLog,
  type ChestContents,
  type ChestUndo,
} from "@/features/campaigns/chest-io";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { ChestLogEntry } from "@/types/campaign";

export type Toaster = (message: string, undo?: () => void) => void;

const fail = (what: string) => (error: Error) =>
  diagnosticsLog("warn", `chest.${what}-failed`, { message: error.message });

/** The chest's stacks, the pickups waiting for the players, and the item log. */
export function useChest(campaignId: string) {
  const [contents, setContents] = useState<ChestContents>({ items: [], pickups: [] });
  const [log, setLog] = useState<ChestLogEntry[]>([]);
  useEffect(() => subscribeToChest(campaignId, setContents, fail("read")), [campaignId]);
  useEffect(
    () => subscribeToChestLog(campaignId, setLog, fail("log-read")),
    [campaignId]
  );
  return { ...contents, log };
}

/** Run one chest move and toast it with its undo. */
export function useChestMove(onToast: Toaster) {
  const { t } = useTranslation();
  return (move: () => Promise<ChestUndo | null>, done: string) => {
    move()
      .then((undo) => {
        if (!undo) {
          onToast(t("treasury.moved"));
          return;
        }
        onToast(done, () => {
          void undo().then((ok) => {
            if (!ok) onToast(t("treasury.tooLate"));
          });
        });
      })
      .catch((error: unknown) => {
        diagnosticsLog("warn", "chest.move-failed", { message: String(error) });
        onToast(t("fight.failed"));
      });
  };
}
