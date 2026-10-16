/**
 * The "loading content" notice shown while an allowlisted account's pack
 * download keeps failing (the app retries until it lands). It can appear before
 * i18n exists, so it carries its own two strings and reads the language the way
 * i18next does (its stored choice, then the browser's).
 */
const TEXT = {
  en: "Loading your content… Folio will keep trying until it arrives.",
  it: "Contenuti in caricamento… Folio continua a riprovare finché non arrivano.",
} as const;

const NOTICE_ID = "folio-pack-waiting";

function language(): keyof typeof TEXT {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("i18nextLng");
  } catch {
    // Private mode can deny storage; the browser language decides.
  }
  return (stored ?? navigator.language).toLowerCase().startsWith("it") ? "it" : "en";
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
  notice.textContent = TEXT[language()];
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
