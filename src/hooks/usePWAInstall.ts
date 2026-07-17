/**
 * usePWAInstall Hook
 *
 * Captures the `beforeinstallprompt` event and provides a method to
 * trigger the native PWA install prompt. Also tracks whether the app
 * is already installed (display-mode: standalone).
 */

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

interface PWAInstallState {
  /** Whether the install prompt is available */
  canInstall: boolean;
  /** Whether the app is already installed / running as PWA */
  isInstalled: boolean;
  /** Trigger the install prompt */
  install: () => Promise<void>;
  /**
   * Permanently dismiss the install prompt for this browser. The flag is
   * persisted to localStorage (PWA-banner item a) so a refresh — or a new
   * `beforeinstallprompt` later in the session — never resurrects the banner the
   * user already waved away. The native prompt is one-shot per gesture anyway, so
   * once dismissed there is no value in re-offering it on every reload.
   */
  dismissInstall: () => void;
}

/** localStorage key recording that the user dismissed the install banner. */
const INSTALL_DISMISSED_KEY = "d20-folio-pwa-install-dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  // Seeded from localStorage so a refresh keeps the banner dismissed (item a).
  const [dismissed, setDismissed] = useState(readDismissed);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    // iOS Safari exposes navigator.standalone (non-standard) — declare-merge
    // the type rather than using `as unknown as` so the boolean is properly
    // typed at the call site.
    const nav = navigator as Navigator & { standalone?: boolean };
    const iosStandalone = nav.standalone === true;
    return standalone || iosStandalone;
  });

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismissInstall = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    } catch {
      /* storage unavailable (private mode) — the in-memory flag still hides it */
    }
  }, []);

  return {
    canInstall: deferredPrompt != null && !isInstalled && !dismissed,
    isInstalled,
    install,
    dismissInstall,
  };
}
