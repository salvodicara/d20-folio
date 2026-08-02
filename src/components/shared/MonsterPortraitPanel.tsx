/**
 * MonsterPortraitPanel (Part B) — the shared, self-contained portrait editor for a
 * monster's art. ONE component for both homes (golden rule 3/6):
 *   • the compendium/bestiary monster detail (a per-user SRD override, `kind:"srd"`);
 *   • the encounter's custom-monster create/edit form (art kept on the library entry,
 *     `kind:"entry"`).
 *
 * A SQUARE seal drawn through the shared {@link Portrait} primitive: the uploaded art
 * (crop-framed), else the creature-type GLYPH default, else the tinted monogram —
 * override-first (golden rule 8). When `editable`, it wears the SAME affordance as the
 * character seal (the `.seal-edit-veil` camera on hover, the shared {@link
 * PortraitEditMenu} popover: Re-crop · Upload new · Remove, and the shared {@link
 * PortraitCropModal}), so a monster's portrait edits identically to a hero's. All the
 * upload/crop/persist logic lives in {@link useMonsterPortrait}; this owns only the
 * menu-open + dismissal chrome.
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera } from "lucide-react";
import { Portrait } from "@/components/shared/Portrait";
import { PortraitEditMenu } from "@/components/shared/PortraitEditMenu";
import { PortraitCropModal } from "@/components/shared/PortraitCropModal";
import { Spinner } from "@/components/ui/spinner";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import {
  useMonsterPortrait,
  type MonsterPortraitTarget,
} from "@/hooks/useMonsterPortrait";
import { CREATURE_GLYPH_PATH } from "@/data/creature-glyphs";
import { cn } from "@/lib/utils";
import type { CreatureType } from "@/data/types";
import type { PortraitCrop } from "@/types/character";

export function MonsterPortraitPanel({
  target,
  portraitUrl = null,
  portraitCrop = null,
  name,
  seed,
  creatureType,
  className,
}: {
  target: MonsterPortraitTarget;
  portraitUrl?: string | null;
  portraitCrop?: PortraitCrop | null;
  /** Display name — the fallback monogram + the accessible alt. */
  name: string;
  /** Stable seed for the deterministic fallback tint. */
  seed: string;
  /** Creature type — the glyph default beneath the upload; absent → monogram. */
  creatureType?: CreatureType;
  /** Sizing utility classes for the square seal frame (defaults to a 6rem seal). */
  className?: string;
}) {
  const { t } = useTranslation();
  const {
    fileInputRef,
    cropSrc,
    uploading,
    initialCropArea,
    openFilePickerForNew,
    onFileChange,
    onConfirm,
    onCancel,
    openRecrop,
    removePortrait,
  } = useMonsterPortrait(target, { portraitUrl, portraitCrop });

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuOpen, menuRef, () => setMenuOpen(false));

  const glyphPath = creatureType ? CREATURE_GLYPH_PATH[creatureType] : null;

  const seal = (
    <span className="seal relative block aspect-square h-full w-full overflow-hidden">
      <Portrait
        src={portraitUrl}
        crop={portraitCrop}
        name={name}
        seed={seed}
        glyphPath={glyphPath}
        className="h-full w-full"
      />
      {/* Hover-only camera veil (the seal reads clean at rest, unlike the character
          seal's always-on edit-mode veil — the monster panel is always editable). */}
      {!uploading && (
        <span className="seal-edit-veil seal-edit-veil--hover" aria-hidden>
          <Camera className="h-6 w-6" />
        </span>
      )}
      {uploading && (
        <span className="absolute inset-0 flex items-center justify-center bg-bg-page/50">
          <Spinner size="md" />
        </span>
      )}
    </span>
  );

  return (
    <div ref={menuRef} className={cn("relative shrink-0", className)}>
      {/* The seal IS the affordance (the panel is always editable): a portrait opens
          the menu, an empty seal opens the file picker straight away. */}
      <button
        type="button"
        disabled={uploading}
        aria-label={t("portrait.menu.edit")}
        className="block h-full w-full cursor-pointer"
        onClick={() => {
          if (portraitUrl) setMenuOpen((v) => !v);
          else openFilePickerForNew();
        }}
      >
        {seal}
      </button>

      {menuOpen && (
        <PortraitEditMenu
          className="left-0 top-full mt-1.5"
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
            void removePortrait();
          }}
        />
      )}

      {/* Hidden file input + shared crop modal — identical wiring to the character seal. */}
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
        onConfirm={(area) => void onConfirm(area)}
        onClose={onCancel}
      />
    </div>
  );
}
