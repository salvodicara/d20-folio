/**
 * CampaignArtControl — the campaign hub's "set / change the campaign art"
 * affordance, now a single quiet ghost button in the slim hub header's action
 * slot (the big 3:1 hero band was retired; the art is the page's atmospheric
 * `--app-bg-art` backdrop under the app scrim — see CampaignHubPage). Any member
 * can change it: with no art set the button opens the file picker straight away;
 * once art exists it reveals the shared Re-crop / Replace / Remove menu. The
 * upload + crop flow is the SAME shared `useCampaignBannerCrop` hook +
 * `PortraitCropModal` (golden rule 10 — the affordance just relocated off the
 * deleted band onto the header).
 */

import { useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useTranslation } from "react-i18next";
import { Camera } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { PortraitEditMenu } from "@/components/shared/PortraitEditMenu";
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
  // Close the menu on outside pointerdown / Escape (shared, capture-phase).
  useDismissOnOutside(menuOpen, menuRef, () => setMenuOpen(false));

  function onEdit(): void {
    if (bannerUrl) setMenuOpen((v) => !v);
    else openFilePickerForNew();
  }

  return (
    <div className="campaign-art-control" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onEdit}
        disabled={uploading}
        aria-haspopup={bannerUrl ? "menu" : undefined}
        aria-expanded={bannerUrl ? menuOpen : undefined}
        aria-label={t("campaignHub.editBanner")}
      >
        {uploading ? <Spinner size="sm" /> : <Icon as={Camera} size="sm" decorative />}
        <span className="hdr-action-label">{t("campaignHub.editBanner")}</span>
      </Button>
      {menuOpen && bannerUrl && (
        // The control lives in the header action row (no clipping band), so the
        // menu opens DOWNWARD beneath the button.
        <PortraitEditMenu
          className="top-full right-0 mt-1.5"
          onRecrop={() => {
            setMenuOpen(false);
            openRecrop();
          }}
          onReplace={() => {
            setMenuOpen(false);
            openFilePickerForNew();
          }}
          onRemove={() => {
            setMenuOpen(false);
            void removeBanner();
          }}
        />
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
