import { LOCALES, SOURCE_LOCALE, type Locale } from "@/lib/locale";

/**
 * The "loading content" notice shown while an allowlisted account's pack
 * download keeps failing (the app retries until it lands). It can appear before
 * i18n exists, so it reads its sentence straight from each locale's tiny `boot`
 * shard and picks the language the way i18next does (its stored choice, then the
 * browser's).
 */
const BOOT_SHARDS = import.meta.glob<{ boot: { packWaiting: string } }>(
  "../i18n/*/ui/boot.json",
  { eager: true, import: "default" }
);

function text(locale: Locale): string {
  const shard = (code: Locale) => BOOT_SHARDS[`../i18n/${code}/ui/boot.json`];
  return (shard(locale) ?? shard(SOURCE_LOCALE))?.boot.packWaiting ?? "";
}

const NOTICE_ID = "folio-pack-waiting";

function language(): Locale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("i18nextLng");
  } catch {
    // Private mode can deny storage; the browser language decides.
  }
  const wanted = (stored ?? navigator.language).toLowerCase();
  return LOCALES.find((code) => wanted.startsWith(code)) ?? SOURCE_LOCALE;
}

export function showPackWaiting(waiting: boolean): void {
  const existing = document.getElementById(NOTICE_ID);
  if (!waiting) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const notice = document.createElement("p");
  notice.id = NOTICE_ID;
  notice.setAttribute("role", "status");
  notice.textContent = text(language());
  Object.assign(notice.style, {
    position: "fixed",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    zIndex: "10000",
    maxWidth: "min(420px, calc(100vw - 32px))",
    margin: "0",
    padding: "10px 16px",
    borderRadius: "8px",
    background: "#1a1610",
    color: "#f5e6b8",
    font: "15px/1.4 system-ui, sans-serif",
    textAlign: "center",
  });
  document.body.append(notice);
}
