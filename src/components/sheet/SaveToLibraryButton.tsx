/**
 * SaveToLibraryButton — the "keep this homebrew" affordance on a CUSTOM item's card
 * (spell · gear · armor · weapon · feature). One component for all five surfaces, so
 * the glyph, the accessible name, the cap handling and the toast wording can't drift
 * (golden rule 6); each card renders it inside its EXISTING edit-action cluster,
 * beside the delete glyph — no new chrome.
 *
 * It resolves the item from the ONE source of truth at click time — `(kind, idx)` into
 * the live character — rather than taking a copy through props, so a card can pass its
 * view-model index and the button always saves what is stored right now. A row whose
 * ref is NOT custom is refused (defence in depth; the cards only render it for custom
 * rows).
 */

import { BookmarkPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useCharacterStore } from "@/stores/characterStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { FREE_TIER_LIMITS } from "@/lib/limits";
import { useToastStore } from "@/stores/toastStore";
import type { LibraryDraft, LibraryKind } from "@/lib/library";
import type { CharacterData } from "@/types/character";

/** The stored custom item behind `(kind, idx)`, or null when it isn't homebrew. */
function draftAt(
  data: CharacterData,
  kind: LibraryKind,
  idx: number
): LibraryDraft | null {
  switch (kind) {
    case "spell": {
      const ref = data.spells[idx];
      return ref && "custom" in ref ? { kind: "spell", item: ref } : null;
    }
    case "feature": {
      const ref = data.features[idx];
      return ref && "custom" in ref ? { kind: "feature", item: ref } : null;
    }
    case "equipment": {
      const ref = data.equipment[idx];
      return ref && "custom" in ref ? { kind: "equipment", item: ref } : null;
    }
    case "weapon": {
      const ref = data.weapons[idx];
      return ref && "custom" in ref ? { kind: "weapon", item: ref } : null;
    }
  }
}

export function SaveToLibraryButton({
  kind,
  idx,
  name,
}: {
  kind: LibraryKind;
  /** Index into the stored array for `kind` (the card's `vm.idx`). */
  idx: number;
  /** The row's display name — the accessible name of this icon-only control. */
  name: string;
}) {
  const { t } = useTranslation();

  function handleSave() {
    const doc = useCharacterStore.getState().character;
    if (!doc) return;
    const draft = draftAt(doc.character, kind, idx);
    if (!draft) return;
    const outcome = useLibraryStore.getState().saveToLibrary(draft);
    const message =
      outcome === "saved"
        ? t("custom.savedToLibrary", { name })
        : outcome === "updated"
          ? t("custom.libraryUpdated", { name })
          : outcome === "full"
            ? t("custom.libraryFull", { max: FREE_TIER_LIMITS.libraryEntries })
            : t("custom.libraryUnavailable");
    useToastStore.getState().showToast({
      message,
      duration: outcome === "saved" || outcome === "updated" ? 3000 : 6000,
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      iconOnly
      onClick={(e) => {
        e.stopPropagation();
        handleSave();
      }}
      title={t("custom.saveToLibraryHint")}
    >
      <Icon as={BookmarkPlus} size="sm" decorative />
      <span className="sr-only">{t("custom.saveToLibrary", { name })}</span>
    </Button>
  );
}
