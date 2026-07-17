/**
 * ShortcutsSheet — the `?` keyboard-shortcuts reference (D7 / §3.5).
 *
 * A branded Dialog (inherits the focus trap, Esc, scrim, and overlay-Back from the
 * shared `Dialog`/`DialogContent` primitives) that renders the `SHORTCUTS` registry
 * as titled sections — so the sheet can NEVER drift from what actually fires (one
 * source of truth). Each row is a localized label + its `<kbd>` chips (the topbar's
 * exact kbd recipe): combos via `shortcutLabel`, sequences as two chips joined by
 * the localized "then". The admin-only row is hidden for non-admins.
 *
 * Open state lives in `uiStore.shortcutsOpen`, so the `?` key, the palette's
 * shortcuts action, and the palette footer chip all drive the ONE sheet.
 */

import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogBody } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { shortcutLabel } from "@/lib/platform";
import type { ShortcutKeys } from "@/lib/shortcuts";
import { SHORTCUTS } from "@/lib/shortcuts-registry";
import { useUIStore } from "@/stores/uiStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/** Render a row's keys: a combo chip, a `first then second` sequence, or a key. */
function ShortcutChips({ keys, thenWord }: { keys: ShortcutKeys; thenWord: string }) {
  if (keys.kind === "combo") return <Kbd>{shortcutLabel(keys.key, keys.shift)}</Kbd>;
  if (keys.kind === "seq") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Kbd>{keys.first}</Kbd>
        <span className="text-text-muted">{thenWord}</span>
        <Kbd>{keys.second}</Kbd>
      </span>
    );
  }
  return <Kbd>{keys.key}</Kbd>;
}

export function ShortcutsSheet() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.shortcutsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsOpen);
  const isAdmin = useIsAdmin();
  const thenWord = t("shortcuts.then");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="lg"
        rubric={t("shortcuts.rubric")}
        title={t("shortcuts.title")}
        description={t("shortcuts.description")}
        closeLabel={t("common.close")}
      >
        <DialogBody className="flex flex-col gap-5">
          {SHORTCUTS.map((section) => {
            const rows = section.rows.filter((r) => !r.adminOnly || isAdmin);
            if (rows.length === 0) return null;
            return (
              <section key={section.group}>
                <SectionHeader as="h2" tight title={t(section.titleKey)} />
                <dl className="mt-2 flex flex-col">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between gap-4 py-1.5"
                    >
                      <dt className="text-sm text-text-secondary">{t(row.labelKey)}</dt>
                      <dd className="shrink-0">
                        <span className="inline-flex items-center gap-1.5">
                          <ShortcutChips keys={row.keys} thenWord={thenWord} />
                          {row.altKeys && (
                            <>
                              {/* Alias separator — the same quiet middot the app uses between
                                  peer bits (a glyph, not a localizable string). */}
                              <span className="text-text-muted" aria-hidden="true">
                                ·
                              </span>
                              <ShortcutChips keys={row.altKeys} thenWord={thenWord} />
                            </>
                          )}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
