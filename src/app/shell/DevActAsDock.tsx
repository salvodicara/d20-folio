// DEV-ONLY (remove before release): act-as-member sandbox dock.
/**
 * DevActAsDock — the on-screen control for the `?devActAs=<uid>` emulator sandbox.
 *
 * It surfaces, AT A GLANCE, which member the current window is acting AS (the #1
 * footgun when several windows are open against one Firestore emulator) and lets the
 * owner switch identity — reload THIS window as a member, or open a NEW window as one —
 * sourced from the loaded campaign's `memberDetails` plus a synthetic "You (owner/admin)"
 * entry (the real, un-impersonated admin token).
 *
 * Gated by `import.meta.env.DEV && VITE_USE_EMULATORS` so it appears ONLY in the
 * `pnpm dev:emulators` sandbox: both flags are statically `false`/absent in a production
 * build (and in the dev-bypass e2e build), so the whole component is dead-code-eliminated
 * from the prod bundle and never renders in the locale/a11y sweeps. Mono + amber + a
 * dashed border so it never reads as real product chrome. Plain literal strings (no i18n)
 * are deliberate: this is throwaway dev scaffolding, never shown to a real user.
 *
 * See `dev-impersonate.ts` (the param reader) + `content-pack/scripts/dev-seed-sandbox.ts` (the seed).
 */

import { useState } from "react";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { devActAsUid } from "@/lib/dev-impersonate";

/** Whether this build is the emulator sandbox (both statically false in prod / e2e). */
const SANDBOX = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";

/** Build the current URL with `devActAs` set to `uid` (or removed when `null`). */
function urlForUid(uid: string | null): string {
  const url = new URL(window.location.href);
  if (uid) url.searchParams.set("devActAs", uid);
  else url.searchParams.delete("devActAs");
  return url.toString();
}

interface DockTarget {
  uid: string | null;
  label: string;
  sub: string;
}

export function DevActAsDock() {
  const [open, setOpen] = useState(false);
  const campaign = useCampaignStore((s) => s.campaign);
  if (!SANDBOX) return null;

  const acting = devActAsUid();

  // The synthetic "You" entry (real admin token, no impersonation) + every campaign
  // member from the loaded `memberDetails`. The DM uid appears among the members as an
  // impersonation target distinct from the un-impersonated "You".
  const targets: DockTarget[] = [
    { uid: null, label: "You (owner/admin)", sub: "real token · no impersonation" },
    ...Object.entries(campaign?.memberDetails ?? {}).map(([uid, m]) => ({
      uid,
      label: m.displayName,
      sub: `${m.role} · ${uid}`,
    })),
  ];

  // The at-a-glance current identity: the impersonated member's name, else "You".
  const actingLabel = acting
    ? (campaign?.memberDetails[acting]?.displayName ?? acting)
    : "You (admin)";

  function switchTo(uid: string | null) {
    window.location.assign(urlForUid(uid));
  }
  function openWindow(uid: string | null) {
    window.open(urlForUid(uid), "_blank", "noopener");
  }

  return (
    <div className="fixed bottom-0 left-0 z-[1000] max-w-[min(92vw,360px)] font-mono text-[11px] md:bottom-3 md:left-3">
      <div className="rounded-t-md border border-dashed border-amber-500/70 bg-black/85 text-amber-300 shadow-lg backdrop-blur md:rounded-md">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          aria-expanded={open}
        >
          <span className="truncate">
            <span className="text-amber-500/80">act as ▸ </span>
            <span className="font-bold text-amber-200">{actingLabel}</span>
          </span>
          <span className="shrink-0 text-amber-500/70">{open ? "▼" : "▲"}</span>
        </button>

        {open && (
          <ul className="max-h-[55vh] overflow-auto border-t border-dashed border-amber-500/40 px-1.5 py-1.5">
            {!campaign && (
              <li className="px-2 py-1.5 text-amber-500/70">
                Open a campaign to list its members.
              </li>
            )}
            {targets.map((target) => {
              const isCurrent = acting === target.uid;
              return (
                <li
                  key={target.uid ?? "__you__"}
                  className="flex items-center gap-2 px-1 py-1"
                >
                  <button
                    type="button"
                    onClick={() => switchTo(target.uid)}
                    className={`flex min-w-0 flex-1 flex-col items-start rounded px-2 py-1 text-left hover:bg-amber-500/15 ${
                      isCurrent ? "bg-amber-500/20 ring-1 ring-amber-500/60" : ""
                    }`}
                  >
                    <span className="truncate font-bold text-amber-200">
                      {target.label}
                      {isCurrent ? " ●" : ""}
                    </span>
                    <span className="truncate text-amber-500/70">{target.sub}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openWindow(target.uid)}
                    title="Open in a new window"
                    aria-label={`Open ${target.label} in a new window`}
                    className="shrink-0 rounded border border-dashed border-amber-500/50 px-2 py-1 text-amber-300 hover:bg-amber-500/15"
                  >
                    ↗
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
