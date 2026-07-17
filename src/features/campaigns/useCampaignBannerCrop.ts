/**
 * useCampaignBannerCrop (N4) — the campaign-banner counterpart to
 * `usePortraitCrop`: the same upload + crop strategy (compress once, store the
 * original at quality, keep a crop rectangle), but for the SHARED campaign banner
 * and a 16:9 rectangle instead of a square portrait — the SAME 16:9 shape the art
 * paints as the full-page hub backdrop, so crop = card = backdrop focal.
 *
 * One file per campaign: `campaigns/{campaignId}/banner.jpeg`. The crop (% rect) is
 * stored on the campaign doc as `bannerCrop`; a re-crop is a metadata-only write
 * (no re-upload). Any member may change it (the rules allow shared-artifact
 * writes); writes go straight through `campaign-io` (not the debounced path), with
 * an optimistic `campaignStore` update.
 */

import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Area } from "react-easy-crop";
import { useToastStore } from "@/stores/toastStore";
import { uploadCampaignBanner, deleteCampaignBanner, compressImage } from "@/lib/storage";
import { readFileAsDataUrl } from "@/lib/image-crop";
import { normalizePortraitCrop } from "@/lib/portrait-crop";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { setCampaignBanner } from "@/features/campaigns/campaign-io";

type CropSession =
  | { type: "new"; compressedBlob: Blob }
  | { type: "recrop"; initialCropArea: Area | null }
  | null;

export function useCampaignBannerCrop() {
  const { t } = useTranslation();
  const campaign = useCampaignStore((s) => s.campaign);
  const setBanner = useCampaignStore((s) => s.setBanner);
  const showToast = useToastStore((s) => s.showToast);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSession, setCropSession] = useState<CropSession>(null);

  function openFilePickerForNew() {
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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
      showToast({
        message: t("portrait.crop.readError"),
        duration: 4000,
      });
    }
  }

  function openRecrop() {
    if (!campaign?.bannerUrl) return;
    setCropSession({ type: "recrop", initialCropArea: campaign.bannerCrop ?? null });
    setCropSrc(campaign.bannerUrl);
  }

  async function onConfirm(croppedArea: Area) {
    const current = useCampaignStore.getState().campaign;
    if (!current || !cropSession) return;
    const safeCrop = normalizePortraitCrop(croppedArea);
    if (!safeCrop) {
      showToast({
        message: t("portrait.crop.invalidCrop"),
        duration: 4000,
      });
      return;
    }
    setCropSrc(null);
    setUploading(true);
    try {
      // New upload → store the fresh file; re-crop → keep the existing bytes
      // (metadata-only). Either way the store + doc write is the same one crop.
      const url =
        cropSession.type === "new"
          ? await uploadCampaignBanner(current.id, cropSession.compressedBlob)
          : (current.bannerUrl ?? null);
      setBanner(url, safeCrop);
      await setCampaignBanner(current.id, url, safeCrop);
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : t("common.error"),
        duration: 5000,
      });
    } finally {
      setUploading(false);
      setCropSession(null);
    }
  }

  function onCancel() {
    setCropSrc(null);
    setCropSession(null);
  }

  async function removeBanner() {
    const current = useCampaignStore.getState().campaign;
    if (!current) return;
    setUploading(true);
    try {
      await deleteCampaignBanner(current.id);
      setBanner(null, null);
      await setCampaignBanner(current.id, null, null);
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : t("common.error"),
        duration: 5000,
      });
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
    removeBanner,
  };
}
