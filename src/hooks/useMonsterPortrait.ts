/**
 * useMonsterPortrait (Part B) — the monster counterpart to `usePortraitCrop` /
 * `useCampaignBannerCrop`: the SAME compress-once-then-crop strategy (store the
 * original at quality, keep a % crop rectangle), for a custom monster's art. A
 * SQUARE portrait like a character's (crop = the seal), never re-uploaded on a re-crop.
 *
 * A saved custom monster's art stays on its library entry via
 * `libraryStore.setEntryPortrait`. Storage: `portraits/monster-{entryId}.jpeg`.
 *
 * It persists through the library store (debounced full-doc write) and uploads to the
 * per-user `portraits/` folder that any signed-in user can READ — so a portrait the
 * DM copies onto a shared encounter combatant is visible to every table member.
 *
 * The parent owns the menu + renders the shared `PortraitCropModal` from `cropSrc`
 * (identical to the character/banner call sites). The store already applied the change
 * in memory, so every surface reflects it immediately.
 *
 * ponytail: the crop-session machine (`cropSession` + openFilePickerForNew / onFileChange
 * / openRecrop / onConfirm / onCancel + the return shape) is the THIRD near-verbatim copy
 * of `usePortraitCrop` / `useCampaignBannerCrop` (the banner hook is itself a sanctioned
 * clone — see its docblock). A `useCropFlow({ current, upload, remove, persist })` core
 * would collapse all three into ~15-line adapters, but that refactor re-touches the
 * SHIPPED character-portrait + campaign-banner surfaces (rule 27 stability-first), so it
 * is a deliberate follow-up, not part of this feature's diff.
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Area } from "react-easy-crop";
import { useAuthStore } from "@/stores/authStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useToastStore } from "@/stores/toastStore";
import {
  uploadMonsterPortrait,
  deleteMonsterPortrait,
  compressImage,
} from "@/lib/storage";
import { readFileAsDataUrl } from "@/lib/image-crop";
import { normalizePortraitCrop } from "@/lib/portrait-crop";
import type { PortraitCrop } from "@/types/character";

type CropSession =
  | { type: "new"; compressedBlob: Blob }
  | { type: "recrop"; initialCropArea: Area | null }
  | null;

/** The portrait as it currently stands (from the override map or the library entry). */
export interface MonsterPortraitCurrent {
  portraitUrl?: string | null;
  portraitCrop?: PortraitCrop | null;
}

export function useMonsterPortrait(entryId: string, current: MonsterPortraitCurrent) {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid) ?? "dev"; // ignored under DEV_BYPASS
  const setEntryPortrait = useLibraryStore((s) => s.setEntryPortrait);
  const showToast = useToastStore((s) => s.showToast);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSession, setCropSession] = useState<CropSession>(null);

  /** Persist the result on the custom monster entry (or clear it with null). */
  function persist(portraitUrl: string | null, portraitCrop: PortraitCrop | null): void {
    const art = portraitUrl
      ? { portraitUrl, ...(portraitCrop ? { portraitCrop } : {}) }
      : null;
    setEntryPortrait(entryId, art);
  }

  function openFilePickerForNew(): void {
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    try {
      const compressedBlob = await compressImage(file);
      const dataUrl = await readFileAsDataUrl(
        new File([compressedBlob], file.name, { type: "image/jpeg" })
      );
      setCropSession({ type: "new", compressedBlob });
      setCropSrc(dataUrl);
    } catch {
      showToast({ message: t("portrait.crop.readError"), duration: 4000 });
    }
  }

  function openRecrop(): void {
    if (!current.portraitUrl) return;
    setCropSession({ type: "recrop", initialCropArea: current.portraitCrop ?? null });
    setCropSrc(current.portraitUrl);
  }

  async function onConfirm(croppedArea: Area): Promise<void> {
    if (!cropSession) return;
    const safeCrop = normalizePortraitCrop(croppedArea);
    if (!safeCrop) {
      showToast({ message: t("portrait.crop.invalidCrop"), duration: 4000 });
      return;
    }
    setCropSrc(null);
    setUploading(true);
    try {
      const url =
        cropSession.type === "new"
          ? await uploadMonsterPortrait(uid, entryId, cropSession.compressedBlob)
          : (current.portraitUrl ?? null); // re-crop: metadata only, keep the bytes
      persist(url, safeCrop);
    } catch {
      showToast({ message: t("portrait.crop.saveError"), duration: 5000 });
    } finally {
      setUploading(false);
      setCropSession(null);
    }
  }

  function onCancel(): void {
    setCropSrc(null);
    setCropSession(null);
  }

  async function removePortrait(): Promise<void> {
    setUploading(true);
    try {
      await deleteMonsterPortrait(uid, entryId);
      persist(null, null);
    } catch {
      showToast({ message: t("portrait.crop.saveError"), duration: 5000 });
    } finally {
      setUploading(false);
    }
  }

  return {
    fileInputRef,
    cropSrc,
    uploading,
    initialCropArea: cropSession?.type === "recrop" ? cropSession.initialCropArea : null,
    openFilePickerForNew,
    onFileChange,
    onConfirm,
    onCancel,
    openRecrop,
    removePortrait,
  };
}
