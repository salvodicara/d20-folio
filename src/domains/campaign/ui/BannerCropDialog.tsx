/**
 * The campaign picture's cropper on the new screen (the avatar/banner cropper of
 * Discord, Notion and D&D Beyond): a frame at the banner's 16:9 shape to drag (a
 * finger or the mouse), pinch or a wheel to zoom, a zoom slider, and a live preview of
 * the header's round crest. «Salva» hands back the % rectangle the classic flow stores;
 * «Annulla» keeps the picture as it was; a picture already set can be removed.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  crestImageStyle,
  cropFromView,
  panView,
  viewFromCrop,
  type CropView,
  type ImageSize,
} from "@/domains/campaign/banner-crop";
import { cropToCssStyle } from "@/lib/portrait-crop";
import type { PortraitCrop } from "@/types/character";
import { Button, Dialog } from "@/ui";

export function BannerCropDialog({
  src,
  initialCrop,
  imageSize,
  onSave,
  onCancel,
  onRemove,
}: {
  src: string;
  initialCrop: PortraitCrop | null;
  /** The picture's size; read from the image when absent. */
  imageSize?: ImageSize;
  onSave: (crop: PortraitCrop) => void;
  onCancel: () => void;
  /** A picture already set: it can be removed. */
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const [size, setSize] = useState<ImageSize | null>(imageSize ?? null);
  const [view, setView] = useState<CropView | null>(
    imageSize ? viewFromCrop(imageSize, initialCrop) : null
  );
  const frame = useRef<HTMLDivElement>(null);
  // The pointers on the frame: one drags, two pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const crop = size && view ? cropFromView(size, view) : null;

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const zoomTo = (zoom: number) => setView((v) => v && { ...v, zoom: clampZoom(zoom) });

  return (
    <Dialog
      open
      onClose={onCancel}
      color="grp"
      title={t("portrait.crop.banner.title")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
          <Button kind="primary" disabled={!crop} onClick={() => crop && onSave(crop)}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <p className="f-quiet f-ask">{t("portrait.crop.subtitle")}</p>
      <div
        ref={frame}
        className="f-bcrop"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2 && view)
            pinch.current = { distance: distance(), zoom: view.zoom };
        }}
        onPointerMove={(e) => {
          const last = pointers.current.get(e.pointerId);
          if (!last || !size) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2 && pinch.current) {
            const start = pinch.current;
            if (start.distance > 0) zoomTo((start.zoom * distance()) / start.distance);
            return;
          }
          const frameWidth = frame.current?.clientWidth ?? 0;
          setView(
            (v) =>
              v &&
              panView(size, v, {
                dx: e.clientX - last.x,
                dy: e.clientY - last.y,
                frameWidth,
              })
          );
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
        onWheel={(e) => view && zoomTo(view.zoom - e.deltaY / 500)}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          style={crop ? cropToCssStyle(crop) : { visibility: "hidden" }}
          onLoad={(e) => {
            if (size) return;
            const img = e.currentTarget;
            const read = { width: img.naturalWidth, height: img.naturalHeight };
            setSize(read);
            setView(viewFromCrop(read, initialCrop));
          }}
        />
      </div>
      <div className="f-ask f-bcrop-row">
        <label className="f-bcrop-zoom">
          <span className="f-lbl">{t("portrait.crop.zoom")}</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={view?.zoom ?? 1}
            aria-label={t("portrait.crop.zoom")}
            onChange={(e) => zoomTo(Number(e.target.value))}
          />
        </label>
        <span
          className="f-bcrop-preview"
          role="img"
          aria-label={t("campaignScreen.crestPreview")}
        >
          <img src={src} alt="" style={crestImageStyle(crop)} />
        </span>
      </div>
      {onRemove && (
        <div className="f-ask">
          <Button kind="quiet" icon="u-delete" onClick={onRemove}>
            {t("campaignScreen.removeBanner")}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
