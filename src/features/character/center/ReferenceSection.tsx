/**
 * ReferenceSection — a Play-tab foot block that reads as just its folio header
 * when collapsed and blooms its whole body IN PLACE on click (owner-ratified
 * 2026-07-24). It wires the shared {@link SectionHeader} header-as-disclosure mode
 * to the PERSISTED `uiStore.playRefSections` slice (keyed by `id`), so a section's
 * open/closed choice survives tab switches + reloads per user; the ⌘K palette can
 * drive the same slice to open a section on demand.
 *
 * The body reveal reuses the app's ONE height recipe (`.section-detail-wrap` /
 * `.section-detail`, the `grid-template-rows: 0fr → 1fr` idiom — golden rule 3), so
 * a collapsed section leaves no phantom gap and reduced-motion gets an instant swap.
 * Defaults CLOSED (a missing key = closed) — no first-run special casing.
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { useUIStore } from "@/stores/uiStore";

export function ReferenceSection({
  id,
  anchorId,
  title,
  children,
}: {
  /** Stable persistence key (`play-reference.ts` → PLAY_REF_SECTIONS). */
  id: string;
  /** DOM id on the header — the `aria-labelledby` target + the palette scroll anchor. */
  anchorId: string;
  /** Section title (a string, so it can seed the toggle's accessible name). */
  title: string;
  /** The full body that blooms when the section opens. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.playRefSections[id] ?? false);
  const setPlayRefOpen = useUIStore((s) => s.setPlayRefOpen);
  const bodyId = `${anchorId}-body`;

  return (
    <section className="mt-6" aria-labelledby={anchorId}>
      <SectionHeader
        as="h3"
        id={anchorId}
        title={title}
        disclosure={{
          open,
          onToggle: () => setPlayRefOpen(id, !open),
          controlsId: bodyId,
          label: open
            ? t("common.hideSection", { section: title })
            : t("common.showSection", { section: title }),
        }}
      />
      <div className="section-detail-wrap" data-open={open || undefined}>
        <div className="section-detail" id={bodyId}>
          {children}
        </div>
      </div>
    </section>
  );
}
