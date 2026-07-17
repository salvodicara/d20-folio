/**
 * usePortraitCrop
 *
 * Shared hook for the portrait upload + crop flow.
 * Used by both the sheet header (circle) and the lore page (rectangle).
 *
 * Design:
 *   - ONE file per character: users/{uid}/portraits/{charId}.jpeg (compressed original)
 *   - Crop metadata (percentages) stored in CharacterDoc.portraitCrop
 *   - Re-crop = metadata-only update (no re-upload)
 *   - All portrait changes are written to Firestore immediately via
 *     updateCharacter — NOT via the debounced auto-save
 *
 * Two session types:
 *   "new"    — user selected a new file; compressed blob needs uploading
 *   "recrop" — user wants to re-frame the already-stored original
 *
 * Flow (new photo):
 *   1. openFilePickerForNew() → fileInputRef.current.click()
 *   2. onFileChange: compress file → read as data URL → cropSrc shown in modal
 *   3. PortraitCropModal shown; user frames the crop
 *   4. onConfirm(croppedArea): upload blob → updateCharacter({ portraitUrl, portraitCrop })
 *
 * Flow (re-crop existing):
 *   1. openRecrop() → cropSrc = character.portraitUrl (Firebase URL, no CORS issue
 *      because we no longer call getCroppedImg / canvas draw)
 *   2. PortraitCropModal shown with the existing URL
 *   3. onConfirm(croppedArea): updateCharacter({ portraitCrop }) only — no upload
 *
 * Flow (remove):
 *   1. removePortrait() → deletePortrait → updateCharacter({ portraitUrl: null, portraitCrop: null })
 */

import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Area } from "react-easy-crop";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { uploadPortrait, deletePortrait, compressImage } from "@/lib/storage";
import { updateCharacter } from "@/lib/firestore";
import { readFileAsDataUrl } from "@/lib/image-crop";
import { normalizePortraitCrop } from "@/lib/portrait-crop";

// ─── Types ────────────────────────────────────────────────────────────────────

type CropSession =
  | {
      type: "new";
      /** Compressed JPEG blob ready for upload on confirm */
      compressedBlob: Blob;
    }
  | { type: "recrop"; initialCropArea: Area | null }
  | null;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePortraitCrop() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const character = useCharacterStore((s) => s.character);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const showToast = useToastStore((s) => s.showToast);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSession, setCropSession] = useState<CropSession>(null);

  // ── Trigger file picker for a brand-new photo ──

  function openFilePickerForNew() {
    fileInputRef.current?.click();
  }

  // ── onFileChange: compress → show crop modal ──

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

  // ── openRecrop: show crop modal with existing portrait URL ──
  // No re-upload needed. React-easy-crop renders the image as a plain <img>
  // (no canvas draw), so cross-origin Firebase Storage URLs work fine.

  function openRecrop() {
    if (!character?.portraitUrl) return;
    setCropSession({ type: "recrop", initialCropArea: character.portraitCrop ?? null });
    setCropSrc(character.portraitUrl);
  }

  // ── onConfirm: upload (if new) + immediate Firestore save ──

  async function onConfirm(croppedArea: Area) {
    if (!user || !character || !cropSession) return;
    // Validate/clamp the crop rect before persisting — a degenerate rect
    // (NaN / zero / out-of-range) would crash the cropper on re-open and
    // divide-by-zero on display. Reject rather than save a poisoned value.
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
      if (cropSession.type === "new") {
        const portraitUrl = await uploadPortrait(
          user.uid,
          character.id,
          cropSession.compressedBlob
        );
        await updateCharacter(user.uid, character.id, {
          portraitUrl,
          portraitCrop: safeCrop,
        });
        // Use getState() for the latest store value after async operations
        const current = useCharacterStore.getState().character;
        if (current && current.id === character.id) {
          setCharacter({ ...current, portraitUrl, portraitCrop: safeCrop });
        }
      } else {
        // recrop — metadata-only update, no re-upload
        await updateCharacter(user.uid, character.id, {
          portraitCrop: safeCrop,
        });
        // Use getState() for the latest store value after async operations
        const current = useCharacterStore.getState().character;
        if (current && current.id === character.id) {
          setCharacter({ ...current, portraitCrop: safeCrop });
        }
      }
    } catch {
      // Never surface the raw SDK error string (DESIGN §15.3) — say what
      // happened and what to do in the user's language.
      showToast({
        message: t("portrait.crop.saveError"),
        duration: 5000,
      });
    } finally {
      setUploading(false);
      setCropSession(null);
    }
  }

  // ── onCancel: dismiss crop modal ──

  function onCancel() {
    setCropSrc(null);
    setCropSession(null);
  }

  // ── removePortrait: delete from storage + immediate Firestore clear ──

  async function removePortrait() {
    if (!user || !character) return;
    setUploading(true);
    try {
      await deletePortrait(user.uid, character.id);
      await updateCharacter(user.uid, character.id, {
        portraitUrl: null,
        portraitCrop: null,
      });
      setCharacter({ ...character, portraitUrl: null, portraitCrop: null });
    } catch {
      showToast({
        message: t("portrait.crop.saveError"),
        duration: 5000,
      });
    } finally {
      setUploading(false);
    }
  }

  return {
    /** Ref to attach to the hidden <input type="file"> */
    fileInputRef,
    /** Data URL (or Firebase URL for re-crop) to show in crop modal; non-null when modal should be open */
    cropSrc,
    /** True while compressing, uploading, or deleting */
    uploading,
    /** For re-crop sessions, the existing crop area to restore initial position */
    initialCropArea: cropSession?.type === "recrop" ? cropSession.initialCropArea : null,
    /** Open file picker to upload a brand-new photo */
    openFilePickerForNew,
    onFileChange,
    onConfirm,
    onCancel,
    /** Open the crop modal with the existing portrait (no re-upload) */
    openRecrop,
    /** Delete the portrait file and clear Firestore immediately */
    removePortrait,
  };
}
