/**
 * Portrait crop modal.
 *
 * Presents a crop overlay whose SHAPE MATCHES how the result is displayed, so
 * what you frame is exactly what every surface shows:
 *   - `variant="portrait"` (default) → the lapidary rounded SQUARE every avatar
 *     tile renders (the seal, roster `.ch-portrait`, topbar, party). It used to
 *     be a circle "for historical reasons" while the tiles were already squares,
 *     so the masked corners — which ARE shown — were hidden while framing.
 *   - `variant="banner"` → the wide 16:9 campaign banner (matches the full-page
 *     `--app-bg-art` backdrop the same art paints behind the hub).
 *
 * The user drags to reposition and uses the slider (or pinch/scroll) to zoom.
 * Confirm returns the crop region as percentages (Area) — no canvas work or blob
 * creation; the crop is stored as metadata and applied via CSS at render time.
 *
 * Props are consistent with all other modals in the app:
 *   open       — controls visibility
 *   imageSrc   — data URL or Firebase URL of the image to crop
 *   onConfirm  — called with the crop area as percentages (0–100)
 *   onClose    — called on cancel or backdrop click
 */

import { useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut, Check, X } from "lucide-react";
import { ModalShell } from "@/components/shared/ModalShell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { PortraitCropErrorBoundary } from "@/components/shared/PortraitCropErrorBoundary";
import { faceBiasedDefaultCrop, normalizePortraitCrop } from "@/lib/portrait-crop";
import type { PortraitCrop } from "@/types/character";

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  /** Data URL or Firebase URL of the image to crop */
  imageSrc: string;
  /** Called with the crop region as percentages (from react-easy-crop's croppedArea) */
  onConfirm: (croppedArea: Area) => void;
  onClose: () => void;
  /** If provided, sets the initial crop position (for re-crop of an existing crop) */
  initialCropArea?: Area | null;
  /** Which surface this crops for — selects the aspect + overlay shape to MATCH
   *  how the result is displayed. "portrait" = the lapidary rounded square every
   *  avatar tile shows (default); "banner" = the wide 16:9 campaign banner (N4). */
  variant?: "portrait" | "banner";
}

export function PortraitCropModal({
  open,
  imageSrc,
  onConfirm,
  onClose,
  initialCropArea,
  variant = "portrait",
}: Props) {
  const { t } = useTranslation();

  // The overlay matches the display: a 16:9 wide rectangle for the banner (the
  // SAME shape the art paints as the full-page hub backdrop, so what you frame is
  // what the card AND the backdrop show), else the lapidary SQUARE every avatar
  // tile renders. react-easy-crop's cropShape is always "rect" now — the portrait
  // tile is a rounded square, NOT a circle (the locked sharp-cornered Folio idiom);
  // the rounded corner comes from the crop-area `borderRadius` below so the frame
  // reads as the tile, not a disc.
  const isBanner = variant === "banner";
  const aspect = isBanner ? 16 / 9 : 1;

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  // Bumped to remount the <Cropper> after an error-boundary retry.
  const [cropperKey, setCropperKey] = useState(0);

  // Validate/clamp the restored crop before handing it to react-easy-crop —
  // a bad rect (NaN/zero) would make the cropper throw on mount. Falls back to
  // undefined (cropper picks a centered default) when the value is unusable.
  const safeInitialCrop = normalizePortraitCrop(initialCropArea) ?? undefined;

  // When there is NO stored crop on a portrait, open the square on the face —
  // not react-easy-crop's centred default, which lands on the waist of a
  // full-figure portrait. The default frame matches PortraitImg's uncropped
  // `object-position` framing (same PORTRAIT_FACE_BIAS_Y), so what the surfaces
  // already show and what the crop square previews are the SAME region. Only the
  // portrait, no-initial-crop case needs this; re-crop (restore the stored frame)
  // and the wide banner keep react-easy-crop's own default.
  const wantsFaceBias = !isBanner && !safeInitialCrop;

  // Resolving the bias needs the image's natural size, so it's async; we tag the
  // result with the image it belongs to. A leftover value from a previous open is
  // then ignored by IDENTITY (`resolved.src === imageSrc`) instead of a
  // reset-in-effect, which the Rules of React forbid. A `null` crop is still
  // "resolved" (load failed / square image → fall through to the centred default).
  const [resolved, setResolved] = useState<{
    src: string;
    crop: PortraitCrop | null;
  } | null>(null);

  useEffect(() => {
    if (!open || !imageSrc || !wantsFaceBias) return;
    let cancelled = false;
    const img = new Image();
    const settle = (crop: PortraitCrop | null) => {
      if (!cancelled) setResolved({ src: imageSrc, crop });
    };
    // Reading naturalWidth/Height needs no CORS (only canvas pixel access does),
    // so this works for both the data URL (new photo) and the Firebase URL
    // (re-crop of an imported portrait that was stored without a crop).
    img.onload = () => settle(faceBiasedDefaultCrop(img.naturalWidth, img.naturalHeight));
    img.onerror = () => settle(null);
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [open, imageSrc, wantsFaceBias]);

  const biasResolvedForThisImage = !!resolved && resolved.src === imageSrc;
  const faceDefault =
    wantsFaceBias && resolved && resolved.src === imageSrc ? resolved.crop : null;
  const initialArea = safeInitialCrop ?? faceDefault ?? undefined;
  // Hold the cropper until the initial frame is known so the bias applies on the
  // FIRST mount. Nothing to resolve (re-crop / banner) → ready immediately.
  const cropperReady = !wantsFaceBias || biasResolvedForThisImage;

  // Use onCropAreaChange (not onCropComplete) to always track the latest crop
  // area. onCropComplete only fires when the user STOPS interacting, but
  // onCropAreaChange also fires when initialCroppedAreaPercentages is applied
  // on mount — preventing a stale default value from being used on confirm.
  const onAreaChange = useCallback((area: Area) => {
    setCroppedArea(area);
  }, []);

  function handleConfirm() {
    if (!croppedArea || !imageSrc) return;
    onConfirm(croppedArea);
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      rubric={t("portrait.crop.eyebrow")}
      title={t("portrait.crop.title")}
      subtitle={t("portrait.crop.subtitle")}
      // Hug the content: the body is fixed-height (crop stage + slider + actions),
      // so the default 88vh shell left a huge dead void under the actions.
      compact
    >
      {/* ── Crop area (only render Cropper when we have a real image) ── */}
      {/* Local error boundary: if react-easy-crop throws (degenerate image /
          crop math), recover inline instead of white-screening the SPA. */}
      <div className="relative h-72 w-full shrink-0 overflow-hidden bg-black">
        {open && imageSrc ? (
          <PortraitCropErrorBoundary
            resetKey={cropperKey}
            onRetry={() => setCropperKey((k) => k + 1)}
            messages={{
              error: t("portrait.crop.cropperError"),
              retry: t("common.retry"),
            }}
          >
            {cropperReady ? (
              <Cropper
                key={cropperKey}
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape="rect"
                // Rule-of-thirds guides help frame the wide banner; the square
                // portrait stays clean (matching the old circle's gridless feel).
                showGrid={isBanner}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropAreaChange={onAreaChange}
                initialCroppedAreaPercentages={initialArea}
                style={{
                  containerStyle: { background: "#000" },
                  cropAreaStyle: {
                    border: "2px solid rgba(200, 168, 75, 0.8)", // --accent
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
                    // Portrait = the lapidary rounded square the tiles render;
                    // banner = sharp wide rect. The boxShadow scrim follows it.
                    ...(isBanner ? {} : { borderRadius: "var(--radius-lg)" }),
                  },
                }}
              />
            ) : (
              // Brief: measuring the image's natural size to open the square on
              // the face. A data URL resolves in the same frame, so this is only
              // ever visible for a slow remote re-crop.
              <div className="absolute inset-0 grid place-items-center">
                <Spinner size="lg" />
              </div>
            )}
          </PortraitCropErrorBoundary>
        ) : null}
      </div>

      {/* ── Zoom slider ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-border-subtle bg-bg-secondary shrink-0">
        <button
          onClick={() => setZoom((z) => Math.max(1, +(z - 0.1).toFixed(2)))}
          className="text-text-secondary hover:text-text-primary transition-colors"
          aria-label={t("portrait.crop.zoomOut")}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-accent h-1.5 rounded cursor-pointer"
          aria-label={t("portrait.crop.zoom")}
        />
        <button
          onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
          className="text-text-secondary hover:text-text-primary transition-colors"
          aria-label={t("portrait.crop.zoomIn")}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {/* ── Actions ── (folio Button recipe, not raw bg-accent — #58 coherence) */}
      <div className="flex gap-3 px-5 py-4 shrink-0">
        <Button variant="ghost" onClick={onClose} className="flex-1">
          <Icon as={X} size="sm" decorative />
          {t("common.cancel")}
        </Button>
        <Button onClick={handleConfirm} className="flex-1">
          <Icon as={Check} size="sm" decorative />
          {t("portrait.crop.confirm")}
        </Button>
      </div>
    </ModalShell>
  );
}
