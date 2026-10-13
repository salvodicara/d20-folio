/**
 * CampaignArtControl — the campaign settings gear in the corner of the hub's hero
 * band (owner 2026-10-13: the campaign image is the header itself, and changing it
 * is a setting, not a headline action). Any member can change the art. The gear
 * opens a small menu: with no art it offers only "Choose an image"; once art exists
 * it offers Re-crop · Change · Remove. The upload + crop flow is the shared
 * `useCampaignBannerCrop` hook + `PortraitCropModal`.
 */

import { useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useTranslation } from "react-i18next";
import { Crop, ImagePlus, Settings, Trash2 } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { PortraitCropModal } from "@/components/shared/PortraitCropModal";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useCampaignBannerCrop } from "@/features/campaigns/useCampaignBannerCrop";

export function CampaignArtControl() {
  const { t } = useTranslation();
  const bannerUrl = useCampaignStore((s) => s.campaign?.bannerUrl ?? null);
  const {
    fileInputRef,
    cropSrc,
    uploading,
    initialCropArea,
    onFileChange,
    onConfirm,
    onCancel,
    openFilePickerForNew,
    openRecrop,
    removeBanner,
  } = useCampaignBannerCrop();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuOpen, menuRef, () => setMenuOpen(false));

  function run(action: () => void): () => void {
    return () => {
      setMenuOpen(false);
      action();
    };
  }

  return (
    <div className="campaign-art-control" ref={menuRef}>
      <button
        type="button"
        className="campaign-hero-gear"
        onClick={() => setMenuOpen((v) => !v)}
        disabled={uploading}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t("campaignHub.settingsAria")}
        title={t("campaignHub.settingsAria")}
      >
        {uploading ? <Spinner size="sm" /> : <Icon as={Settings} decorative />}
      </button>
      {menuOpen && (
        <div className="settings-pop popover absolute top-full right-0 z-[300] mt-1.5 w-52">
          <div
            className="pop-body"
            role="menu"
            aria-label={t("campaignHub.settingsAria")}
          >
            {bannerUrl ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={run(openRecrop)}
                >
                  <Icon as={Crop} decorative />
                  {t("campaignHub.artRecrop")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={run(openFilePickerForNew)}
                >
                  <Icon as={ImagePlus} decorative />
                  {t("campaignHub.editBanner")}
                </button>
                <div className="menu-div" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item danger"
                  onClick={run(() => void removeBanner())}
                >
                  <Icon as={Trash2} decorative />
                  {t("campaignHub.artRemove")}
                </button>
              </>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={run(openFilePickerForNew)}
              >
                <Icon as={ImagePlus} decorative />
                {t("campaignHub.artChoose")}
              </button>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onFileChange(e)}
      />
      <PortraitCropModal
        key={cropSrc ?? ""}
        open={cropSrc !== null}
        imageSrc={cropSrc ?? ""}
        initialCropArea={initialCropArea}
        variant="banner"
        onConfirm={(area) => void onConfirm(area)}
        onClose={onCancel}
      />
    </div>
  );
}
