/**
 * useRosterActions — the data-layer orchestrator behind a roster card's
 * overflow menu (Phase 6, slice 2).
 *
 * `CharacterCard` stays a PURE VIEW: it renders the menu and dispatches to
 * these callbacks. EVERY Firestore / business concern lives here — reading the
 * signed-in uid, calling the shipped lib io (createCharacter / updateCharacter /
 * deleteCharacter + downloadCharacterJSON), the destructive-delete confirm
 * prompt, the success / failure toasts, and the dev-bypass guard for Clone.
 *
 * Why Clone needs an explicit guard: `updateCharacter` and `deleteCharacter`
 * self-guard `DEV_BYPASS_AUTH` (they early-return), but `createCharacter` does
 * NOT — so a Clone under the local preview would attempt a live write against a
 * Firestore that isn't there. We mirror the other writers' guard here.
 *
 * The roster's `useCharacters()` is a live `onSnapshot` listener, so every
 * mutation reflects in the grid automatically — there is no manual refetch.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { CharacterDoc } from "@/types/character";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { createCharacter, updateCharacter, getFullCharacter } from "@/lib/firestore";
import { deleteCharacterAndDetach } from "@/features/roster/delete-character";
import { rosterToast } from "./roster-toast";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { nonEmptyString } from "@/lib/non-empty-string";
import { MOCK_CHARACTER } from "@/lib/mock";

export interface RosterActions {
  /** Download the character as a portable JSON file (no auth; works in bypass). */
  exportJson: () => Promise<void>;
  /** Download the character as a printable PDF character sheet (official 2024 layout). */
  exportPdf: () => Promise<void>;
  /** Create a renamed, portrait-less copy (no-op under dev-bypass). */
  clone: () => Promise<void>;
  /** Mark the character retired (active → retired). */
  retire: () => Promise<void>;
  /** Bring a retired/archived/dead character back (→ active). */
  restore: () => Promise<void>;
  /** Confirm, then cascade-delete the character (portrait → snapshots → doc). */
  remove: () => Promise<void>;
}

/**
 * Build the row-action callbacks for one roster card. Memoized per character so
 * the card can dispatch without re-creating handlers each render.
 */
export function useRosterActions(character: RosterCharacterDoc): RosterActions {
  const { t, i18n } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const name = character.character.name;
  const charId = character.id;

  // Export + Clone need the COMPLETE character (abilityScores / equipment / spells),
  // which the SRD-free roster projection deliberately omits (#106). Re-read + parse
  // the stored envelope on demand; under dev-bypass there is no Firestore, so fall
  // back to the in-memory mock the projection was derived from. Returns null on a
  // missing/failed read so the caller surfaces a clean failure toast.
  const loadFull = useCallback(async (): Promise<CharacterDoc | null> => {
    if (DEV_BYPASS_AUTH) return { ...MOCK_CHARACTER, id: charId };
    if (!uid) return null;
    return getFullCharacter(uid, charId);
  }, [uid, charId]);

  const exportJson = useCallback(async () => {
    // The browser download IS the feedback on success; only surface failures.
    try {
      const full = await loadFull();
      if (!full) throw new Error("character not found");
      // Lazy-load character-io ONLY when the user exports — it pulls the v2 codec
      // + SRD-resolving modules, which must never weigh on the roster's initial
      // bundle (#59/#78). Export is a deliberate click, so the one-time fetch is
      // invisible.
      const { downloadCharacterJSON } = await import("@/lib/character-io");
      const { portraitDropped } = await downloadCharacterJSON(full);
      // A dropped portrait is NEVER silent: the file shipped, but its face couldn't
      // be read (offline / Storage object gone), so the re-import would be faceless.
      // Warn the user so they can re-export online — the owner's exact "exported, the
      // portrait is gone" report (root cause: an unreadable opaque-cached image).
      if (portraitDropped) rosterToast(t("roster.exportPortraitDropped", { name }));
    } catch {
      rosterToast(t("roster.exportFailed", { name }));
    }
  }, [loadFull, name, t]);

  const exportPdf = useCallback(async () => {
    try {
      const full = await loadFull();
      if (!full) throw new Error("character not found");
      // Lazy-load the PDF facade ONLY when the user exports — it pulls pdf-lib +
      // the SRD-resolving view presenters, which must never weigh on the roster's
      // initial bundle. Export is a deliberate click, so the one-time fetch is
      // invisible. The active locale + bound `t` drive a fully-localized sheet.
      const { downloadCharacterPdf } = await import("@/lib/pdf/character-pdf-export");
      const locale = i18n.language === "it" ? "it" : "en";
      const { portraitDropped } = await downloadCharacterPdf(full, locale, (key, opts) =>
        t(key, opts)
      );
      // A dropped portrait is NEVER silent — same rule as the JSON path.
      if (portraitDropped) rosterToast(t("roster.exportPortraitDropped", { name }));
    } catch {
      rosterToast(t("roster.exportPdfFailed", { name }));
    }
  }, [loadFull, name, t, i18n.language]);

  const clone = useCallback(async () => {
    if (!uid) return;
    // createCharacter does NOT self-guard DEV_BYPASS (unlike update/delete), so
    // guard here — there is no live Firestore in the local preview.
    if (DEV_BYPASS_AUTH) {
      rosterToast(t("roster.clonePreviewBlocked"));
      return;
    }
    try {
      // Re-read the FULL character (the projection lacks abilityScores/equipment/
      // spells) so the clone is a faithful copy, not a truncated husk (#106).
      const full = await getFullCharacter(uid, charId);
      if (!full) throw new Error("character not found");
      await createCharacter(uid, {
        character: {
          ...full.character,
          // The clone name interpolates the (non-empty) source name, so it is always
          // non-empty; brand it through the smart constructor, falling back to the
          // source name (itself a `NonEmptyString`) on the impossible empty case.
          name: nonEmptyString(t("roster.cloneName", { name })) ?? name,
        },
        // A faithful duplicate keeps the source's play state verbatim. We do NOT
        // recompute a fresh/rested session here — that is rest-engine derive
        // logic, out of scope for a roster action; the user can Rest the copy.
        session: full.session,
        status: "active",
        // A fresh copy owns no portrait: the source portrait is a Storage object
        // at the SOURCE's path, so sharing the URL would let the source's
        // cascade-delete orphan the clone's image (#15 adds portrait mgmt).
        portraitUrl: null,
        portraitCrop: null,
        // No share link, and a fresh character has no snapshots of its own.
        // Campaign membership is NOT copied — it lives on the campaign doc keyed
        // by character id, and a clone is a brand-new id no campaign references.
        shareId: null,
      });
      rosterToast(t("roster.cloned", { name }));
    } catch {
      rosterToast(t("roster.cloneFailed", { name }));
    }
  }, [uid, charId, name, t]);

  const setStatus = useCallback(
    async (status: CharacterDoc["status"], okMsg: string, failMsg: string) => {
      if (!uid) return;
      try {
        await updateCharacter(uid, character.id, { status });
        rosterToast(okMsg);
      } catch {
        rosterToast(failMsg);
      }
    },
    [uid, character.id]
  );

  const retire = useCallback(
    () =>
      setStatus(
        "retired",
        t("roster.retired", { name }),
        t("roster.retireFailed", { name })
      ),
    [setStatus, t, name]
  );

  const restore = useCallback(
    () =>
      setStatus(
        "active",
        t("roster.restored", { name }),
        t("roster.restoreFailed", { name })
      ),
    [setStatus, t, name]
  );

  const remove = useCallback(async () => {
    if (!uid) return;
    const ok = await useConfirmStore.getState().confirm({
      title: t("roster.deleteTitle", { name }),
      message: t("roster.deleteMessage", { name }),
      confirmLabel: t("roster.deleteConfirm"),
      tone: "danger",
    });
    // No undo: soft-delete was removed in Phase 3C; the confirm IS the safety.
    if (!ok) return;
    try {
      // Detach from any shared campaign, THEN cascade portrait → snapshots → doc.
      await deleteCharacterAndDetach(uid, character.id);
      rosterToast(t("roster.deleted", { name }));
    } catch {
      rosterToast(t("roster.deleteFailed", { name }));
    }
  }, [uid, character.id, name, t]);

  return { exportJson, exportPdf, clone, retire, restore, remove };
}

/**
 * useLoadExample — the admin-only "Load example character" action.
 *
 * Seeds a fresh copy of the bundled `MOCK_CHARACTER` (Lyra Voss, the one
 * character that exercises every sheet surface) into the signed-in admin's
 * roster, so the full app can be smoke-tested against the real backend.
 *
 * Page-level, not per-card, so it lives here as its own hook rather than inside
 * `useRosterActions(character)`. It reuses the SAME dev-bypass guard as Clone:
 * `createCharacter` does not self-guard, and the bypass uid is never the admin
 * uid — so the button is naturally hidden in the local preview and this is a
 * no-op even if somehow reached.
 */
export function useLoadExample(): () => Promise<void> {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);

  return useCallback(async () => {
    if (!uid) return;
    if (DEV_BYPASS_AUTH) {
      rosterToast(t("roster.examplePreviewBlocked"));
      return;
    }
    try {
      await createCharacter(uid, {
        // A fresh, independent copy of the bundled example, loaded under its own
        // name (Lyra Voss) and portrait-less (the mock has none).
        character: { ...MOCK_CHARACTER.character },
        session: MOCK_CHARACTER.session,
        status: "active",
        portraitUrl: null,
      });
      rosterToast(t("roster.exampleLoaded"));
    } catch {
      rosterToast(t("roster.exampleFailed"));
    }
  }, [uid, t]);
}
