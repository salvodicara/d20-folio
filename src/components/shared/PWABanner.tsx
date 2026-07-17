/**
 * PWABanner
 *
 * Shows contextual banners for PWA state:
 * 1. Offline indicator (when browser goes offline)
 * 2. Install prompt (when PWA can be installed and user hasn't dismissed)
 *
 * ANCHORED to the viewport bottom on EVERY viewport via the `.pwa-dock` folio
 * recipe (it is mounted after the router in `App.tsx`, so in static flow it
 * would land BELOW the footer at the end of the document, where desktop users
 * never see it; the pre-fix `md:static` did exactly that).
 *
 * A fixed strip must never OCCLUDE the page's last content (the legal footer —
 * owner, 2026-06-10): the dock publishes its measured height as
 * `--pwa-banner-h` on <html>, and the AppShell reserves matching bottom
 * padding — the same clearance recipe the shell already uses for the fixed
 * mobile bottom-nav, generalized to a dynamic-height bar. On phone the dock
 * rides ABOVE the bottom-nav whenever that nav is mounted (folio.css), so the
 * realm switcher stays tappable while offline.
 */

import { useEffect, useRef } from "react";
import { WifiOff, Download, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useSaveStore } from "@/stores/saveStore";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

export function PWABanner() {
  const { t } = useTranslation();
  const online = useSaveStore((s) => s.online);
  // Dismissal is owned by the hook and PERSISTED to localStorage (item a), so a
  // refresh never resurrects a banner the user already closed — the old local
  // `useState` reset on every reload.
  const { canInstall, install, dismissInstall } = usePWAInstall();

  const showInstall = canInstall;
  const visible = showInstall || !online;
  const dockRef = useRef<HTMLDivElement>(null);

  // Publish the dock's measured height as `--pwa-banner-h` so the AppShell can
  // reserve matching bottom clearance (footer never occluded). Set immediately
  // on mount, kept current by a ResizeObserver (content/locale/viewport wraps),
  // and REMOVED when the dock hides — the shell padding collapses with it.
  useEffect(() => {
    const el = dockRef.current;
    if (!visible || !el) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty("--pwa-banner-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty("--pwa-banner-h");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div ref={dockRef} className="pwa-dock">
      {/* Offline indicator — a carved neutral status channel (token-built, not a
          flat inverted fill): recessed surface + hairline brass edges, secondary
          ink, the idiomatic `·` separator. Quiet system state, not an alert. */}
      {!online && (
        <div
          className="pointer-events-auto flex items-center justify-center gap-2 px-4 py-1.5 text-text-secondary"
          style={{
            background:
              "color-mix(in oklab, var(--bg-recessed) 75%, var(--bg-surface-1))",
            borderBlock: "1px solid var(--border-medium)",
            boxShadow: "var(--elev-recessed)",
          }}
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">{t("common.offline")}</span>
          <span className="text-[length:var(--text-micro)] opacity-80">
            · {t("common.offlineSync")}
          </span>
        </div>
      )}

      {/* Install prompt — the shared folio `.accent-alert` carved-gilt surface
          (C4); dismiss is the icon-only `.hdr-icon`, not a 999px circle. Full-
          bleed strip on mobile; a centered floating card on desktop. */}
      {showInstall && (
        <div className="accent-alert pointer-events-auto justify-between md:mx-auto md:mb-3 md:w-full md:max-w-2xl">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-accent-text" />
            <span className="text-xs font-medium text-text-primary">
              {t("pwa.installPrompt")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void install()}>
              {t("pwa.install")}
            </Button>
            <IconButton onClick={dismissInstall} aria-label={t("common.close")}>
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
