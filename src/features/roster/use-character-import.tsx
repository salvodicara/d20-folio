/**
 * useCharacterImport — the reusable core of "import a character from JSON".
 *
 * Extracted from <ImportJsonButton> so the SAME flow can be driven from more than
 * one entry point (the roster header button AND the "Ask the Folio" command palette,
 * OWN-28d) without forking the logic. It owns the hidden file input, the toasts, and
 * the dev-bypass guard; callers render `element` and call `open()` from a user
 * gesture to launch the OS picker.
 *
 * Wires the shipped importer (`importCharacterFromFile` → `importCharacter`, which
 * accepts the d20-folio v3 export and a raw CharacterDoc): pick a `.json`, then
 * create a fresh character via `createCharacter` (the live roster listener shows it).
 * The v3 codec is strictly id-based, so there is nothing to name-match on import —
 * a successful parse is committed directly.
 *
 * It ALSO accepts a `.zip` — the roster's bulk export (one `.json` per character).
 * That path imports every contained character at once (`importCharactersFromZip`)
 * and reports a single batch summary toast, so a multi-character backup round-trips
 * in one pick.
 */

import { useCallback, useRef, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { useUndoStore } from "@/stores/undoStore";
import { rosterToast } from "./roster-toast";
import { createCharacter, updateCharacter } from "@/lib/firestore";
// Type-only (erased) — the runtime importer is lazy-loaded on file pick so the
// SRD-resolving character-io graph never weighs on the roster bundle (#59/#78).
import type { ImportResult } from "@/lib/character-io";
import { uploadAndAttachPortrait } from "@/lib/storage";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";

/**
 * Map the importer's (English, internal) error string onto a localized key. The lib
 * returns a small fixed set of reasons; everything else falls back to generic copy.
 */
function localizedImportError(error: string, t: TFunction): string {
  // R4 — a pre-multiclass (schema-2) file: the app no longer upgrades old formats;
  // the owner regenerates them. Friendly, actionable copy (EN + IT). The sentinel
  // string matches `SCHEMA_2_REJECTED_REASON` from the codec (inlined to keep the
  // SRD-resolving codec off the eager roster bundle).
  if (error === "schema-2-unsupported") return t("import.oldFormat");
  if (/parse|invalid json/i.test(error)) return t("import.invalidJson");
  if (/too large/i.test(error)) return t("import.fileTooLarge");
  if (/\.json/i.test(error)) return t("import.mustBeJson");
  if (/format|unrecognized/i.test(error)) return t("import.invalidFormat");
  return t("import.error");
}

export interface CharacterImport {
  /** Open the OS file picker. Must be called from a user gesture. */
  open: () => void;
  /** The hidden file input — render once where the import is hosted. */
  element: ReactNode;
}

export function useCharacterImport(): CharacterImport {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const inputRef = useRef<HTMLInputElement>(null);

  // Commit a parsed import as a fresh, active character, then RE-UPLOAD its portrait.
  // The JSON export embeds the portrait as a base64 data URL (portraits live in
  // Storage, never in the doc), so on import we create the character portrait-less,
  // push the embedded base64 back to Storage, and attach its URL + crop. The portrait
  // re-upload is best-effort: a failure leaves the character portrait-less (the player
  // can re-add it) and never blocks the import; `uploadAndAttachPortrait` rolls back an
  // orphaned Storage object if the Firestore write fails after the upload. Returns
  // success WITHOUT toasting, so the single-file path can toast per character while the
  // ZIP path commits each then toasts once with a batch summary.
  const commitImport = useCallback(
    async (result: ImportResult): Promise<boolean> => {
      if (!uid) return false;
      try {
        const charId = await createCharacter(uid, {
          ...result.doc,
          status: "active",
          portraitUrl: null,
          portraitCrop: null,
        });
        if (result.portraitBase64) {
          await uploadAndAttachPortrait(uid, charId, result.portraitBase64, (url) =>
            updateCharacter(uid, charId, {
              portraitUrl: url,
              portraitCrop: result.portraitCrop ?? null,
            })
          ).catch(() => {
            // Portrait is optional — the character is already imported.
          });
        }
        // Undo-stack FENCE (§5.4): an import commits a fresh character document; drop
        // any stale reverse-appliers so the session stack can't outlive the import.
        useUndoStore.getState().clear();
        return true;
      } catch {
        return false;
      }
    },
    [uid]
  );

  const finalize = useCallback(
    async (result: ImportResult) => {
      // The dev-bypass preview has no Firestore to commit to — but only the COMMIT
      // is blocked, deliberately AFTER the parse, so the whole rejection surface
      // (invalid JSON / wrong format / pre-v3) behaves exactly as production and
      // stays verifiable offline (rule 15).
      if (DEV_BYPASS_AUTH) {
        rosterToast(t("roster.importPreviewBlocked"));
        return;
      }
      const ok = await commitImport(result);
      rosterToast(
        ok ? t("import.success", { name: result.doc.character.name }) : t("import.error")
      );
    },
    [commitImport, t]
  );

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so picking the SAME file again still fires onChange.
      e.target.value = "";
      if (!file || !uid) return;
      // A ZIP is a bulk export (one .json per character). Unpack and import each,
      // auto-accepting smart-matches (showing N review modals would be hostile) and
      // reporting a single batch summary.
      const isZip = file.name.toLowerCase().endsWith(".zip") || /zip/i.test(file.type);
      if (isZip) {
        const { importCharactersFromZip } = await import("@/lib/character-io");
        const results = await importCharactersFromZip(file);
        // A single error result = the whole archive failed (unreadable / empty).
        const [firstResult] = results;
        const archiveError =
          results.length === 1 && firstResult && !firstResult.success
            ? firstResult.error
            : null;
        if (archiveError) {
          rosterToast(
            /no character/i.test(archiveError)
              ? t("import.zipEmpty")
              : t("import.zipError")
          );
          return;
        }
        // Same commit-only block for the batch path (parse already succeeded).
        if (DEV_BYPASS_AUTH) {
          rosterToast(t("roster.importPreviewBlocked"));
          return;
        }
        let imported = 0;
        for (const r of results) {
          if (r.success && (await commitImport(r))) imported++;
        }
        const failed = results.length - imported;
        rosterToast(
          failed > 0
            ? t("import.zipPartial", { imported, failed })
            : t("import.zipImported", { count: imported })
        );
        return;
      }

      const { importCharacterFromFile } = await import("@/lib/character-io");
      const result = await importCharacterFromFile(file);
      if (!result.success) {
        rosterToast(localizedImportError(result.error, t));
        return;
      }
      // The v3 codec is strictly id-based — a successful parse needs no name-match
      // review; commit it directly.
      await finalize(result);
    },
    [uid, t, finalize, commitImport]
  );

  const open = useCallback(() => inputRef.current?.click(), []);

  const element = (
    // Visually hidden, keyboard-skipped, screen-reader-ignored: the real labelled
    // control(s) that open the OS picker live at the call sites.
    <input
      ref={inputRef}
      type="file"
      accept=".json,application/json,.zip,application/zip,application/x-zip-compressed"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => void onFile(e)}
    />
  );

  return { open, element };
}
