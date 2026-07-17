/**
 * PickerDetailModal — the shared "More" detail modal for the unified spell/feat picker
 * (W2). Given any compendium entry + its picker spec, it renders the entry's full read
 * view (`CompendiumDetailBody` driven by `spec.detail`) inside the folio `ModalShell`.
 * ONE modal for spells and feats alike — the single source of truth for an entry's
 * details, reused verbatim from the compendium so there's no second detail layout.
 */

import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { CompendiumDetailBody } from "@/features/compendium/picker/detail";
import { useCharacterStore } from "@/stores/characterStore";
import type { CompendiumPickerSpec } from "@/features/compendium/picker/types";

// The entry's display strings come from `spec.getName`/`spec.detail` (catalogue),
// so this modal never reads the entry's own text — `T` carries only a stable id.
export function PickerDetailModal<T extends { id: string }>({
  entry,
  spec,
  onClose,
}: {
  /** The entry whose detail to show, or undefined/null when closed. */
  entry: T | null | undefined;
  spec: CompendiumPickerSpec<T>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "it" ? "it" : "en";
  const character = useCharacterStore((s) => s.character);
  return (
    <ModalShell
      open={entry != null}
      onClose={onClose}
      // The localized title comes from the spec's `getName` (which resolves SRD
      // strings from the catalogue), so the modal never reads the entry's BiText.
      title={
        entry
          ? spec.getName(entry, { t, locale, character, mode: "add" as const })
          : undefined
      }
      // Hug the content (a read-only detail) — a short feat/spell shouldn't leave a
      // big empty void below; long descriptions still scroll under the 88vh cap.
      compact
    >
      {entry && (
        <CompendiumDetailBody
          view={spec.detail(
            entry,
            { t, locale, character, mode: "add" as const },
            { added: false }
          )}
          locale={locale}
        />
      )}
    </ModalShell>
  );
}
